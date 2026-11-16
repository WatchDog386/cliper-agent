import { env } from '../config/env';
import { run, tools } from '../lib/tools';
import { isoDuration } from '../modules/discover/discover.routes';
import type { ScoutVideo } from './rank';

/*
 * Where Scout looks:
 *   YouTube – with YOUTUBE_API_KEY: the most-viewed recent videos for the topic, with each channel's
 *             subscriber count. Without a key: a plain search through yt-dlp (views, but no subscribers
 *             or dates).
 *   Twitch  – with TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET: the most-viewed clips of the game in the
 *             period, plus the follower counts of the streamers they came from.
 */
export const scoutSources = () => ({
  youtube: { available: true, mode: env.YOUTUBE_API_KEY ? ('api' as const) : ('search' as const) },
  twitch: { available: Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET), mode: 'api' as const },
});

export class SourceError extends Error {}

async function getJson<T>(url: string, headers?: Record<string, string>, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...headers } });
  } catch (e) {
    throw new SourceError(`${new URL(url).host} could not be reached (${e instanceof Error ? e.message : 'network error'})`);
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } | string; message?: string };
  if (!res.ok) {
    const why = (typeof body.error === 'object' ? body.error?.message : undefined) ?? body.message ?? (typeof body.error === 'string' ? body.error : '');
    throw new SourceError(`${new URL(url).host} answered ${res.status}${why ? `: ${String(why).slice(0, 160)}` : ''}`);
  }
  return body;
}

/* ───────────── YouTube ───────────── */

const YT = 'https://www.googleapis.com/youtube/v3';

interface YtSearch {
  items?: { id?: { videoId?: string } }[];
}
interface YtVideos {
  items?: {
    id: string;
    snippet?: { title?: string; channelId?: string; channelTitle?: string; publishedAt?: string; liveBroadcastContent?: string; thumbnails?: Record<string, { url: string }> };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string };
  }[];
}
interface YtChannels {
  items?: { id: string; snippet?: { customUrl?: string }; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }[];
}

async function youtubeApi(topic: string, days: number): Promise<ScoutVideo[]> {
  const key = env.YOUTUBE_API_KEY;
  const after = new Date(Date.now() - days * 86_400_000).toISOString();
  // Two searches: the most viewed in the period, and the most relevant (catches what is rising)
  const ids = new Set<string>();
  for (const order of ['viewCount', 'relevance']) {
    const q = new URLSearchParams({ part: 'id', type: 'video', q: topic, order, publishedAfter: after, maxResults: '25', key });
    const found = await getJson<YtSearch>(`${YT}/search?${q}`);
    for (const it of found.items ?? []) if (it.id?.videoId) ids.add(it.id.videoId);
  }
  if (!ids.size) return [];
  const videos = await getJson<YtVideos>(`${YT}/videos?${new URLSearchParams({ part: 'snippet,contentDetails,statistics', id: [...ids].slice(0, 50).join(','), key })}`);
  const items = (videos.items ?? []).filter((v) => v.snippet?.liveBroadcastContent !== 'live' && v.snippet?.liveBroadcastContent !== 'upcoming');
  const channelIds = [...new Set(items.map((v) => v.snippet?.channelId).filter((x): x is string => Boolean(x)))];
  const subs = new Map<string, { subscribers: number | null; url: string }>();
  if (channelIds.length) {
    const ch = await getJson<YtChannels>(`${YT}/channels?${new URLSearchParams({ part: 'snippet,statistics', id: channelIds.slice(0, 50).join(','), key })}`);
    for (const c of ch.items ?? [])
      subs.set(c.id, {
        subscribers: c.statistics?.hiddenSubscriberCount || !c.statistics?.subscriberCount ? null : Number(c.statistics.subscriberCount),
        url: c.snippet?.customUrl ? `https://www.youtube.com/${c.snippet.customUrl}` : `https://www.youtube.com/channel/${c.id}`,
      });
  }
  return items.map((v) => {
    const channel = v.snippet?.channelId ? subs.get(v.snippet.channelId) : undefined;
    return {
      id: `yt:${v.id}`,
      platform: 'youtube' as const,
      kind: 'video' as const,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      title: v.snippet?.title ?? 'Untitled',
      creator: v.snippet?.channelTitle ?? 'Unknown channel',
      creatorId: v.snippet?.channelId ?? null,
      creatorUrl: channel?.url ?? null,
      subscribers: channel?.subscribers ?? null,
      views: Number(v.statistics?.viewCount ?? 0),
      publishedAt: v.snippet?.publishedAt ?? null,
      duration: isoDuration(v.contentDetails?.duration),
      thumbnail: v.snippet?.thumbnails?.high?.url ?? v.snippet?.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    };
  });
}

interface YtDlpEntry {
  id?: string;
  title?: string;
  channel?: string;
  uploader?: string;
  channel_id?: string;
  channel_url?: string;
  channel_follower_count?: number;
  duration?: number;
  view_count?: number;
  timestamp?: number;
  url?: string;
  live_status?: string;
}

