/*
 * Scout: which videos (and whose) are most worth clipping right now. Pure ranking, unit-tested.
 *
 * A video's score (0–100) blends three things, each compared with the other videos found:
 *   momentum  – views per hour since it was published (what is taking off now)      55 %
 *   reach     – total views                                                         25 %
 *   audience  – the creator's subscribers / followers                               20 %
 * All on a log scale, so one giant channel does not flatten everything else. When no video has a
 * subscriber count (search without an API key), audience drops out and the other two share its weight.
 */
export interface ScoutVideo {
  id: string;
  platform: 'youtube' | 'twitch';
  /** "video" (a full upload or VOD) or "clip" (already a short highlight, e.g. a Twitch clip). */
  kind: 'video' | 'clip';
  url: string;
  title: string;
  creator: string;
  creatorId: string | null;
  creatorUrl: string | null;
  subscribers: number | null;
  views: number;
  publishedAt: string | null;
  duration: number | null;
  thumbnail: string | null;
  score?: number;
}

export interface ScoutCreator {
  key: string;
  platform: ScoutVideo['platform'];
  name: string;
  url: string | null;
  subscribers: number | null;
  /** Views of this creator's videos in the results. */
  views: number;
  videos: number;
  /** Their best video's score, lifted a little for each further strong video. */
  score: number;
}

const log = (n: number) => Math.log10(Math.max(1, n));

function normaliser(values: number[]) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return (v: number) => (hi > lo ? (v - lo) / (hi - lo) : values.length ? 1 : 0);
}

/** Views per hour since publication (a video is treated as at least six hours old, so brand-new uploads do not explode). */
export function momentum(v: Pick<ScoutVideo, 'views' | 'publishedAt'>, now = Date.now()) {
  if (!v.publishedAt) return null;
  const hours = Math.max(6, (now - new Date(v.publishedAt).getTime()) / 3_600_000);
  return v.views / hours;
}

/** Scores every video against the others and returns them best first. */
export function rankVideos(videos: ScoutVideo[], now = Date.now()): ScoutVideo[] {
  if (!videos.length) return [];
  const mom = videos.map((v) => momentum(v, now));
  const haveMom = mom.some((m) => m !== null);
  const haveSubs = videos.some((v) => v.subscribers !== null);
  const nViews = normaliser(videos.map((v) => log(v.views)));
  const nMom = normaliser(mom.filter((m): m is number => m !== null).map(log));
  const nSubs = normaliser(videos.filter((v) => v.subscribers !== null).map((v) => log(v.subscribers!)));
  const w = { mom: haveMom ? 0.55 : 0, views: 0.25, subs: haveSubs ? 0.2 : 0 };
  const total = w.mom + w.views + w.subs;
  return videos
    .map((v, i) => {
      const s = w.mom * (mom[i] === null ? 0 : nMom(log(mom[i]!))) + w.views * nViews(log(v.views)) + w.subs * (v.subscribers === null ? 0 : nSubs(log(v.subscribers)));
      return { ...v, score: Math.round((s / total) * 1000) / 10 };
    })
    .sort((a, b) => b.score! - a.score! || b.views - a.views);
}

/** The people behind the ranked videos, best first. */
export function rankCreators(ranked: ScoutVideo[]): ScoutCreator[] {
  const by = new Map<string, ScoutCreator>();
  for (const v of ranked) {
    const key = `${v.platform}:${v.creatorId ?? v.creator.toLowerCase()}`;
    const c = by.get(key);
    if (!c) by.set(key, { key, platform: v.platform, name: v.creator, url: v.creatorUrl, subscribers: v.subscribers, views: v.views, videos: 1, score: v.score ?? 0 });
    else {
      c.views += v.views;
      c.videos += 1;
      c.subscribers = Math.max(c.subscribers ?? 0, v.subscribers ?? 0) || c.subscribers;
      // Ranked best first, so c.score is already their best video: each further one adds a little
      c.score = Math.min(100, Math.round((c.score + (v.score ?? 0) * 0.08) * 10) / 10);
    }
  }
  return [...by.values()].sort((a, b) => b.score - a.score || b.views - a.views);
}

export interface ScoutFilter {
  minViews?: number;
  minSubscribers?: number;
  /** Longest source worth downloading (seconds). */
  maxSeconds?: number;
  minSeconds?: number;
}

export function filterVideos(videos: ScoutVideo[], f: ScoutFilter): ScoutVideo[] {
  return videos.filter(
    (v) =>
      v.views >= (f.minViews ?? 0) &&
      // An unknown subscriber count passes: better a good video than none
      (v.subscribers === null || v.subscribers >= (f.minSubscribers ?? 0)) &&
      (v.duration === null || !f.maxSeconds || v.duration <= f.maxSeconds) &&
      (v.duration === null || !f.minSeconds || v.duration >= f.minSeconds),
  );
}
