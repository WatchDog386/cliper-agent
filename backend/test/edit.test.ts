import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import { checkTools, run, tools } from '../src/lib/tools';
import { ensureStorage } from '../src/lib/storage';
import { processJob } from '../src/clipper/queue';
import { probe } from '../src/clipper/media';
import { buildFilterGraph } from '../src/clipper/filters';
import { buildAss, hookLine, keepIntervals, remapTime, sentences, snapToSentences, type Word } from '../src/clipper/edit';
import { app, signUp } from './helpers';

const status = await checkTools();
const haveFfmpeg = status.ffmpeg.ok && status.ffprobe.ok;
const tmp = (n: string) => path.join(os.tmpdir(), `cliper-edit-${process.pid}-${n}`);

/** "one two. three four five? six" spoken from t=1, 0.4 s a word */
const WORDS: Word[] = ['Nobody', 'tells', 'you', 'this.', 'The', 'first', 'rule', 'is', 'simple.', 'Start', 'today!'].map((text, i) => ({ start: 1 + i * 0.5, end: 1.4 + i * 0.5, text }));

describe('auto-edit planning', () => {
  it('cuts long silences but keeps a little air around words', () => {
    const keep = keepIntervals(10, 30, [[14, 17], [20, 20.2], [25, 40]]);
    expect(keep[0]).toEqual([0, expect.closeTo(4.12, 2)]);
    expect(keep[1]![0]).toBeCloseTo(6.88, 2);
    expect(keep.length).toBe(2); // the 0.2 s gap is too short to cut; the tail silence is trimmed
    expect(keepIntervals(0, 10, [[0.5, 9.5]])).toEqual([[0, 10]]); // would leave too little: no cut
  });

  it('maps clip times through cuts and speed', () => {
    const keep: [number, number][] = [[0, 4], [7, 10]];
    expect(remapTime(2, keep, 1)).toBe(2);
    expect(remapTime(5, keep, 1)).toBeNull();
    expect(remapTime(8, keep, 2)).toBe(2.5);
  });

  it('finds sentences and snaps clip edges to them', () => {
    expect(sentences(WORDS).map((s) => s.text)).toEqual(['Nobody tells you this.', 'The first rule is simple.', 'Start today!']);
    // Starts mid-"this.", ends mid-"Start": moves to "The" and to the end of "today!"
    const [s] = snapToSentences([{ start: 2.6, end: 6.2 }], WORDS, 60);
    expect(s!.start).toBeCloseTo(2.9, 2);
    expect(s!.end).toBeCloseTo(6.65, 2);
    // Far from any sentence edge: left alone (apart from the air after it)
    const [far] = snapToSentences([{ start: 30, end: 60 }], WORDS, 100);
    expect(far!.start).toBeCloseTo(29.9, 2);
    expect(hookLine(WORDS, 'x')).toBe('Nobody tells you this.');
  });

  it('writes karaoke captions with the spoken word highlighted, and a hook', () => {
    const ass = buildAss({ width: 1080, height: 1920, words: WORDS.slice(0, 3), style: 'karaoke', highlight: '#C8FF2E', hook: 'Nobody tells you this' });
    expect(ass).toContain('PlayResY: 1920');
    expect(ass).toContain('Style: Hook');
    expect(ass).toContain('{\\c&H2EFFC8&\\fscx112\\fscy112}NOBODY');
    expect(ass.match(/^Dialogue: 0/gm)).toHaveLength(3); // one event per word
    const clean = buildAss({ width: 1920, height: 1080, words: WORDS.slice(0, 3), style: 'clean', highlight: '#FFFFFF' });
    expect(clean.match(/^Dialogue: 0/gm)).toHaveLength(1);
  });

  it('chains cuts, zoom, captions and a progress bar in the filter graph', () => {
    const g = buildFilterGraph(
      { width: 1920, height: 1080, hasAudio: true },
      { aspect: 'phone', fit: 'crop', focus: 'center', quality: '720', fade: false, mute: false, speed: 1 },
      20,
      undefined,
      { keep: [[0, 5], [8, 20]], zoom: true, ass: '/tmp/a b.ass', bar: '#C8FF2E', enhanceAudio: true },
    );
    expect(g.outDuration).toBe(17);
    expect(g.graph).toContain('concat=n=2:v=1:a=1[cv][ca]');
    expect(g.graph).toContain("eval=frame,crop=720:1280");
    expect(g.graph).toContain("ass=filename='/tmp/a b.ass':fontsdir=");
    expect(g.graph).toContain('color=c=0xC8FF2E');
    expect(g.graph).toContain('loudnorm=I=-14');
    expect(g.graph.endsWith('[a]')).toBe(true);
  });
});

