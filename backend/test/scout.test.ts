import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { seal } from '../src/lib/secret-box';
import { filterVideos, momentum, rankCreators, rankVideos, type ScoutVideo } from '../src/scout/rank';
import { clearScoutCache } from '../src/scout/scout';
import { app, resetDb, signUp } from './helpers';

beforeAll(resetDb);
afterEach(() => {
  vi.unstubAllGlobals();
  clearScoutCache();
});

const NOW = Date.parse('2026-11-16T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const video = (id: string, creator: string, views: number, subscribers: number | null, publishedHoursAgo: number | null, extra: Partial<ScoutVideo> = {}): ScoutVideo => ({
  id,
  platform: 'youtube',
  kind: 'video',
  url: `https://www.youtube.com/watch?v=${id}`,
  title: `Video ${id}`,
  creator,
  creatorId: creator,
  creatorUrl: null,
  subscribers,
  views,
  publishedAt: publishedHoursAgo === null ? null : hoursAgo(publishedHoursAgo),
  duration: 900,
  thumbnail: null,
  ...extra,
});

describe('ranking', () => {
  it('puts what is taking off now ahead of old videos with more views', () => {
    const ranked = rankVideos(
      [
        video('old', 'Big Channel', 5_000_000, 20_000_000, 24 * 25), // 5 M views over 25 days
        video('hot', 'Rising Streamer', 900_000, 400_000, 10), // 900 k in 10 hours
        video('small', 'Nobody', 2_000, 150, 48),
      ],
      NOW,
    );
    expect(ranked.map((v) => v.id)).toEqual(['hot', 'old', 'small']);
    expect(ranked[2]!.score).toBe(0);
    expect(ranked[0]!.score).toBeGreaterThan(60);
    // A brand-new upload is treated as six hours old
    expect(momentum({ views: 600, publishedAt: hoursAgo(0.1) }, NOW)).toBe(100);
  });

  it('still ranks when dates and subscriber counts are unknown (search without an API key)', () => {
    const ranked = rankVideos([video('a', 'A', 100, null, null), video('b', 'B', 100_000, null, null)], NOW);
    expect(ranked.map((v) => [v.id, v.score])).toEqual([
      ['b', 100],
      ['a', 0],
    ]);
  });

  it('ranks the creators behind the videos', () => {
    const ranked = rankVideos([video('1', 'Kai', 2_000_000, 9_000_000, 12), video('2', 'Kai', 800_000, 9_000_000, 30), video('3', 'Other', 1_500_000, 1_000_000, 20)], NOW);
    const creators = rankCreators(ranked);
    expect(creators[0]).toMatchObject({ name: 'Kai', videos: 2, views: 2_800_000, subscribers: 9_000_000 });
    expect(creators[0]!.score).toBeGreaterThan(creators[1]!.score);
  });

  it('filters by views, audience and length', () => {
    const all = [video('ok', 'A', 50_000, 200_000, 5), video('few', 'B', 500, 200_000, 5), video('tiny', 'C', 50_000, 100, 5), video('long', 'D', 50_000, 200_000, 5, { duration: 5 * 3600 }), video('unknown', 'E', 50_000, null, 5)];
    expect(filterVideos(all, { minViews: 10_000, minSubscribers: 10_000, maxSeconds: 3600 }).map((v) => v.id)).toEqual(['ok', 'unknown']);
  });
});

/** YouTube Data API and Twitch Helix, scripted. */
function platforms() {
  const asked: string[] = [];
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = String(input);
    asked.push(url);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.includes('/youtube/v3/search')) return json({ items: [{ id: { videoId: 'vidA' } }, { id: { videoId: 'vidB' } }, { id: { videoId: 'live1' } }] });
    if (url.includes('/youtube/v3/videos'))
      return json({
        items: [
          { id: 'vidA', snippet: { title: 'GTA 6 first heist', channelId: 'chA', channelTitle: 'StreamerOne', publishedAt: new Date(Date.now() - 8 * 3_600_000).toISOString() }, contentDetails: { duration: 'PT20M' }, statistics: { viewCount: '900000' } },
          { id: 'vidB', snippet: { title: 'GTA 6 map tour', channelId: 'chB', channelTitle: 'MapGuy', publishedAt: new Date(Date.now() - 60 * 3_600_000).toISOString() }, contentDetails: { duration: 'PT3H' }, statistics: { viewCount: '300000' } },
          { id: 'live1', snippet: { title: 'LIVE now', channelId: 'chA', channelTitle: 'StreamerOne', liveBroadcastContent: 'live' }, statistics: { viewCount: '5' } },
        ],
      });
    if (url.includes('/youtube/v3/channels')) return json({ items: [{ id: 'chA', snippet: { customUrl: '@streamerone' }, statistics: { subscriberCount: '4000000' } }, { id: 'chB', statistics: { subscriberCount: '90000' } }] });
    if (url.includes('id.twitch.tv/oauth2/token')) return json({ access_token: 'tw-token', expires_in: 3600 });
    if (url.includes('/helix/games')) return json({ data: [{ id: '777', name: 'Grand Theft Auto VI' }] });
    if (url.includes('/helix/clips'))
      return json({ data: [{ id: 'ClipOne', url: 'https://clips.twitch.tv/ClipOne', broadcaster_id: 'b1', broadcaster_name: 'TwitchGuy', title: 'He fell off the map', view_count: 250000, created_at: new Date(Date.now() - 5 * 3_600_000).toISOString(), thumbnail_url: 'https://img/t.jpg', duration: 42 }] });
    if (url.includes('/helix/channels/followers')) return json({ total: 1200000 });
    throw new Error(`unexpected request to ${url}`);
  });
  return asked;
}

