import fs from 'node:fs';
import path from 'node:path';
import { JobStatus, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { jobDir, toStored } from '../lib/storage';
import { ToolError } from '../lib/tools';
import { queueAutoPublish } from '../social/autopublish';
import { aiAvailable, detectContent, pickMoments, writeCopy } from '../ai/copy';
import { canDrawText, renderParallel } from './encoder';
import { buildAss, type Word } from './overlay';
import { captionsAvailable, sliceWords, transcribe, wordsToText } from './transcribe';
import { loudnessPerSecond, probe, renderClip, thumbnail } from './media';
import { frameSize, optionsSchema } from './options';
import { planSegments, usableWindow, type Segment } from './plan';
import { downloadSource, fetchMeta, ytdlpReason } from './source';

/*
 * The job queue. The database is the queue: a job waits as QUEUED, is claimed atomically, and moves
 * through FETCHING → ANALYZING → RENDERING → DONE (or FAILED / CANCELLED). Jobs that were mid-way when
 * the server stopped are put back in line when it starts again. CLIP_CONCURRENCY jobs run at once.
 */

const running = new Map<string, AbortController>();
let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
let stopping = false;

const ACTIVE: JobStatus[] = [JobStatus.FETCHING, JobStatus.ANALYZING, JobStatus.RENDERING];

export function startQueue() {
  if (env.NODE_ENV === 'test') return;
  stopping = false;
  void prisma.clipJob
    .updateMany({ where: { status: { in: ACTIVE } }, data: { status: JobStatus.QUEUED, progress: 0, stage: 'Waiting (the server restarted)' } })
    .then(() => tick())
    .catch((e) => console.error('[queue] could not recover jobs', e));
  timer = setInterval(() => void tick(), 1500);
}

export async function stopQueue() {
  stopping = true;
  if (timer) clearInterval(timer);
  const ids = [...running.keys()];
  for (const ac of running.values()) ac.abort();
  // Picked up again on the next start
  if (ids.length) await prisma.clipJob.updateMany({ where: { id: { in: ids }, status: { in: ACTIVE } }, data: { status: JobStatus.QUEUED, stage: 'Waiting (the server restarted)' } }).catch(() => undefined);
}

/** Wake the queue now (a job was just added). */
export const nudgeQueue = () => void tick();

/** Stop a running job's tools straight away (the route has already marked it CANCELLED). */
export const abortJob = (id: string) => running.get(id)?.abort();

export const queueStats = () => ({ running: running.size, concurrency: env.CLIP_CONCURRENCY });

async function tick() {
  // Tests drive jobs by hand (processJob), so the queue never picks them up behind their back
  if (ticking || stopping || env.NODE_ENV === 'test') return;
  ticking = true;
  try {
    while (running.size < env.CLIP_CONCURRENCY && !stopping) {
      const next = await prisma.clipJob.findFirst({ where: { status: JobStatus.QUEUED }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      if (!next) break;
      const claimed = await prisma.clipJob.updateMany({
        where: { id: next.id, status: JobStatus.QUEUED },
        data: { status: JobStatus.FETCHING, startedAt: new Date(), finishedAt: null, progress: 0, stage: 'Starting', error: null },
      });
      if (!claimed.count) continue;
      const ac = new AbortController();
      running.set(next.id, ac);
      void processJob(next.id, ac.signal).finally(() => {
        running.delete(next.id);
        void tick();
      });
    }
  } catch (e) {
    console.error('[queue] tick failed', e);
  } finally {
    ticking = false;
  }
}

class Cancelled extends Error {}

/** Writes progress at most a few times a second; stops the job if it was cancelled or deleted. */
function reporter(id: string, ac: AbortSignal) {
  let lastAt = 0;
  let lastStage = '';
  return async (status: JobStatus, progress: number, stage: string, force = false) => {
    if (ac.aborted) throw new Cancelled();
    const now = Date.now();
    if (!force && stage === lastStage && now - lastAt < 800) return;
    lastAt = now;
    lastStage = stage;
    const r = await prisma.clipJob.updateMany({
      where: { id, status: { in: ACTIVE } },
      data: { status, progress: Math.max(0, Math.min(99, Math.round(progress))), stage },
    });
    if (!r.count) throw new Cancelled();
  };
}

/** Runs one claimed job (status FETCHING) to the end. Exported for the tests. */
export async function processJob(id: string, signal: AbortSignal) {
  const report = reporter(id, signal);
  // Progress callbacks fire from tool output: fire-and-forget, errors surface on the next forced report
  const soft = (status: JobStatus, pct: number, stage: string) => void report(status, pct, stage).catch(() => undefined);
  const dir = jobDir(id);
  let sourceFile: string | null = null;
  try {
    const job = await prisma.clipJob.findUniqueOrThrow({ where: { id } });
    const o = optionsSchema.parse(job.options);

    // A retry starts from a clean slate (but keeps an uploaded source)
    await prisma.clip.deleteMany({ where: { jobId: id } });
    await fs.promises.mkdir(dir, { recursive: true });
    for (const f of await fs.promises.readdir(dir)) if (/^(clip-\d+\.(mp4|jpg|ass)|speech-.*\.mp3)$/.test(f)) await fs.promises.rm(path.join(dir, f), { force: true });

    // ── 1. Source ──
    const fetchShare = job.sourceKind === 'URL' ? 35 : 3;
    let isLive = false;
    if (job.sourceKind === 'URL') {
      await report(JobStatus.FETCHING, 1, 'Reading the link', true);
      const meta = await fetchMeta(job.sourceUrl!, signal);
      isLive = Boolean(meta.isLive);
      if (meta.duration && meta.duration > env.MAX_SOURCE_MINUTES * 60) throw new Error(`This video is longer than ${env.MAX_SOURCE_MINUTES} minutes`);
      await prisma.clipJob.update({
        where: { id },
        data: { title: job.title ?? meta.title, uploader: meta.uploader ?? job.uploader, thumbnailUrl: job.thumbnailUrl ?? meta.thumbnail, sourceDuration: meta.duration },
      });
      await report(JobStatus.FETCHING, 3, 'Downloading the video', true);
      const maxHeight = Math.max(Number(o.quality), 720);
      sourceFile = await downloadSource(job.sourceUrl!, dir, maxHeight, (f) => soft(JobStatus.FETCHING, 3 + f * (fetchShare - 3), `Downloading the video · ${Math.round(f * 100)}%`), signal);
    } else {
      const name = (await fs.promises.readdir(dir)).find((f) => f.startsWith('source.'));
      if (!name) throw new Error('The uploaded file is no longer on the server. Upload it again.');
      sourceFile = path.join(dir, name);
    }

    // ── 2. Read the video ──
    await report(JobStatus.ANALYZING, fetchShare, 'Reading the video', true);
    const info = await probe(sourceFile, signal);
    if (info.duration > env.MAX_SOURCE_MINUTES * 60 + 1) throw new Error(`This video is longer than ${env.MAX_SOURCE_MINUTES} minutes`);
    await prisma.clipJob.update({ where: { id }, data: { sourceDuration: info.duration, sourceWidth: info.width, sourceHeight: info.height } });

    // ── 3. Plan the clips ──
    const fresh = await prisma.clipJob.findUniqueOrThrow({ where: { id }, select: { title: true, uploader: true, sourceName: true } });
    const videoTitle = fresh.title ?? fresh.sourceName ?? 'Video';
    const creator = fresh.uploader;
    const notes: string[] = [];
    const wantWords = !isLive && (o.captions || o.hook === 'auto' || Boolean(o.aiDetectContent)) && info.hasAudio;
    const analyseShare = (o.mode === 'highlights' || Boolean(o.aiDetectContent)) ? 12 : 0;
    const wordShare = wantWords ? 10 : 0;
    const base = fetchShare + analyseShare + wordShare;

    let segments: Segment[] | null = null;
    /** Every word of the video (only when the moments are chosen from what is said). */
    let allWords: Word[] | null = null;
    // Reuse a transcription we already did for this video (skip re-transcribing)
    const stored = (job.options as { transcriptWords?: Word[] }).transcriptWords;
    if (stored?.length) allWords = stored;

    // ── AI content detection: find moments matching what the person asked for ──
    if (o.aiDetectContent && info.hasAudio) {
      if (!captionsAvailable() || !aiAvailable()) {
        notes.push(`content detection skipped (needs transcription service and AI key)`);
      } else {
        const { from, to } = usableWindow(info.duration, o);
        const seconds = Math.min(o.segmentSeconds, to - from);
        const count = Math.max(1, Math.min(o.maxClips, Math.floor((to - from) / seconds)));
        await report(JobStatus.ANALYZING, fetchShare, 'Listening to the whole video', true);
        try {
          allWords = (await transcribe(sourceFile, from, to - from, dir, 'all', signal, (f) => soft(JobStatus.ANALYZING, fetchShare + f * 12 * 0.8, `Listening to the whole video · ${Math.round(f * 100)}%`))).map((w) => ({
            ...w,
            start: w.start + from,
            end: w.end + from,
          }));
          await prisma.clipJob.update({ where: { id }, data: { options: { ...(job.options as Prisma.JsonObject), transcriptWords: allWords } as unknown as Prisma.InputJsonValue } });
          await report(JobStatus.ANALYZING, fetchShare + 12 * 0.8, `Finding: ${o.aiDetectContent}`, true);
          segments = await detectContent(allWords, { from, to, seconds, count, videoTitle, topic: o.topic ?? null, lookingFor: o.aiDetectContent }, signal);
          if (!segments) notes.push(`could not find: ${o.aiDetectContent} (the AI could not match them)`);
        } catch (e) {
          if (signal.aborted) throw e;
          notes.push(`content detection failed (${e instanceof Error ? e.message : 'transcription failed'})`);
        }
      }
    }

    if (!segments && o.mode === 'highlights' && o.aiPick && info.hasAudio) {
      if (!captionsAvailable() || !aiAvailable()) notes.push('moments chosen by loudness (choosing by what is said needs the transcription service and the AI key)');
      else {
        const { from, to } = usableWindow(info.duration, o);
        await report(JobStatus.ANALYZING, fetchShare, 'Listening to the whole video', true);
        try {
          allWords = (await transcribe(sourceFile, from, to - from, dir, 'all', signal, (f) => soft(JobStatus.ANALYZING, fetchShare + f * analyseShare * 0.8, `Listening to the whole video · ${Math.round(f * 100)}%`))).map((w) => ({
            ...w,
            start: w.start + from,
            end: w.end + from,
          }));
          await prisma.clipJob.update({ where: { id }, data: { options: { ...(job.options as Prisma.JsonObject), transcriptWords: allWords } as unknown as Prisma.InputJsonValue } });
          await report(JobStatus.ANALYZING, fetchShare + analyseShare * 0.8, 'Choosing the best moments', true);
          const seconds = Math.min(o.segmentSeconds, to - from);
          segments = await pickMoments(allWords, { from, to, seconds, count: Math.max(1, Math.min(o.maxClips, Math.floor((to - from) / seconds))), videoTitle, topic: o.topic ?? null }, signal);
          if (!segments) notes.push('moments chosen by loudness (the AI could not choose them)');
        } catch (e) {
          if (signal.aborted) throw e;
          notes.push(`moments chosen by loudness (${e instanceof Error ? e.message : 'transcription failed'})`);
        }
      }
    }
    if (!segments) {
      let loudness: number[] = [];
      if (o.mode === 'highlights' && info.hasAudio) {
        await report(JobStatus.ANALYZING, fetchShare, 'Finding the best moments', true);
        loudness = await loudnessPerSecond(sourceFile, info.duration, (f) => soft(JobStatus.ANALYZING, fetchShare + f * analyseShare, `Finding the best moments · ${Math.round(f * 100)}%`), signal);
      }
      segments = planSegments(info.duration, o, loudness);
    }
    segments = segments.slice(0, env.MAX_CLIPS_PER_JOB);
    if (!segments.length) throw new Error('Nothing to clip: check the start / end times and ranges against the video length');

    // ── 3b. What is said in each clip (captions, and material for the titles) ──
    const words: Word[][] = segments.map(() => []);
    if (wantWords) {
      if (allWords) segments.forEach((seg, i) => (words[i] = sliceWords(allWords!, seg.start, seg.end)));
      else if (!captionsAvailable()) notes.push('no captions (the transcription service is not set up)');
      else {
        await report(JobStatus.ANALYZING, fetchShare + analyseShare, 'Writing the captions', true);
        try {
          for (let i = 0; i < segments.length; i++) {
            const seg = segments[i]!;
            words[i] = await transcribe(sourceFile, seg.start, seg.end - seg.start, dir, String(i + 1), signal);
            soft(JobStatus.ANALYZING, fetchShare + analyseShare + ((i + 1) / segments.length) * wordShare, `Writing the captions · clip ${i + 1} of ${segments.length}`);
          }
        } catch (e) {
          if (signal.aborted) throw e;
          notes.push(`no captions (${e instanceof Error ? e.message : 'transcription failed'})`);
        }
      }
    }
    const transcripts = words.map(wordsToText);
    if (!canDrawText() && (o.captions || o.hook !== 'none' || o.credit)) notes.push('no text on the clips (this ffmpeg was built without libass)');

    // ── 3c. The text that goes with each clip: hook, post title, caption with credit and hashtags ──
    const tall = frameSize(o.aspect, o.quality, info).height > frameSize(o.aspect, o.quality, info).width;
    const written = await writeCopy({ videoTitle, creator, topic: o.topic ?? null, vertical: tall }, transcripts, signal);
    if (written.note) notes.push(`titles built from the video's title (${written.note})`);
    const copy = written.copy;

    // ── 4. Render ── several clips at once on bigger machines (see encoder.ts)
    const total = segments.length;
    const fractions = new Array<number>(total).fill(0);
    let finished = 0;
    const overall = () => base + (fractions.reduce((a, b) => a + b, 0) / total) * (99 - base);
    const label = () => (finished >= total ? 'Finishing' : `Rendering clip ${Math.min(total, finished + 1)} of ${total}`);
    await report(JobStatus.RENDERING, base, label(), true);

    const renderOne = async (i: number) => {
      const seg = segments[i]!;
      const n = String(i + 1).padStart(2, '0');
      const out = path.join(dir, `clip-${n}.mp4`);
      // Captions, title and credit, drawn by ffmpeg from a subtitle file next to the clip
      const size = frameSize(o.aspect, o.quality, info);
      const ass = !canDrawText() ? null : buildAss({
        width: size.width,
        height: size.height,
        duration: (seg.end - seg.start) / o.speed,
        speed: o.speed,
        words: o.captions ? words[i] : [],
        style: o.captionStyle,
        hook: o.hook === 'custom' ? o.hookText : o.hook === 'auto' ? copy[i]?.hook : null,
        credit: o.credit ? creator : null,
        font: env.CAPTION_FONT,
      });
      const overlay = ass ? path.join(dir, `clip-${n}.ass`) : undefined;
      if (overlay) await fs.promises.writeFile(overlay, ass!);
      const r = await renderClip(
        sourceFile!,
        info,
        seg,
        o,
        out,
        (f) => {
          fractions[i] = f;
          soft(JobStatus.RENDERING, overall(), `${label()} · ${Math.round(((overall() - base) / (99 - base)) * 100)}%`);
        },
        signal,
        overlay,
      );
      if (overlay) await fs.promises.rm(overlay, { force: true });
      const thumb = path.join(dir, `clip-${n}.jpg`);
      const hasThumb = await thumbnail(out, r.duration, thumb, signal).then(
        () => true,
        () => false,
      );
      await prisma.clip.create({
        data: {
          jobId: id,
          index: i + 1,
          startSec: seg.start,
          endSec: seg.end,
          duration: r.duration,
          width: r.width,
          height: r.height,
          sizeBytes: r.sizeBytes,
          score: seg.score ?? null,
          title: copy[i]?.title ?? null,
          caption: copy[i]?.caption ?? null,
          transcript: transcripts[i] || null,
          file: toStored(out),
          thumb: hasThumb ? toStored(thumb) : null,
        },
      });
      fractions[i] = 1;
      finished += 1;
      // Each finished clip shows up in the app straight away
      await report(JobStatus.RENDERING, overall(), label(), true);
    };

    // A small pool: each worker takes the next clip until none are left; the first failure stops them all
    let nextIndex = 0;
    let failure: unknown = null;
    const worker = async () => {
      while (failure === null && nextIndex < total) {
        const i = nextIndex++;
        try {
          await renderOne(i);
        } catch (e) {
          failure ??= e;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(renderParallel(), total) }, worker));
    if (failure !== null) throw failure;

    await prisma.clipJob.update({
      where: { id },
      data: { status: JobStatus.DONE, progress: 100, stage: `${segments.length} clip${segments.length === 1 ? '' : 's'} ready${notes.length ? ` · ${notes.join(' · ')}` : ''}`.slice(0, 480), finishedAt: new Date() },
    });
    // A link can be fetched again; an upload cannot, so its source is kept (until the job is deleted)
    if (job.sourceKind === 'URL' && !env.KEEP_SOURCE && sourceFile) await fs.promises.rm(sourceFile, { force: true });
    // "Post automatically": queue every clip for the chosen accounts
    if (job.autoPublish) await queueAutoPublish(id).catch((e) => console.error(`[queue] could not queue the posts of job ${id}`, e));
  } catch (err) {
    if (err instanceof Cancelled || signal.aborted) return; // cancelled, deleted, or the server is stopping
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return; // deleted
    const message = friendly(err);
    console.warn(`[queue] job ${id} failed: ${message}`);
    await prisma.clipJob
      .updateMany({ where: { id, status: { in: ACTIVE } }, data: { status: JobStatus.FAILED, error: message, stage: 'Failed', finishedAt: new Date() } })
      .catch(() => undefined);
  }
}

function friendly(err: unknown): string {
  if (err instanceof ToolError) {
    if (/Could not start/.test(err.message)) return `${err.message}. The video tools are not installed on the server (see README → Video tools).`;
    if (/yt-dlp/i.test(err.message)) return ytdlpReason(err);
    const last = err.stderr
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    return last ? `Video processing failed: ${last}` : err.message;
  }
  if (err instanceof Error && err.name === 'ZodError') return 'This job has invalid options';
  return err instanceof Error ? err.message : 'Something went wrong while clipping';
}
