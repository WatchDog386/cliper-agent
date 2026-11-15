import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { HttpError } from '../../lib/http-error';
import { run, tools } from '../../lib/tools';
import { ah } from '../../middleware/async';
import { parse } from '../../middleware/validate';
import { ytdlpReason } from '../../clipper/source';

/*
 * Discover: trending videos to clip.
 *   With YOUTUBE_API_KEY → YouTube's real "most popular" chart for TRENDING_REGION (and per category).
 *   Without it          → a YouTube search through yt-dlp (no key needed), for the category or the words typed.
 * Answers are cached for 10 minutes.
 */
export const discoverRouter = Router();

export const CATEGORIES = [
  { id: 'all', label: 'Trending', youtubeId: null, query: 'trending today' },
  { id: 'music', label: 'Music', youtubeId: '10', query: 'trending music video' },
  { id: 'gaming', label: 'Gaming', youtubeId: '20', query: 'trending gaming highlights' },
  { id: 'sports', label: 'Sports', youtubeId: '17', query: 'sports highlights this week' },
  { id: 'news', label: 'News', youtubeId: '25', query: 'breaking news today' },
  { id: 'comedy', label: 'Comedy', youtubeId: '23', query: 'funny viral video' },
  { id: 'entertainment', label: 'Entertainment', youtubeId: '24', query: 'viral entertainment' },
  { id: 'podcasts', label: 'Podcasts', youtubeId: null, query: 'podcast clip' },
] as const;

export interface DiscoverItem {
  id: string;
  title: string;
  channel: string | null;
  thumbnail: string | null;
  duration: number | null;
  views: number | null;
  publishedAt: string | null;
  url: string;
}

const cache = new Map<string, { at: number; value: { source: string; items: DiscoverItem[] } }>();
const TTL = 10 * 60_000;

/** "PT1H2M3S" → 3723 */
export function isoDuration(iso: string | undefined): number | null {
  const m = iso ? /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso) : null;
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => Number(x ?? 0));
  return d! * 86400 + h! * 3600 + mi! * 60 + s!;
}

interface YtApiVideo {
  id: string;
  snippet?: { title?: string; channelTitle?: string; publishedAt?: string; thumbnails?: Record<string, { url: string }> };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
}

async function youtubeTrending(categoryId: string | null, region: string): Promise<DiscoverItem[]> {
  const params = new URLSearchParams({ part: 'snippet,contentDetails,statistics', chart: 'mostPopular', regionCode: region, maxResults: '24', key: env.YOUTUBE_API_KEY });
  if (categoryId) params.set('videoCategoryId', categoryId);
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
  if (!r.ok) throw new Error(`YouTube answered ${r.status}`);
  const json = (await r.json()) as { items?: YtApiVideo[] };
  return (json.items ?? []).map((v) => ({
    id: v.id,
    title: v.snippet?.title ?? 'Untitled',
    channel: v.snippet?.channelTitle ?? null,
    thumbnail: v.snippet?.thumbnails?.high?.url ?? v.snippet?.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    duration: isoDuration(v.contentDetails?.duration),
    views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
    publishedAt: v.snippet?.publishedAt ?? null,
    url: `https://www.youtube.com/watch?v=${v.id}`,
  }));
}

interface YtSearchEntry {
  id?: string;
  title?: string;
  channel?: string;
  uploader?: string;
  duration?: number;
  view_count?: number;
  url?: string;
  live_status?: string;
}

async function youtubeSearch(query: string): Promise<DiscoverItem[]> {
  const out = await run(tools.ytdlp, ['-J', '--flat-playlist', '--no-warnings', `ytsearch24:${query}`]);
  const json = JSON.parse(out) as { entries?: YtSearchEntry[] };
  return (json.entries ?? [])
    .filter((e) => e.id && e.live_status !== 'is_live')
    .map((e) => ({
      id: e.id!,
      title: e.title ?? 'Untitled',
      channel: e.channel ?? e.uploader ?? null,
      thumbnail: `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
      duration: typeof e.duration === 'number' ? e.duration : null,
      views: typeof e.view_count === 'number' ? e.view_count : null,
      publishedAt: null,
      url: e.url?.startsWith('http') ? e.url : `https://www.youtube.com/watch?v=${e.id}`,
    }));
}

const query = z.object({
  category: z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]]).default('all'),
  q: z.string().trim().max(120).optional(),
  region: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .transform((s) => s.toUpperCase())
    .optional(),
});

discoverRouter.get('/categories', (_req, res) => {
  res.json({ categories: CATEGORIES.map(({ id, label }) => ({ id, label })), mode: env.YOUTUBE_API_KEY ? 'youtube-trending' : 'search', region: env.TRENDING_REGION });
});

discoverRouter.get(
  '/',
  ah(async (req, res) => {
    const { category, q, region = env.TRENDING_REGION } = parse(query, req.query);
    const cat = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];
    const useApi = Boolean(env.YOUTUBE_API_KEY) && !q && (cat.youtubeId !== null || cat.id === 'all');
    const key = useApi ? `api:${region}:${cat.id}` : `search:${(q || cat.query).toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return void res.json(hit.value);
    try {
      const value = useApi
        ? { source: 'youtube-trending', items: await youtubeTrending(cat.youtubeId, region) }
        : { source: 'search', items: await youtubeSearch(q || cat.query) };
      cache.set(key, { at: Date.now(), value });
      res.json(value);
    } catch (err) {
      throw new HttpError(502, `Could not load videos: ${ytdlpReason(err)}`, 'DISCOVER_FAILED');
    }
  }),
);
