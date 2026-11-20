import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { checkTools, run, tools } from '../src/lib/tools';
import { ensureStorage } from '../src/lib/storage';
import { processJob } from '../src/clipper/queue';
import { buildFilterGraph } from '../src/clipper/filters';
import { app, signUp } from './helpers';

const status = await checkTools();
const haveFfmpeg = status.ffmpeg.ok && status.ffprobe.ok;
const tmp = (n: string) => path.join(os.tmpdir(), `cliper-${process.pid}-${n}`);

beforeAll(async () => {
  ensureStorage();
  if (!haveFfmpeg) return;
  await run(tools.ffmpeg, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=200x80:d=1', '-frames:v', '1', tmp('logo.png')]);
  await run(tools.ffmpeg, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=8', '-c:v', 'libx264', '-preset', 'ultrafast', tmp('src.mp4')]);
});

describe('watermark filter', () => {
  it('overlays the logo in the chosen corner', () => {
    const g = buildFilterGraph({ width: 1920, height: 1080, hasAudio: false }, { aspect: 'phone', fit: 'crop', focus: 'center', quality: '1080', fade: false, mute: false, speed: 1 }, 10, { position: 'bottom-left', size: 20, opacity: 0.5 });
    expect(g.graph).toContain('[1:v]scale=216:-2');
    expect(g.graph).toContain('colorchannelmixer=aa=0.5');
    expect(g.graph).toMatch(/overlay=\d+:main_h-overlay_h-\d+/);
    expect(g.graph.endsWith('[v]')).toBe(true);
  });
});

describe('brand kits API', () => {
  it('creates, makes default, uploads a logo and deletes', async () => {
    const u = await signUp();
    const a = await request(app).post('/api/v1/brand-kits').set(u.auth).send({ name: 'Main', primaryColor: '#112233' });
    expect(a.status).toBe(201);
    expect(a.body.kit.isDefault).toBe(true); // the first kit is the default
    const b = await request(app).post('/api/v1/brand-kits').set(u.auth).send({ name: 'Second', isDefault: true });
    const list = await request(app).get('/api/v1/brand-kits').set(u.auth);
    expect(list.body.kits.filter((k: { isDefault: boolean }) => k.isDefault).map((k: { id: string }) => k.id)).toEqual([b.body.kit.id]);
    expect((await request(app).post('/api/v1/brand-kits').set(u.auth).send({ name: 'Bad', primaryColor: 'red' })).status).toBe(400);
    if (haveFfmpeg) {
      const up = await request(app).post(`/api/v1/brand-kits/${a.body.kit.id}/logo`).set(u.auth).attach('file', tmp('logo.png'), { contentType: 'image/png' });
      expect(up.status).toBe(200);
      expect(up.body.kit.logoUrl).toMatch(/^data:image\/png;base64,/);
    }
    // Another person cannot see or change it
    const other = await signUp();
    expect((await request(app).patch(`/api/v1/brand-kits/${a.body.kit.id}`).set(other.auth).send({ name: 'Mine' })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/brand-kits/${a.body.kit.id}`).set(u.auth)).status).toBe(204);
  });
});

describe.skipIf(!haveFfmpeg)('branded clips and the calendar', () => {
  it('stamps the kit logo on rendered clips, then schedules one', async () => {
    const u = await signUp();
    const kit = (await request(app).post('/api/v1/brand-kits').set(u.auth).send({ name: 'Logo', logoPosition: 'top-left', logoSize: 30, logoOpacity: 1 })).body.kit;
    await request(app).post(`/api/v1/brand-kits/${kit.id}/logo`).set(u.auth).attach('file', tmp('logo.png'), { contentType: 'image/png' });
    const up = await request(app)
      .post('/api/v1/jobs/upload')
      .set(u.auth)
      .field('options', JSON.stringify({ mode: 'split', segmentSeconds: 8, aspect: 'desktop', fit: 'pad', quality: '480', brandKitId: kit.id }))
      .attach('file', tmp('src.mp4'), { filename: 'src.mp4', contentType: 'video/mp4' });
    const id = up.body.job.id as string;
    await prisma.clipJob.update({ where: { id }, data: { status: 'FETCHING' } });
    await processJob(id, new AbortController().signal);
    const job = (await request(app).get(`/api/v1/jobs/${id}`).set(u.auth)).body.job;
    expect(job.status).toBe('DONE');
    // The top-left corner of the first frame is the red logo
    const clip = await prisma.clip.findFirstOrThrow({ where: { jobId: id } });
    const file = path.resolve('storage-test', clip.file);
    const raw = tmp('px.rgb');
    await run(tools.ffmpeg, ['-hide_banner', '-y', '-i', file, '-frames:v', '1', '-vf', 'crop=4:4:40:40,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
    const [r, g, b] = [...fs.readFileSync(raw)];
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(100);
    expect(b).toBeLessThan(100);

    const when = new Date(Date.now() + 86400_000).toISOString();
    const post = await request(app).post('/api/v1/posts').set(u.auth).send({ clipId: clip.id, platform: 'tiktok', caption: 'hi', scheduledAt: when });
    expect(post.status).toBe(201);
    expect(post.body.post.clip.thumbUrl).toContain('/media/clips/');
    const done = await request(app).patch(`/api/v1/posts/${post.body.post.id}`).set(u.auth).send({ status: 'POSTED' });
    expect(done.body.post.status).toBe('POSTED');
    const month = await request(app).get(`/api/v1/posts?from=${new Date().toISOString()}&to=${new Date(Date.now() + 40 * 86400_000).toISOString()}`).set(u.auth);
    expect(month.body.posts).toHaveLength(1);
    const other = await signUp();
    expect((await request(app).post('/api/v1/posts').set(other.auth).send({ clipId: clip.id, platform: 'x', scheduledAt: when })).status).toBe(404);
    expect((await request(app).post('/api/v1/posts').set(u.auth).send({ clipId: clip.id, platform: 'x', scheduledAt: '2020-01-01' })).status).toBe(400);
    fs.rmSync(tmp('src.mp4'), { force: true });
  });
});
