import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { open, seal } from '../src/lib/secret-box';
import { ensureStorage, jobDir, toStored } from '../src/lib/storage';
import { queueAutoPublish } from '../src/social/autopublish';
import { publishOne } from '../src/social/publisher';
import { tiktokChunks } from '../src/social/providers/tiktok';
import { _linkedinVersion } from '../src/social/providers/linkedin';
import { app, resetDb, signUp } from './helpers';

/*
 * Connecting accounts and posting clips, with the platforms' HTTP APIs replaced by a scripted fetch.
 * (supertest talks to the app through node:http, so stubbing fetch only affects calls to the platforms.)
 */
beforeAll(async () => {
  await resetDb();
  ensureStorage();
});
afterEach(() => vi.unstubAllGlobals());

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
/** Answers each request with the first matching route; records what was asked. */
function mockFetch(routes: [RegExp, (c: Call) => { status?: number; json?: unknown; headers?: Record<string, string> }][]) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (input: string | URL, init: RequestInit = {}) => {
    const call: Call = { url: String(input), method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: init.body };
    calls.push(call);
    const route = routes.find(([re]) => re.test(call.url));
    if (!route) throw new Error(`unexpected request to ${call.url}`);
    const r = route[1](call);
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status ?? 200, headers: r.headers });
  });
  return calls;
}

const google = (extra: [RegExp, (c: Call) => { status?: number; json?: unknown; headers?: Record<string, string> }][] = []) =>
  mockFetch([
    ...extra,
    [/oauth2\.googleapis\.com\/token/, () => ({ json: { access_token: 'ya29.access', refresh_token: '1//refresh', expires_in: 3600, scope: 'youtube.upload' } })],
    [/youtube\/v3\/channels/, () => ({ json: { items: [{ id: 'UC123', snippet: { title: 'My Channel', customUrl: '@mychannel', thumbnails: { default: { url: 'https://img/c.jpg' } } } }] } })],
  ]);

/** Sign up and connect a YouTube channel through the real routes. */
async function connected() {
  const u = await signUp();
  const start = await request(app).post('/api/v1/social/connect/youtube').set(u.auth).send({});
  expect(start.status).toBe(200);
  const state = new URL(start.body.url).searchParams.get('state')!;
  google();
  const back = await request(app).get('/api/v1/social/callback/youtube').query({ code: 'abc', state });
  vi.unstubAllGlobals();
  const account = await prisma.socialAccount.findFirstOrThrow({ where: { userId: u.user.id } });
  return { u, account, state, back };
}

/** A finished job with real (tiny) files on disk. */
async function jobWithClips(userId: string, count = 1, bytes = 1024) {
  const job = await prisma.clipJob.create({ data: { userId, sourceKind: 'UPLOAD', sourceName: 'talk.mp4', title: 'Big Talk', options: {}, status: 'DONE' } });
  await fs.promises.mkdir(jobDir(job.id), { recursive: true });
  const clips = [];
  for (let i = 1; i <= count; i++) {
    const file = path.join(jobDir(job.id), `clip-0${i}.mp4`);
    await fs.promises.writeFile(file, Buffer.alloc(bytes, i));
    clips.push(await prisma.clip.create({ data: { jobId: job.id, index: i, startSec: 0, endSec: 30, duration: 30, width: 1080, height: 1920, sizeBytes: bytes, file: toStored(file) } }));
  }
  return { job, clips };
}

const claim = (id: string) => prisma.publication.update({ where: { id }, data: { status: 'PUBLISHING', attempts: { increment: 1 } } });

describe('token storage', () => {
  it('encrypts and detects tampering', () => {
    const sealed = seal('secret-token');
    expect(sealed).not.toContain('secret-token');
    expect(open(sealed)).toBe('secret-token');
    expect(seal('secret-token')).not.toBe(sealed); // fresh IV each time
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => open(parts.join('.'))).toThrow();
  });
});

