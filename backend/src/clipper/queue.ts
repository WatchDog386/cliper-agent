import fs from 'node:fs';
import path from 'node:path';
import { JobStatus, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { jobDir, resolveStored, toStored } from '../lib/storage';
import { ToolError } from '../lib/tools';
import { loudnessPerSecond, probe, renderClip, thumbnail } from './media';
import { optionsSchema } from './options';
import { planSegments } from './plan';
import { downloadSource, fetchMeta, ytdlpReason } from './source';
import { createProject, downloadClip, OpusError, waitForClips } from './opus';

/*
 * The job queue. The database is the queue: a job waits as QUEUED, is claimed atomically, and moves
 * through FETCHING → ANALYZING → RENDERING → DONE (or FAILED / CANCELLED). Jobs that were mid-way when
 * the server stopped are put back in line when it starts again. CLIP_CONCURRENCY jobs run at once.
 */

const running = new Map<string, AbortController>();
let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
let stopping = false;
/** Only a started queue claims jobs (tests and one-off scripts call processJob themselves). */
let started = false;

const ACTIVE: JobStatus[] = [JobStatus.FETCHING, JobStatus.ANALYZING, JobStatus.RENDERING];

export function startQueue() {
  if (env.NODE_ENV === 'test') return;
  started = true;
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
  if (ticking || stopping || !started) return;
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
    for (const f of await fs.promises.readdir(dir)) if (/^clip-\d+\.(mp4|jpg)$/.test(f)) await fs.promises.rm(path.join(dir, f), { force: true });

    if (o.mode === 'ai') {
      await processAiJob(id, job, o, report, soft, signal);
      return;
    }

    // ── 1. Source ──
    const fetchShare = job.sourceKind === 'URL' ? 35 : 3;
    if (job.sourceKind === 'URL') {
      await report(JobStatus.FETCHING, 1, 'Reading the link', true);
      const meta = await fetchMeta(job.sourceUrl!, signal);
      if (meta.isLive) throw new Error('Live streams cannot be clipped until they have ended');
      if (meta.duration && meta.duration > env.MAX_SOURCE_MINUTES * 60) throw new Error(`This video is longer than ${env.MAX_SOURCE_MINUTES} minutes`);
      await prisma.clipJob.update({
        where: { id },
        data: { title: job.title ?? meta.title, uploader: meta.uploader, thumbnailUrl: job.thumbnailUrl ?? meta.thumbnail, sourceDuration: meta.duration },
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
    let loudness: number[] = [];
    const analyseShare = o.mode === 'highlights' ? 12 : 0;
    if (o.mode === 'highlights' && info.hasAudio) {
      await report(JobStatus.ANALYZING, fetchShare, 'Finding the best moments', true);
      loudness = await loudnessPerSecond(sourceFile, info.duration, (f) => soft(JobStatus.ANALYZING, fetchShare + f * analyseShare, `Finding the best moments · ${Math.round(f * 100)}%`), signal);
    }
    const segments = planSegments(info.duration, o, loudness).slice(0, env.MAX_CLIPS_PER_JOB);
    if (!segments.length) throw new Error('Nothing to clip: check the start / end times and ranges against the video length');

    // ── 4. Render ──
    const logo = await brandLogo(job.userId, o.brandKitId);
    const base = fetchShare + analyseShare;
    const each = (99 - base) / segments.length;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const n = String(i + 1).padStart(2, '0');
      const label = `Rendering clip ${i + 1} of ${segments.length}`;
      await report(JobStatus.RENDERING, base + i * each, label, true);
      const out = path.join(dir, `clip-${n}.mp4`);
      const r = await renderClip(sourceFile, info, seg, o, out, (f) => soft(JobStatus.RENDERING, base + (i + f) * each, `${label} · ${Math.round(f * 100)}%`), signal, logo);
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
          file: toStored(out),
          thumb: hasThumb ? toStored(thumb) : null,
        },
      });
    }

    await prisma.clipJob.update({
      where: { id },
      data: { status: JobStatus.DONE, progress: 100, stage: `${segments.length} clip${segments.length === 1 ? '' : 's'} ready`, finishedAt: new Date() },
    });
    // A link can be fetched again; an upload cannot, so its source is kept (until the job is deleted)
    if (job.sourceKind === 'URL' && !env.KEEP_SOURCE && sourceFile) await fs.promises.rm(sourceFile, { force: true });
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

/** The logo of the job's brand kit, if it has one that is still there (a deleted kit is skipped). */
async function brandLogo(userId: string, kitId?: string) {
  if (!kitId) return undefined;
  const kit = await prisma.brandKit.findFirst({ where: { id: kitId, userId } });
  if (!kit?.logo) return undefined;
  const file = resolveStored(kit.logo);
  if (!(await fs.promises.stat(file).catch(() => null))) return undefined;
  const position = (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).find((p) => p === kit.logoPosition) ?? 'top-right';
  return { file, position, size: kit.logoSize, opacity: kit.logoOpacity };
}

/**
 * AI clips: OpusClip finds the viral moments, renders captioned vertical clips and writes a headline,
 * caption and hashtags for each. We keep a copy of every clip (so downloads, the zip and retention work
 * like any other job) plus a thumbnail.
 */
async function processAiJob(
  id: string,
  job: { sourceKind: string; sourceUrl: string | null; title: string | null; externalId: string | null },
  o: ReturnType<typeof optionsSchema.parse>,
  report: ReturnType<typeof reporter>,
  soft: (status: JobStatus, pct: number, stage: string) => void,
  signal: AbortSignal,
) {
  if (job.sourceKind !== 'URL' || !job.sourceUrl) throw new Error('AI clips need a video link (uploads are clipped with the other modes)');
  const dir = jobDir(id);
  // A retry of a project that OpusClip already finished re-uses it instead of paying again
  let projectId = job.externalId;
  if (!projectId) {
    await report(JobStatus.FETCHING, 2, 'Sending the video to OpusClip AI', true);
    projectId = await createProject(job.sourceUrl, o, job.title, signal);
    await prisma.clipJob.update({ where: { id }, data: { externalId: projectId } });
  }
  await report(JobStatus.ANALYZING, 5, 'AI is watching the video for viral moments', true);
  const clips = await waitForClips(
    projectId,
    ({ elapsedMin, percent, detail }) => {
      // Without a reported percentage, creep towards 70% over about 30 minutes
      const pct = percent !== undefined ? 5 + percent * 0.65 : 5 + 65 * (1 - Math.exp(-elapsedMin / 12));
      const step = detail && !/^\s*$/.test(detail) ? ` · ${detail.toLowerCase()}` : '';
      soft(JobStatus.ANALYZING, pct, `AI is finding viral moments${step} · ${Math.max(1, Math.round(elapsedMin))} min`);
    },
    signal,
  );
  const picked = clips.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, Math.min(o.maxClips, env.MAX_CLIPS_PER_JOB));
  // Best first: clip 1 is the highest-scoring one
  const each = 29 / picked.length;
  for (let i = 0; i < picked.length; i++) {
    const c = picked[i]!;
    const n = String(i + 1).padStart(2, '0');
    await report(JobStatus.RENDERING, 70 + i * each, `Saving AI clip ${i + 1} of ${picked.length}`, true);
    const out = path.join(dir, `clip-${n}.mp4`);
    await downloadClip(c.url, out, signal);
    const info = await probe(out, signal);
    const size = (await fs.promises.stat(out)).size;
    const thumb = path.join(dir, `clip-${n}.jpg`);
    const hasThumb = await thumbnail(out, info.duration, thumb, signal).then(
      () => true,
      () => false,
    );
    const start = c.startSec ?? 0;
    await prisma.clip.create({
      data: {
        jobId: id,
        index: i + 1,
        startSec: start,
        endSec: c.endSec ?? start + info.duration,
        duration: info.duration,
        width: info.width,
        height: info.height,
        sizeBytes: size,
        score: c.score,
        title: c.title?.slice(0, 300) ?? null,
        description: c.description?.slice(0, 4000) ?? null,
        hashtags: c.hashtags?.slice(0, 1000) ?? null,
        file: toStored(out),
        thumb: hasThumb ? toStored(thumb) : null,
      },
    });
  }
  await prisma.clipJob.update({
    where: { id },
    data: { status: JobStatus.DONE, progress: 100, stage: `${picked.length} AI clip${picked.length === 1 ? '' : 's'} ready`, finishedAt: new Date() },
  });
}

function friendly(err: unknown): string {
  if (err instanceof OpusError) return err.message;
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
