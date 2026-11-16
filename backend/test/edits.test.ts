import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fallbackCopy, fitMoments, hashtag, hashtagsFor, timedTranscript } from '../src/ai/copy';
import { buildFilterGraph } from '../src/clipper/filters';
import { assTime, buildAss, groupWords, type Word } from '../src/clipper/overlay';
import { processJob } from '../src/clipper/queue';
import { parseWhisper, sliceWords } from '../src/clipper/transcribe';
import { prisma } from '../src/lib/prisma';
import { ensureStorage } from '../src/lib/storage';
import { checkTools, run, tools } from '../src/lib/tools';
import { app, signUp } from './helpers';

const say = (text: string, from = 0, each = 0.4): Word[] => text.split(' ').map((t, i) => ({ text: t, start: from + i * each, end: from + (i + 1) * each - 0.05 }));

describe('captions', () => {
  it('groups words into short lines, breaking at pauses and sentence ends', () => {
    const words = [...say('this is the craziest heist ever.'), ...say('wait for it', 5)];
    const lines = groupWords(words).map((l) => l.words.map((w) => w.text).join(' '));
    expect(lines).toEqual(['this is the', 'craziest heist', 'ever.', 'wait for it']);
    // A line stays up until the next begins, but not across a long pause
    const g = groupWords(words);
    expect(g[0]!.end).toBeCloseTo(g[1]!.start);
    expect(g[2]!.end).toBeLessThan(4);
  });

  it('writes an ASS file: lit-up words, a hook in a box, a credit', () => {
    const ass = buildAss({ width: 1080, height: 1920, duration: 10, words: say('no way he did that'), style: 'karaoke', hook: 'He {robbed} the bank', credit: 'Streamer\\One' })!;
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('Style: Cap,Inter,84,');
    // The hook: first seconds only, braces (ASS commands) stripped from the text
    expect(ass).toMatch(/Dialogue: 0,0:00:00\.00,0:00:04\.50,Hook,,0,0,0,,\{\\fad\(150,250\)\}He robbed the bank/);
    expect(ass).toMatch(/Dialogue: 0,0:00:00\.00,0:00:10\.00,Credit,,0,0,0,,via StreamerOne/);
    // One event per spoken word, upper case, that word in yellow
    const caps = ass.split('\n').filter((l) => l.includes(',Cap,'));
    expect(caps).toHaveLength(5);
    expect(caps[1]).toContain('NO {\\c&H0000E6FF&}WAY{\\c&H00FFFFFF&} HE');
  });

  it('times captions in the finished clip (speed) and drops what falls outside it', () => {
    const ass = buildAss({ width: 1920, height: 1080, duration: 2, speed: 2, words: [...say('one two', 2), ...say('late', 30)], style: 'bold' })!;
    const caps = ass.split('\n').filter((l) => l.includes(',Cap,'));
    expect(caps).toHaveLength(1);
    expect(caps[0]).toContain('0:00:01.00'); // 2 s in the source is 1 s at 2×
    expect(caps[0]).toContain('ONE TWO');
    expect(buildAss({ width: 100, height: 100, duration: 5 })).toBeNull();
    expect(assTime(3725.5)).toBe('1:02:05.50');
  });

  it('reads every shape of Whisper answer', () => {
    expect(parseWhisper({ words: [{ word: ' hi', start: 0, end: 0.3 }] }, 10)).toEqual([{ text: 'hi', start: 10, end: 10.3 }]);
    expect(parseWhisper({ segments: [{ start: 0, end: 1, text: 'a b', words: [{ word: 'a', start: 0, end: 0.5 }, { word: 'b', start: 0.5, end: 1 }] }] })).toHaveLength(2);
    // No word times: spread over the segment
    expect(parseWhisper({ segments: [{ start: 2, end: 4, text: 'one two' }] })).toEqual([
      { text: 'one', start: 2, end: 3 },
      { text: 'two', start: 3, end: 4 },
    ]);
    expect(sliceWords(say('a b c d', 10, 1), 11, 13).map((w) => [w.text, w.start])).toEqual([['b', 0], ['c', 1]]);
  });

  it('adds the overlay and loudness steps to the filter graph', () => {
    const g = buildFilterGraph({ width: 1920, height: 1080, hasAudio: true }, { aspect: 'phone', fit: 'crop', focus: 'center', quality: '720', fade: true, mute: false, speed: 1.5, normalizeAudio: true }, 30, 'format=yuv420p', 'clip-01.ass');
    expect(g.graph).toMatch(/setpts=PTS\/1\.5,ass=clip-01\.ass,fade=t=in/);
    expect(g.graph).toMatch(/atempo=1\.5,loudnorm=I=-14:TP=-1\.5:LRA=11,afade/);
  });
});

