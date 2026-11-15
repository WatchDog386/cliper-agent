import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app, resetDb, signUp } from './helpers';

beforeAll(resetDb);

// A public address written as an IP, so the URL check needs no DNS
const VIDEO = 'https://93.184.215.14/video.mp4';
const phone = { mode: 'split', segmentSeconds: 30, aspect: 'phone', fit: 'blur' };

describe('auth', () => {
  it('makes the first account the admin, later ones users', async () => {
    const a = await signUp('First');
    const b = await signUp('Second');
    expect(a.user.role).toBe('ADMIN');
    expect(b.user.role).toBe('USER');
  });

  it('signs in, rejects wrong passwords and duplicate emails', async () => {
    const u = await signUp();
    const ok = await request(app).post('/api/v1/auth/login').send({ email: u.email, password: 'Password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    const bad = await request(app).post('/api/v1/auth/login').send({ email: u.email, password: 'nope' });
    expect(bad.status).toBe(401);
    const dup = await request(app).post('/api/v1/auth/register').send({ name: 'Again', email: u.email, password: 'Password123' });
    expect(dup.status).toBe(400);
  });

  it('enforces the password policy', async () => {
    const r = await request(app).post('/api/v1/auth/register').send({ name: 'Weak', email: 'weak@example.com', password: 'short' });
    expect(r.status).toBe(400);
  });

  it('signs other devices out after a password change', async () => {
    const u = await signUp();
    const r = await request(app).post('/api/v1/auth/change-password').set(u.auth).send({ currentPassword: 'Password123', newPassword: 'Newpass456' });
    expect(r.status).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').set(u.auth)).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set({ Authorization: `Bearer ${r.body.token}` })).status).toBe(200);
  });

  it('serves public config', async () => {
    const r = await request(app).get('/api/v1/config');
    expect(r.body.limits.maxClipsPerJob).toBeGreaterThan(0);
  });
});

describe('jobs', () => {
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/v1/jobs')).status).toBe(401);
  });

  it('queues a link with its options', async () => {
    const u = await signUp();
    const r = await request(app).post('/api/v1/jobs').set(u.auth).send({ url: VIDEO, options: phone });
    expect(r.status).toBe(201);
    expect(r.body.job.status).toBe('QUEUED');
    expect(r.body.job.options).toMatchObject({ aspect: 'phone', fit: 'blur', segmentSeconds: 30, quality: '1080' });
    const list = await request(app).get('/api/v1/jobs').set(u.auth);
    expect(list.body.jobs).toHaveLength(1);
    expect(list.body.stats.active).toBe(1);
  });

  it('refuses private addresses and bad links', async () => {
    const u = await signUp();
    for (const url of ['http://127.0.0.1:4000/x', 'http://169.254.169.254/latest/meta-data', 'http://localhost/a.mp4', 'ftp://93.184.215.14/a.mp4', 'not a link']) {
      const r = await request(app).post('/api/v1/jobs').set(u.auth).send({ url, options: phone });
      expect(r.status, url).toBe(400);
    }
  });

  it('validates options', async () => {
    const u = await signUp();
    const bad = [{ segmentSeconds: 1 }, { aspect: 'tv' }, { mode: 'custom' }, { startAt: 50, endAt: 10 }, { speed: 5 }, { maxClips: 500 }];
    for (const options of bad) {
      const r = await request(app).post('/api/v1/jobs').set(u.auth).send({ url: VIDEO, options });
      expect(r.status, JSON.stringify(options)).toBe(400);
    }
  });

  it('keeps jobs private to their owner', async () => {
    const owner = await signUp();
    const other = await signUp();
    const { body } = await request(app).post('/api/v1/jobs').set(owner.auth).send({ url: VIDEO, options: phone });
    const id = body.job.id as string;
    expect((await request(app).get(`/api/v1/jobs/${id}`).set(other.auth)).status).toBe(404);
    expect((await request(app).delete(`/api/v1/jobs/${id}`).set(other.auth)).status).toBe(404);
    expect((await request(app).get(`/api/v1/jobs/${id}`).set(owner.auth)).status).toBe(200);
  });

  it('cancels, retries and deletes', async () => {
    const u = await signUp();
    const { body } = await request(app).post('/api/v1/jobs').set(u.auth).send({ url: VIDEO, options: phone });
    const id = body.job.id as string;
    const c = await request(app).post(`/api/v1/jobs/${id}/cancel`).set(u.auth);
    expect(c.body.job.status).toBe('CANCELLED');
    const r = await request(app).post(`/api/v1/jobs/${id}/retry`).set(u.auth);
    expect(r.body.job.status).toBe('QUEUED');
    const re = await request(app).post(`/api/v1/jobs/${id}/reclip`).set(u.auth).send({ options: { ...phone, aspect: 'desktop' } });
    expect(re.status).toBe(201);
    expect(re.body.job.id).not.toBe(id);
    expect(re.body.job.options.aspect).toBe('desktop');
    expect((await request(app).delete(`/api/v1/jobs/${id}`).set(u.auth)).status).toBe(204);
    expect((await request(app).get(`/api/v1/jobs/${id}`).set(u.auth)).status).toBe(404);
  });

  it('rejects uploads that are not video', async () => {
    const u = await signUp();
    const r = await request(app)
      .post('/api/v1/jobs/upload')
      .set(u.auth)
      .field('options', JSON.stringify(phone))
      .attach('file', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(r.status).toBe(400);
  });
});

describe('media links', () => {
  it('need a valid media token, and a session token does not count', async () => {
    const u = await signUp();
    expect((await request(app).get('/api/v1/media/clips/abc/video')).status).toBe(401);
    expect((await request(app).get(`/api/v1/media/clips/abc/video?t=${u.token}`)).status).toBe(401);
  });

  it('a media token cannot be used as a session', async () => {
    const u = await signUp();
    const { body } = await request(app).post('/api/v1/jobs').set(u.auth).send({ url: VIDEO, options: phone });
    const t = decodeURIComponent(new URL(`http://x${body.job.zipUrl}`).searchParams.get('t')!);
    expect((await request(app).get('/api/v1/jobs').set({ Authorization: `Bearer ${t}` })).status).toBe(401);
  });
});