describe.skipIf(!haveFfmpeg)('auto-edit render (real ffmpeg)', () => {
  let src = '';
  let fake = '';
  beforeAll(async () => {
    ensureStorage();
    src = tmp('talk.mp4');
    // 16 s of dark grey with a tone that falls silent from 5 s to 9 s
    await run(tools.ffmpeg, [
      '-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=0x202020:s=640x360:r=25:d=16', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=16',
      '-filter_complex', "[1:a]volume='if(between(t,5,9),0,1)':eval=frame[a]", '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', src,
    ]);
    // A stand-in transcriber with the same output format as scripts/transcribe.py
    fake = tmp('fake-whisper.mjs');
    fs.writeFileSync(fake, `process.stderr.write('PROGRESS 1\\n'); console.log(JSON.stringify({ language: 'en', words: ${JSON.stringify(WORDS.map((w) => ({ s: w.start, e: w.end, w: w.text })))} }));`);
  });

  it('renders captions, hook, jump cuts, zoom, clean sound and a progress bar', async () => {
    const before = env.WHISPER_CMD;
    env.WHISPER_CMD = `${process.execPath} ${fake}`;
    try {
      const u = await signUp();
      const options = { mode: 'split', segmentSeconds: 16, aspect: 'phone', fit: 'blur', quality: '480', autoEdit: { captions: true, hook: true, smartCuts: false, removeSilence: true, zoom: true, enhanceAudio: true, progressBar: true } };
      const up = await request(app).post('/api/v1/jobs/upload').set(u.auth).field('options', JSON.stringify(options)).attach('file', src, { filename: 'talk.mp4', contentType: 'video/mp4' });
      const id = up.body.job.id as string;
      await prisma.clipJob.update({ where: { id }, data: { status: 'FETCHING' } });
      await processJob(id, new AbortController().signal);
      const job = (await request(app).get(`/api/v1/jobs/${id}`).set(u.auth)).body.job;
      expect(job.error).toBeNull();
      expect(job.status).toBe('DONE');
      const clip = await prisma.clip.findFirstOrThrow({ where: { jobId: id } });
      const file = path.resolve('storage-test', clip.file);
      const info = await probe(file);
      // About 4 s of silence were cut from 16 s
      expect(info.duration).toBeLessThan(13.5);
      expect(info.duration).toBeGreaterThan(11);
      expect(fs.readdirSync(path.dirname(file)).some((f) => f.endsWith('.ass'))).toBe(false);
      // At 1.2 s the caption "NOBODY" is on screen in lime: count lime pixels in the lower half
      const raw = tmp('frame.rgb');
      await run(tools.ffmpeg, ['-hide_banner', '-y', '-ss', '1.25', '-i', file, '-frames:v', '1', '-vf', 'crop=iw:ih/2:0:ih/2', '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
      const px = fs.readFileSync(raw);
      let lime = 0;
      for (let i = 0; i < px.length; i += 3) if (px[i]! > 150 && px[i + 1]! > 200 && px[i + 2]! < 120) lime++;
      expect(lime).toBeGreaterThan(200);
    } finally {
      env.WHISPER_CMD = before;
    }
  });
});