describe('text for posting', () => {
  it('builds hashtags from the topic and the creator', () => {
    expect(hashtag('GTA 6')).toBe('#gta6');
    expect(hashtag('Kai Cenat!')).toBe('#kaicenat');
    expect(hashtag('!')).toBe('');
    expect(hashtagsFor({ videoTitle: 'x', creator: 'Kai Cenat', topic: 'GTA 6', vertical: true })).toEqual(['#gta6', '#kaicenat', '#gaming', '#clips', '#shorts', '#fyp']);
  });

  it('writes a hook, title and caption for every clip without AI', () => {
    const copy = fallbackCopy({ videoTitle: 'First 10 hours of GTA 6', creator: 'StreamerOne', topic: 'GTA 6', vertical: true }, ['This heist went completely wrong. Then the cops came.', '']);
    expect(copy[0]).toMatchObject({ hook: 'This heist went completely wrong.', title: 'First 10 hours of GTA 6 (1)' });
    expect(copy[0]!.caption).toBe('First 10 hours of GTA 6 · part 1\n\n🎥 StreamerOne\n\n#gta6 #streamerone #gaming #clips #shorts #fyp');
    // Nothing said: the video's title is the hook
    expect(copy[1]!.hook).toBe('First 10 hours of GTA 6');
  });

  it('fits chosen moments into the video without overlaps', () => {
    // Best first: 100 (kept), 110 (overlaps), 995 (pulled back to fit), 50 (kept)
    expect(fitMoments([100, 110, 995, 50, NaN], 0, 1000, 30, 3)).toEqual([
      { start: 50, end: 80, score: 88 },
      { start: 100, end: 130, score: 100 },
      { start: 970, end: 1000, score: 94 },
    ]);
    expect(timedTranscript(say('a b c', 0, 5))).toBe('[0:00] a b\n[0:10] c');
  });
});

/* End to end with the real ffmpeg: captions from a stand-in Whisper server, a hook and a credit burned in. */
const status = await checkTools();
const haveFfmpeg = status.ffmpeg.ok && status.ffprobe.ok;
let sample = '';
beforeAll(async () => {
  if (!haveFfmpeg) return;
  ensureStorage();
  sample = path.join(os.tmpdir(), `cliper-edits-${process.pid}.mp4`);
  await run(tools.ffmpeg, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=12', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', sample]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe.skipIf(!haveFfmpeg)('edited clips (real ffmpeg)', () => {
  async function clip(options: Record<string, unknown>) {
    const u = await signUp();
    const up = await request(app).post('/api/v1/jobs/upload').set(u.auth).field('options', JSON.stringify(options)).field('title', 'Heist gone wrong').attach('file', sample, { filename: 'sample.mp4', contentType: 'video/mp4' });
    expect(up.status).toBe(201);
    const id = up.body.job.id as string;
    await prisma.clipJob.update({ where: { id }, data: { status: 'FETCHING', uploader: 'StreamerOne' } });
    await processJob(id, new AbortController().signal);
    return (await request(app).get(`/api/v1/jobs/${id}`).set(u.auth)).body.job;
  }
  const edits = { mode: 'split', segmentSeconds: 6, aspect: 'phone', fit: 'blur', quality: '480', captions: true, hook: 'auto', credit: true, normalizeAudio: true, topic: 'GTA 6' };

  it('burns in captions, hook and credit, and writes the post text', async () => {
    const { env } = await import('../src/config/env');
    (env as { WHISPER_URL: string }).WHISPER_URL = 'http://whisper.test/v1';
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      asked.push(String(url));
      expect((init.body as FormData).get('response_format')).toBe('verbose_json');
      return new Response(JSON.stringify({ words: say('This heist went completely wrong. Run run run').map((w) => ({ word: w.text, start: w.start, end: w.end })) }));
    });
    try {
      const job = await clip(edits);
      expect(job.error).toBeNull();
      expect(job.status).toBe('DONE');
      expect(job.stage).toBe('2 clips ready');
      expect(asked).toEqual(['http://whisper.test/v1/audio/transcriptions', 'http://whisper.test/v1/audio/transcriptions']);
      expect(job.clips[0]).toMatchObject({ title: 'Heist gone wrong (1)', transcript: 'This heist went completely wrong. Run run run' });
      expect(job.clips[0].caption).toContain('🎥 StreamerOne');
      expect(job.clips[0].caption).toContain('#gta6');
      // The overlay files are cleaned up; only clips and thumbnails stay
      const files = await fs.promises.readdir(path.resolve('storage-test', 'jobs', job.id));
      expect(files.filter((f) => /\.(ass|mp3)$/.test(f))).toEqual([]);
    } finally {
      (env as { WHISPER_URL: string }).WHISPER_URL = '';
    }
  });

  it('still delivers the clips when no transcription service is set up', async () => {
    const job = await clip(edits);
    expect(job.status).toBe('DONE');
    expect(job.stage).toBe('2 clips ready · no captions (the transcription service is not set up)');
    // The hook falls back to the video's title, so the clip still gets its text
    expect(job.clips[0].title).toBe('Heist gone wrong (1)');
  });
});