async function withKeys<T>(fn: () => Promise<T>) {
  const { env } = await import('../src/config/env');
  const e = env as { YOUTUBE_API_KEY: string; TWITCH_CLIENT_ID: string; TWITCH_CLIENT_SECRET: string; ALLOW_PRIVATE_URLS: boolean };
  // ALLOW_PRIVATE_URLS: the link check would look youtube.com up in DNS, which a test machine may not have
  Object.assign(e, { YOUTUBE_API_KEY: 'yt-key', TWITCH_CLIENT_ID: 'tw-id', TWITCH_CLIENT_SECRET: 'tw-secret', ALLOW_PRIVATE_URLS: true });
  try {
    return await fn();
  } finally {
    Object.assign(e, { YOUTUBE_API_KEY: '', TWITCH_CLIENT_ID: '', TWITCH_CLIENT_SECRET: '', ALLOW_PRIVATE_URLS: false });
  }
}

const options = { mode: 'highlights', segmentSeconds: 30, maxClips: 3, aspect: 'phone', fit: 'blur', captions: true, hook: 'auto', credit: true };

describe('scout', () => {
  it('finds and ranks videos and creators from YouTube and Twitch', async () => {
    await withKeys(async () => {
      const u = await signUp();
      const asked = platforms();
      const r = await request(app).get('/api/v1/scout').query({ topic: 'GTA 6', days: 3 }).set(u.auth);
      expect(r.status).toBe(200);
      expect(r.body.notes).toEqual(['Twitch: 1 clips of Grand Theft Auto VI', 'YouTube: 2 videos']);
      expect(r.body.videos.map((v: ScoutVideo) => v.id)).toEqual(['yt:vidA', 'tw:ClipOne', 'yt:vidB']);
      expect(r.body.videos[0]).toMatchObject({ creator: 'StreamerOne', subscribers: 4_000_000, views: 900_000, duration: 1200, creatorUrl: 'https://www.youtube.com/@streamerone' });
      expect(r.body.videos[1]).toMatchObject({ platform: 'twitch', kind: 'clip', subscribers: 1_200_000, url: 'https://clips.twitch.tv/ClipOne' });
      expect(r.body.creators[0].name).toBe('StreamerOne');
      // The live stream was left out; the search asked for the period and the topic
      const search = new URL(asked.find((a) => a.includes('/search'))!);
      expect(search.searchParams.get('q')).toBe('GTA 6');
      expect(Date.now() - Date.parse(search.searchParams.get('publishedAfter')!)).toBeLessThan(3 * 86_400_000 + 5000);

      // Filters apply on top of the cached answer
      const big = await request(app).get('/api/v1/scout').query({ topic: 'GTA 6', days: 3, minSubscribers: 1_000_000, maxMinutes: 60 }).set(u.auth);
      expect(big.body.videos.map((v: ScoutVideo) => v.id)).toEqual(['yt:vidA', 'tw:ClipOne']);
    });
  });

  it('says so when a source is not set up or fails, and still answers', async () => {
    const u = await signUp();
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }));
    const r = await request(app).get('/api/v1/scout').query({ topic: 'GTA 6', sources: 'twitch' }).set(u.auth);
    expect(r.status).toBe(200);
    expect(r.body.videos).toEqual([]);
    expect(r.body.notes).toEqual(['Twitch: not set up (add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET)']);
    expect((await request(app).get('/api/v1/scout').query({ topic: 'x' }).set(u.auth)).status).toBe(400);
    expect((await request(app).get('/api/v1/scout').query({ topic: 'GTA 6' })).status).toBe(401);
  });
});