describe('connecting accounts', () => {
  it('lists the platforms and which are set up', async () => {
    const u = await signUp();
    const r = await request(app).get('/api/v1/social/providers').set(u.auth);
    const by = Object.fromEntries(r.body.providers.map((p: { platform: string }) => [p.platform, p]));
    expect(Object.keys(by)).toEqual(['YOUTUBE', 'TIKTOK', 'INSTAGRAM', 'FACEBOOK', 'X', 'LINKEDIN']);
    expect(by.YOUTUBE.configured).toBe(true);
    expect(by.TIKTOK.configured).toBe(false);
    expect(by.YOUTUBE.redirectUri).toBe('https://clips.test/api/v1/social/callback/youtube');
    expect((await request(app).get('/api/v1/config')).body.social).toEqual(['YOUTUBE', 'X']);
  });

  it('needs sign-in, a known platform and its credentials', async () => {
    const u = await signUp();
    expect((await request(app).post('/api/v1/social/connect/youtube')).status).toBe(401);
    expect((await request(app).post('/api/v1/social/connect/myspace').set(u.auth)).status).toBe(404);
    const r = await request(app).post('/api/v1/social/connect/tiktok').set(u.auth);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('NOT_CONFIGURED');
  });

  it('runs the whole OAuth round trip and stores the tokens encrypted', async () => {
    const { u, account, state, back } = await connected();
    expect(back.status).toBe(302);
    expect(back.headers.location).toBe('https://clips.test/channels#connected=YOUTUBE&name=My+Channel');
    expect(account).toMatchObject({ platform: 'YOUTUBE', externalId: 'UC123', name: 'My Channel', handle: '@mychannel' });
    expect(account.accessToken).not.toContain('ya29');
    expect(open(account.accessToken)).toBe('ya29.access');
    expect(open(account.refreshToken!)).toBe('1//refresh');

    const list = await request(app).get('/api/v1/social/accounts').set(u.auth);
    expect(list.body.accounts).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toMatch(/ya29|refresh/);

    // The state works once
    google();
    const again = await request(app).get('/api/v1/social/callback/youtube').query({ code: 'abc', state });
    expect(again.headers.location).toMatch(/error=/);
    expect(await prisma.socialAccount.count({ where: { userId: u.user.id } })).toBe(1);
  });

  it('sends the right things to the platform', async () => {
    const u = await signUp();
    const start = await request(app).post('/api/v1/social/connect/youtube').set(u.auth).send({ returnTo: 'https://evil.example/steal' });
    const url = new URL(start.body.url);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('redirect_uri')).toBe('https://clips.test/api/v1/social/callback/youtube');
    expect(url.searchParams.get('access_type')).toBe('offline');
    // A return address on another site is ignored
    const saved = await prisma.oAuthState.findUniqueOrThrow({ where: { id: url.searchParams.get('state')! } });
    expect(saved.returnTo).toBe('https://clips.test/channels');

    // X uses PKCE: the challenge is the hash of a verifier only the server knows
    const xs = await request(app).post('/api/v1/social/connect/x').set(u.auth).send({ returnTo: 'cliperagent://channels' });
    const xu = new URL(xs.body.url);
    expect(xu.searchParams.get('code_challenge_method')).toBe('S256');
    expect(xu.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    const xState = await prisma.oAuthState.findUniqueOrThrow({ where: { id: xu.searchParams.get('state')! } });
    expect(xState.returnTo).toBe('cliperagent://channels');
    const calls = mockFetch([
      [/api\.x\.com\/2\/oauth2\/token/, () => ({ json: { access_token: 'x-access', refresh_token: 'x-refresh', expires_in: 7200 } })],
      [/api\.x\.com\/2\/users\/me/, () => ({ json: { data: { id: '42', name: 'Me', username: 'me' } } })],
    ]);
    const back = await request(app).get('/api/v1/social/callback/x').query({ code: 'c', state: xState.id });
    expect(back.headers.location).toMatch(/^cliperagent:\/\/channels#connected=X/);
    const sent = new URLSearchParams(String(calls[0]!.body));
    expect(sent.get('code_verifier')).toBe(open(xState.verifier!));
    expect(calls[0]!.headers.Authorization).toBe(`Basic ${Buffer.from('x-id:x-secret').toString('base64')}`);
  });

  it('reports a refusal and a failed exchange back to the app', async () => {
    const u = await signUp();
    const state = async () => new URL((await request(app).post('/api/v1/social/connect/youtube').set(u.auth).send({})).body.url).searchParams.get('state')!;
    const denied = await request(app).get('/api/v1/social/callback/youtube').query({ error: 'access_denied', state: await state() });
    expect(decodeURIComponent(denied.headers.location!.replace(/\+/g, ' '))).toContain('You did not approve the YouTube connection');
    mockFetch([[/token/, () => ({ status: 400, json: { error: 'invalid_grant', error_description: 'Bad code' } })]]);
    const failed = await request(app).get('/api/v1/social/callback/youtube').query({ code: 'bad', state: await state() });
    expect(decodeURIComponent(failed.headers.location!.replace(/\+/g, ' '))).toContain('error=Bad code');
    expect(await prisma.socialAccount.count({ where: { userId: u.user.id } })).toBe(0);
  });

  it('disconnects', async () => {
    const { u, account } = await connected();
    const other = await signUp();
    expect((await request(app).delete(`/api/v1/social/accounts/${account.id}`).set(other.auth)).status).toBe(404);
    expect((await request(app).delete(`/api/v1/social/accounts/${account.id}`).set(u.auth)).status).toBe(204);
    expect(await prisma.socialAccount.count({ where: { id: account.id } })).toBe(0);
  });
});

describe('posting', () => {
  it('queues one post per clip and account, spaced out, with the text filled in', async () => {
    const { u, account } = await connected();
    const { clips } = await jobWithClips(u.user.id, 3);
    const at = new Date(Date.now() + 3600_000);
    const r = await request(app)
      .post('/api/v1/publications')
      .set(u.auth)
      .send({ clipIds: clips.map((c) => c.id), accountIds: [account.id], title: '{title} part {n}', caption: 'Watch part {n} #clips', scheduledAt: at.toISOString(), everyMinutes: 30, privacy: 'unlisted' });
    expect(r.status).toBe(201);
    const pubs = r.body.publications as { title: string; caption: string; runAt: string; scheduled: boolean; status: string }[];
    expect(pubs.map((p) => p.title)).toEqual(['Big Talk part 1', 'Big Talk part 2', 'Big Talk part 3']);
    expect(pubs[2]!.caption).toBe('Watch part 3 #clips');
    expect(pubs.map((p) => new Date(p.runAt).getTime() - at.getTime())).toEqual([0, 30 * 60_000, 60 * 60_000]);
    expect(pubs.every((p) => p.scheduled && p.status === 'QUEUED')).toBe(true);

    const list = await request(app).get('/api/v1/publications?status=waiting').set(u.auth);
    expect(list.body.publications).toHaveLength(3);
    expect(list.body.stats.waiting).toBe(3);

    const cancel = await request(app).post(`/api/v1/publications/${list.body.publications[0].id}/cancel`).set(u.auth);
    expect(cancel.body.publication.status).toBe('CANCELLED');
  });

  it("refuses other people's clips and accounts, the past, and clips too long for a platform", async () => {
    const a = await connected();
    const b = await connected();
    const mine = await jobWithClips(a.u.user.id);
    const post = (auth: Record<string, string>, body: Record<string, unknown>) => request(app).post('/api/v1/publications').set(auth).send(body);
    expect((await post(b.u.auth, { clipIds: [mine.clips[0]!.id], accountIds: [b.account.id] })).status).toBe(404);
    expect((await post(a.u.auth, { clipIds: [mine.clips[0]!.id], accountIds: [b.account.id] })).status).toBe(404);
    expect((await post(a.u.auth, { clipIds: [mine.clips[0]!.id], accountIds: [a.account.id], scheduledAt: '2020-01-01T00:00:00Z' })).body.error.code).toBe('PAST');
    // X takes 2 min 20 s at most
    const xAccount = await prisma.socialAccount.create({ data: { userId: a.u.user.id, platform: 'X', externalId: '9', name: 'Me', handle: 'me', accessToken: seal('t') } });
    await prisma.clip.update({ where: { id: mine.clips[0]!.id }, data: { duration: 200 } });
    const long = await post(a.u.auth, { clipIds: [mine.clips[0]!.id], accountIds: [xAccount.id] });
    expect(long.body.error.code).toBe('TOO_LONG');
    expect(long.body.error.message).toContain('2 min 20 s');
  });

  it('uploads to YouTube in pieces and records the link', async () => {
    const { u, account } = await connected();
    const size = 9 * 1024 * 1024; // more than one 8 MB piece
    const { clips } = await jobWithClips(u.user.id, 1, size);
    const made = await request(app).post('/api/v1/publications').set(u.auth).send({ clipIds: [clips[0]!.id], accountIds: [account.id], title: 'Hello <world>', caption: 'A caption' });
    const id = made.body.publications[0].id as string;
    await claim(id);
    const ranges: string[] = [];
    const calls = google([
      [/upload\/youtube\/v3\/videos/, () => ({ headers: { location: 'https://upload.test/session/1' } })],
      [
        /upload\.test\/session/,
        (c) => {
          ranges.push(c.headers['Content-Range']!);
          return ranges.length === 1 ? { status: 308, headers: { range: 'bytes=0-8388607' } } : { status: 200, json: { id: 'vid123' } };
        },
      ],
    ]);
    await publishOne(id, new AbortController().signal);
    const pub = await prisma.publication.findUniqueOrThrow({ where: { id } });
    expect(pub.error).toBeNull();
    expect(pub.status).toBe('PUBLISHED');
    // A tall clip under three minutes is a Short
    expect(pub.externalUrl).toBe('https://www.youtube.com/shorts/vid123');
    expect(ranges).toEqual([`bytes 0-8388607/${size}`, `bytes 8388608-${size - 1}/${size}`]);
    const meta = JSON.parse(String(calls[0]!.body));
    expect(meta.snippet.title).toBe('Hello world');
    expect(meta.snippet.description).toBe('A caption\n\n#Shorts');
    expect(meta.status.privacyStatus).toBe('public');
    expect(calls[0]!.headers.Authorization).toBe('Bearer ya29.access');
  });

  it('renews an expired token before posting', async () => {
    const { u, account } = await connected();
    await prisma.socialAccount.update({ where: { id: account.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const { clips } = await jobWithClips(u.user.id);
    const id = (await request(app).post('/api/v1/publications').set(u.auth).send({ clipIds: [clips[0]!.id], accountIds: [account.id] })).body.publications[0].id as string;
    await claim(id);
    const calls = mockFetch([
      [/oauth2\.googleapis\.com\/token/, () => ({ json: { access_token: 'ya29.renewed', expires_in: 3600 } })],
      [/upload\/youtube\/v3\/videos/, () => ({ headers: { location: 'https://upload.test/session/2' } })],
      [/upload\.test\/session/, () => ({ status: 201, json: { id: 'v2' } })],
    ]);
    await publishOne(id, new AbortController().signal);
    expect(new URLSearchParams(String(calls[0]!.body)).get('refresh_token')).toBe('1//refresh');
    expect(calls[1]!.headers.Authorization).toBe('Bearer ya29.renewed');
    const after = await prisma.socialAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(open(after.accessToken)).toBe('ya29.renewed');
    expect(open(after.refreshToken!)).toBe('1//refresh'); // Google does not resend it: kept
    expect((await prisma.publication.findUniqueOrThrow({ where: { id } })).status).toBe('PUBLISHED');
  });

  it('retries a platform hiccup later, and flags an account whose access was withdrawn', async () => {
    const { u, account } = await connected();
    const { clips } = await jobWithClips(u.user.id, 2);
    const made = await request(app).post('/api/v1/publications').set(u.auth).send({ clipIds: clips.map((c) => c.id), accountIds: [account.id] });
    const [first, second] = made.body.publications.map((p: { id: string }) => p.id) as [string, string];

    await claim(first);
    mockFetch([[/upload\/youtube/, () => ({ status: 503, json: { error: { message: 'Backend Error' } } })]]);
    await publishOne(first, new AbortController().signal);
    const retried = await prisma.publication.findUniqueOrThrow({ where: { id: first } });
    expect(retried.status).toBe('QUEUED');
    expect(retried.runAt.getTime()).toBeGreaterThan(Date.now() + 30_000);
    expect(retried.error).toContain('Backend Error');

    await claim(second);
    mockFetch([[/upload\/youtube/, () => ({ status: 401, json: { error: { message: 'Invalid Credentials' } } })]]);
    await publishOne(second, new AbortController().signal);
    expect(await prisma.publication.findUniqueOrThrow({ where: { id: second } })).toMatchObject({ status: 'FAILED', error: 'Invalid Credentials' });
    expect((await prisma.socialAccount.findUniqueOrThrow({ where: { id: account.id } })).needsReconnect).toBe(true);
    // Posting to it is refused until it is connected again
    const blocked = await request(app).post('/api/v1/publications').set(u.auth).send({ clipIds: [clips[0]!.id], accountIds: [account.id] });
    expect(blocked.body.error.code).toBe('NEEDS_RECONNECT');

    // A failed post can be sent again
    const again = await request(app).post(`/api/v1/publications/${second}/retry`).set(u.auth);
    expect(again.body.publication).toMatchObject({ status: 'QUEUED', attempts: 0, error: null });
  });

  it('posts a job automatically when it was asked to', async () => {
    const { u, account } = await connected();
    const made = await request(app)
      .post('/api/v1/jobs')
      .set(u.auth)
      .send({ url: 'https://93.184.215.14/v.mp4', options: { mode: 'split' }, autoPublish: { accountIds: [account.id], caption: '{title} #{n}', everyMinutes: 60 } });
    expect(made.status).toBe(201);
    expect(made.body.job.autoPublish.accountIds).toEqual([account.id]);
    const other = await connected();
    const stolen = await request(app).post('/api/v1/jobs').set(u.auth).send({ url: 'https://93.184.215.14/v.mp4', options: {}, autoPublish: { accountIds: [other.account.id] } });
    expect(stolen.status).toBe(404);

    const { job } = await jobWithClips(u.user.id, 2);
    await prisma.clipJob.update({ where: { id: job.id }, data: { autoPublish: made.body.job.autoPublish } });
    expect(await queueAutoPublish(job.id)).toBe(2);
    const pubs = await prisma.publication.findMany({ where: { clip: { jobId: job.id } }, orderBy: { runAt: 'asc' } });
    expect(pubs.map((p) => p.caption)).toEqual(['Big Talk #1', 'Big Talk #2']);
    expect(pubs.map((p) => p.title)).toEqual(['Big Talk (1)', 'Big Talk (2)']);
    expect(Math.round((pubs[1]!.runAt.getTime() - pubs[0]!.runAt.getTime()) / 60_000)).toBe(60);
  });
});

describe('platform details', () => {
  it('cuts files the way TikTok wants', () => {
    const MB = 1024 * 1024;
    expect(tiktokChunks(3 * MB)).toEqual({ chunkSize: 3 * MB, count: 1 });
    expect(tiktokChunks(64 * MB)).toEqual({ chunkSize: 64 * MB, count: 1 });
    // 100 MB: six 16 MB pieces, the last one carrying the 4 MB left over
    expect(tiktokChunks(100 * MB)).toEqual({ chunkSize: 16 * MB, count: 6 });
  });

  it('asks LinkedIn for a version that is still supported', () => {
    expect(_linkedinVersion(new Date('2026-11-16T00:00:00Z'))).toBe('202609');
    expect(_linkedinVersion(new Date('2027-01-05T00:00:00Z'))).toBe('202611');
  });
});
