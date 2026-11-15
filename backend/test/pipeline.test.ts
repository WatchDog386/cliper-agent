import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { checkTools, run, tools } from '../src/lib/tools';
import { ensureStorage } from '../src/lib/storage';
import { processJob } from '../src/clipper/queue';
import { probe } from '../src/clipper/media';
import { app, signUp } from './helpers';

/*
 * End to end with the real ffmpeg: a generated 50-second landscape video (test pattern + a tone that
 * gets loud between 30 s and 38 s) is uploaded and clipped for phone, desktop and highlights.
 * Skipped when ffmpeg is not installed.
 */
const status = await checkTools();
const haveFfmpeg = status.ffmpeg.ok && status.ffprobe.ok;

let sample = '';
beforeAll(async () => {
  if (!haveFfmpeg) return;
  ensureStorage();
  sample = path.join(os.tmpdir(), `cliper-sample-${process.pid}.mp4`);
  await run(tools.ffmpeg, [
    '-hide_banner', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=50',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=50',
    '-filter_complex', "[1:a]volume='if(between(t,30,38),1,0.02)':eval=frame[a]",
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', sample,
  ]);
});

async function clipUpload(options: Record<string, unknown>) {
  const u = await signUp();
  const up = await request(app).post('/api/v1/jobs/upload').set(u.auth).field('options', JSON.stringify(options)).attach('file', sample, { filename: 'sample.mp4', contentType: 'video/mp4' });
  expect(up.status).toBe(201);
  const id = up.body.job.id as string;
  await prisma.clipJob.update({ where: { id }, data: { status: 'FETCHING' } });
  await processJob(id, new AbortController().signal);
  const job = await request(app).get(`/api/v1/jobs/${id}`).set(u.auth);
  return job.body.job;
}

describe.skipIf(!haveFfmpeg)('pipeline (real ffmpeg)', () => {
  it('splits into phone-view clips with a blurred background', async () => {
    const job = await clipUpload({ mode: 'split', segmentSeconds: 20, aspect: 'phone', fit: 'blur', quality: '480', fade: true });
    expect(job.error).toBeNull();
    expect(job.status).toBe('DONE');
    // 50 s at 20 s: 0–20, 20–40, 40–50 (10 s ≥ a third of 20, kept)
    expect(job.clips.map((c: { startSec: number; endSec: number }) => [c.startSec, c.endSec])).toEqual([
      [0, 20],
      [20, 40],
      [40, 50],
    ]);
    const first = await prisma.clip.findFirstOrThrow({ where: { jobId: job.id, index: 1 } });
    const info = await probe(path.resolve('storage-test', first.file));
    expect([info.width, info.height]).toEqual([480, 854]);
    expect(info.duration).toBeGreaterThan(19.5);
    expect(info.duration).toBeLessThan(20.5);
    expect(info.hasAudio).toBe(true);

    // Streams with range support, thumbnails and the zip
    const video = await request(app).get(`/api/v1${job.clips[0].videoUrl}`).set('Range', 'bytes=0-99');
    expect(video.status).toBe(206);
    expect((await request(app).get(`/api/v1${job.clips[0].thumbUrl}`)).headers['content-type']).toContain('image/jpeg');
    const dl = await request(app).get(`/api/v1${job.clips[0].downloadUrl}`);
    expect(dl.headers['content-disposition']).toContain('sample-clip-01-9x16.mp4');
    const zip = await request(app).get(`/api/v1${job.zipUrl}`).buffer(true);
    expect(zip.status).toBe(200);
    expect(zip.headers['content-type']).toContain('zip');
  });

  it('renders desktop view, muted and sped up', async () => {
    const job = await clipUpload({ mode: 'custom', ranges: [{ start: 5, end: 15 }], aspect: 'desktop', fit: 'pad', quality: '720', mute: true, speed: 2 });
    expect(job.status).toBe('DONE');
    const c = await prisma.clip.findFirstOrThrow({ where: { jobId: job.id } });
    const info = await probe(path.resolve('storage-test', c.file));
    expect([info.width, info.height]).toEqual([1280, 720]);
    expect(info.hasAudio).toBe(false);
    expect(info.duration).toBeGreaterThan(4.5);
    expect(info.duration).toBeLessThan(5.5);
  });

  it('finds the loud moment in highlights mode', async () => {
    const job = await clipUpload({ mode: 'highlights', segmentSeconds: 8, maxClips: 1, aspect: 'square', fit: 'crop', quality: '480' });
    expect(job.status).toBe('DONE');
    expect(job.clips).toHaveLength(1);
    expect(job.clips[0].startSec).toBeGreaterThanOrEqual(29);
    expect(job.clips[0].startSec).toBeLessThanOrEqual(31);
  });

  it('cleans up after itself', () => {
    if (sample) fs.rmSync(sample, { force: true });
  });
});