describe('autopilot campaigns', () => {
  const body = { name: 'GTA 6 daily', topic: 'GTA 6', sources: ['youtube', 'twitch'], days: 3, minViews: 100_000, maxMinutes: 60, videosPerRun: 5, everyHours: 6, options };

  it('clips the best new videos once, crediting the creator, and never twice', async () => {
    await withKeys(async () => {
      const u = await signUp();
      const account = await prisma.socialAccount.create({ data: { userId: u.user.id, platform: 'YOUTUBE', externalId: 'c', name: 'My Channel', accessToken: seal('t') } });
      const made = await request(app).post('/api/v1/campaigns').set(u.auth).send({ ...body, autoPublish: { accountIds: [account.id], everyMinutes: 120 } });
      expect(made.status).toBe(201);
      const id = made.body.campaign.id as string;

      platforms();
      const run = await request(app).post(`/api/v1/campaigns/${id}/run`).set(u.auth);
      expect(run.status).toBe(200);
      // vidB is three hours long: over the campaign's 60 minutes
      expect(run.body.queued.map((q: { creator: string }) => q.creator)).toEqual(['StreamerOne', 'TwitchGuy']);
      expect(run.body.campaign.lastNote).toMatch(/^Clipping 2 videos: StreamerOne – GTA 6 first heist/);
      expect(run.body.campaign.videosTaken).toBe(2);
      expect(Date.parse(run.body.campaign.nextRunAt) - Date.now()).toBeGreaterThan(5.9 * 3_600_000);

      const jobs = await prisma.clipJob.findMany({ where: { userId: u.user.id }, orderBy: { createdAt: 'asc' } });
      expect(jobs).toHaveLength(2);
      expect(jobs[0]).toMatchObject({ sourceUrl: 'https://www.youtube.com/watch?v=vidA', uploader: 'StreamerOne', title: 'GTA 6 first heist', status: 'QUEUED' });
      expect(jobs[0]!.options).toMatchObject({ mode: 'highlights', captions: true, credit: true, topic: 'GTA 6' });
      expect(jobs[0]!.autoPublish).toMatchObject({ accountIds: [account.id], everyMinutes: 120 });
      // The Twitch clip is already the moment: kept whole, as one clip
      expect(jobs[1]!.options).toMatchObject({ mode: 'split', maxClips: 1, segmentSeconds: 42 });

      const again = await request(app).post(`/api/v1/campaigns/${id}/run`).set(u.auth);
      expect(again.body.queued).toEqual([]);
      expect(again.body.note).toBe('No new videos: the 2 found were already clipped.');
      expect(await prisma.clipJob.count({ where: { userId: u.user.id } })).toBe(2);
    });
  });

  it('validates, lists, pauses, edits and deletes, each person their own', async () => {
    const u = await signUp();
    const other = await signUp();
    const post = (b: Record<string, unknown>) => request(app).post('/api/v1/campaigns').set(u.auth).send(b);
    expect((await post({ ...body, topic: '' })).status).toBe(400);
    expect((await post({ ...body, options: { ...options, mode: 'custom', ranges: [{ start: 0, end: 10 }] } })).body.error.code).toBe('BAD_MODE');
    const stranger = await prisma.socialAccount.create({ data: { userId: other.user.id, platform: 'X', externalId: '1', name: 'Theirs', accessToken: seal('t') } });
    expect((await post({ ...body, autoPublish: { accountIds: [stranger.id] } })).status).toBe(404);

    const id = (await post(body)).body.campaign.id as string;
    expect((await request(app).get('/api/v1/campaigns').set(u.auth)).body.campaigns).toHaveLength(1);
    expect((await request(app).get('/api/v1/campaigns').set(other.auth)).body.campaigns).toHaveLength(0);
    expect((await request(app).post(`/api/v1/campaigns/${id}/run`).set(other.auth)).status).toBe(404);

    const paused = await request(app).patch(`/api/v1/campaigns/${id}`).set(u.auth).send({ enabled: false });
    expect(paused.body.campaign.enabled).toBe(false);
    const edited = await request(app).put(`/api/v1/campaigns/${id}`).set(u.auth).send({ ...body, name: 'Renamed', everyHours: 12, enabled: true });
    expect(edited.body.campaign).toMatchObject({ name: 'Renamed', everyHours: 12, enabled: true, autoPublish: null });
    expect((await request(app).delete(`/api/v1/campaigns/${id}`).set(u.auth)).status).toBe(204);
  });
});
