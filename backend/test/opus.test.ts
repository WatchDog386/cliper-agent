import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { normaliseClip, projectBody, projectState } from '../src/clipper/opus';
import { optionsSchema } from '../src/clipper/options';
import { app, signUp } from './helpers';

const ai = (extra: Record<string, unknown> = {}) => optionsSchema.parse({ mode: 'ai', ...extra });

describe('OpusClip request', () => {
  it('sends the model, duration, prompt and range', () => {
    const b = projectBody('https://youtu.be/x', ai({ aiDuration: 'short', aiPrompt: 'funny moments', startAt: 10, endAt: 300, aiHook: true }), 'My video') as Record<string, any>;
    expect(b.videoUrl).toBe('https://youtu.be/x');
    expect(b.curationPref).toMatchObject({ model: 'ClipAnything', clipDurations: [[0, 30]], customPrompt: 'funny moments', enableAutoHook: true, range: { startSec: 10, endSec: 300 } });
    expect(b.uploadedVideoAttr).toEqual({ title: 'My video' });
  });

  it('omits the range for the whole video and turns ClipBasic prompts into keywords', () => {
    const b = projectBody('https://youtu.be/x', ai({ aiModel: 'ClipBasic', aiPrompt: 'AI, startups' })) as Record<string, any>;
    expect(b.curationPref.range).toBeUndefined();
    expect(b.curationPref.topicKeywords).toEqual(['AI', 'startups']);
    expect(b.curationPref.enableAutoHook).toBeUndefined();
  });
});

describe('OpusClip responses', () => {
  it('reads documented clip fields (ms time ranges, string hashtags)', () => {
    const c = normaliseClip({ id: 'P1.C1', uriForExport: 'https://cdn/x.mp4', durationMs: 19478, timeRanges: [[192170, 211630]], title: 'T', description: 'D', hashtags: '#a #b', viralityScore: 8.7 });
    expect(c).toMatchObject({ id: 'P1.C1', url: 'https://cdn/x.mp4', durationSec: 19.478, startSec: 192.17, endSec: 211.63, title: 'T', hashtags: '#a #b', score: 87 });
    expect(normaliseClip({ id: 'x' })).toBeNull();
  });

  it('tells running, finished and failed projects apart', () => {
    expect(projectState({ status: 'PROCESSING' }).state).toBe('running');
    expect(projectState({ data: { stage: 'COMPLETE' } }).state).toBe('done');
    expect(projectState({ status: 'FAILED', errorMessage: 'bad link' })).toMatchObject({ state: 'failed', detail: 'bad link' });
    expect(projectState(null).state).toBe('running');
  });
});

describe('AI mode and admin API', () => {
  it('refuses AI jobs when no key is set and says so in /config', async () => {
    const u = await signUp();
    const cfg = await request(app).get('/api/v1/config');
    expect(cfg.body.ai).toBe(false);
    const r = await request(app).post('/api/v1/jobs').set(u.auth).send({ url: 'https://93.184.215.14/v.mp4', options: { mode: 'ai' } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('AI_DISABLED');
    const st = await request(app).get('/api/v1/ai/status').set(u.auth);
    expect(st.body).toMatchObject({ enabled: false });
  });

  it('lets only admins manage users, and not lock themselves out', async () => {
    // The test database may already hold users: make sure this one is an admin
    const a = await signUp('Admin');
    const { prisma } = await import('../src/lib/prisma');
    await prisma.user.update({ where: { id: a.user.id }, data: { role: 'ADMIN' } });
    const b = await signUp('Member');
    expect((await request(app).get('/api/v1/admin/users').set(b.auth)).status).toBe(403);
    const list = await request(app).get('/api/v1/admin/users').set(a.auth);
    expect(list.status).toBe(200);
    expect(list.body.users.some((x: { id: string }) => x.id === b.user.id)).toBe(true);
    expect((await request(app).patch(`/api/v1/admin/users/${a.user.id}`).set(a.auth).send({ active: false })).status).toBe(400);
    const off = await request(app).patch(`/api/v1/admin/users/${b.user.id}`).set(a.auth).send({ active: false });
    expect(off.body.user.active).toBe(false);
    expect((await request(app).get('/api/v1/auth/me').set(b.auth)).status).toBe(401);
    expect((await request(app).get('/api/v1/admin/stats').set(a.auth)).body).toHaveProperty('clips');
  });
});