/** No API key: yt-dlp's search (no dates, so `days` cannot be applied). */
async function youtubeSearch(topic: string): Promise<ScoutVideo[]> {
  let out: string;
  try {
    out = await run(tools.ytdlp, ['-J', '--flat-playlist', '--no-warnings', `ytsearch40:${topic}`]);
  } catch (e) {
    throw new SourceError(`YouTube search failed (${e instanceof Error ? e.message : 'yt-dlp error'})`);
  }
  const json = JSON.parse(out) as { entries?: YtDlpEntry[] };
  return (json.entries ?? [])
    .filter((e) => e.id && e.live_status !== 'is_live' && e.live_status !== 'is_upcoming')
    .map((e) => ({
      id: `yt:${e.id}`,
      platform: 'youtube' as const,
      kind: 'video' as const,
      url: `https://www.youtube.com/watch?v=${e.id}`,
      title: e.title ?? 'Untitled',
      creator: e.channel ?? e.uploader ?? 'Unknown channel',
      creatorId: e.channel_id ?? null,
      creatorUrl: e.channel_url ?? null,
      subscribers: typeof e.channel_follower_count === 'number' ? e.channel_follower_count : null,
      views: typeof e.view_count === 'number' ? e.view_count : 0,
      publishedAt: typeof e.timestamp === 'number' ? new Date(e.timestamp * 1000).toISOString() : null,
      duration: typeof e.duration === 'number' ? e.duration : null,
      thumbnail: `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
    }));
}

export const scoutYoutube = (topic: string, days: number) => (env.YOUTUBE_API_KEY ? youtubeApi(topic, days) : youtubeSearch(topic));

/* ───────────── Twitch ───────────── */

const HELIX = 'https://api.twitch.tv/helix';
let twitchToken: { value: string; until: number } | null = null;

async function twitchHeaders() {
  if (!twitchToken || twitchToken.until < Date.now() + 60_000) {
    const q = new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' });
    const t = await getJson<{ access_token: string; expires_in: number }>(`https://id.twitch.tv/oauth2/token?${q}`, undefined, { method: 'POST' });
    twitchToken = { value: t.access_token, until: Date.now() + t.expires_in * 1000 };
  }
  return { Authorization: `Bearer ${twitchToken.value}`, 'Client-Id': env.TWITCH_CLIENT_ID };
}

interface TwitchClip {
  id: string;
  url: string;
  broadcaster_id: string;
  broadcaster_name: string;
  title: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
  duration: number;
}

/** The Twitch category (game) that best matches the topic: an exact name first, then Twitch's own search. */
async function twitchGame(topic: string, headers: Record<string, string>) {
  const exact = await getJson<{ data?: { id: string; name: string }[] }>(`${HELIX}/games?${new URLSearchParams({ name: topic })}`, headers);
  if (exact.data?.[0]) return exact.data[0];
  const found = await getJson<{ data?: { id: string; name: string }[] }>(`${HELIX}/search/categories?${new URLSearchParams({ query: topic, first: '5' })}`, headers);
  return found.data?.[0] ?? null;
}

export async function scoutTwitch(topic: string, days: number): Promise<{ videos: ScoutVideo[]; game: string | null }> {
  const headers = await twitchHeaders();
  const game = await twitchGame(topic, headers);
  if (!game) return { videos: [], game: null };
  const q = new URLSearchParams({ game_id: game.id, first: '50', started_at: new Date(Date.now() - days * 86_400_000).toISOString(), ended_at: new Date().toISOString() });
  // Twitch returns clips most-viewed first
  const clips = (await getJson<{ data?: TwitchClip[] }>(`${HELIX}/clips?${q}`, headers)).data ?? [];
  // Followers of the streamers behind the top clips (one request each, so only the first dozen)
  const followers = new Map<string, number>();
  await Promise.all(
    [...new Set(clips.map((c) => c.broadcaster_id))].slice(0, 12).map(async (id) => {
      const r = await getJson<{ total?: number }>(`${HELIX}/channels/followers?${new URLSearchParams({ broadcaster_id: id, first: '1' })}`, headers).catch(() => null);
      if (typeof r?.total === 'number') followers.set(id, r.total);
    }),
  );
  return {
    game: game.name,
    videos: clips.map((c) => ({
      id: `tw:${c.id}`,
      platform: 'twitch' as const,
      kind: 'clip' as const,
      url: c.url,
      title: c.title || `${c.broadcaster_name} clip`,
      creator: c.broadcaster_name,
      creatorId: c.broadcaster_id,
      creatorUrl: `https://www.twitch.tv/${encodeURIComponent(c.broadcaster_name.toLowerCase())}`,
      subscribers: followers.get(c.broadcaster_id) ?? null,
      views: c.view_count,
      publishedAt: c.created_at,
      duration: c.duration,
      thumbnail: c.thumbnail_url || null,
    })),
  };
}
