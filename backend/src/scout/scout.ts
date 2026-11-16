import { filterVideos, rankCreators, rankVideos, type ScoutCreator, type ScoutFilter, type ScoutVideo } from './rank';
import { scoutSources, scoutTwitch, scoutYoutube } from './sources';

export interface ScoutQuery extends ScoutFilter {
  topic: string;
  days: number;
  sources: ('youtube' | 'twitch')[];
}

export interface ScoutResult {
  topic: string;
  videos: ScoutVideo[];
  creators: ScoutCreator[];
  /** What each source did: how many it found, or why it could not look. */
  notes: string[];
  at: string;
}

const cache = new Map<string, { at: number; value: { videos: ScoutVideo[]; notes: string[] } }>();
const TTL = 10 * 60_000;

/** Find, filter and rank videos about a topic. One source failing does not sink the others. */
export async function scout(q: ScoutQuery): Promise<ScoutResult> {
  const available = scoutSources();
  const key = `${q.topic.toLowerCase()}|${q.days}|${[...q.sources].sort().join(',')}`;
  let found = cache.get(key);
  if (!found || Date.now() - found.at > TTL) {
    const videos: ScoutVideo[] = [];
    const notes: string[] = [];
    await Promise.all(
      q.sources.map(async (s) => {
        try {
          if (s === 'youtube') {
            const v = await scoutYoutube(q.topic, q.days);
            videos.push(...v);
            notes.push(`YouTube: ${v.length} videos${available.youtube.mode === 'search' ? ' (plain search: add YOUTUBE_API_KEY for dates and subscriber counts)' : ''}`);
          } else if (!available.twitch.available) notes.push('Twitch: not set up (add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET)');
          else {
            const r = await scoutTwitch(q.topic, q.days);
            videos.push(...r.videos);
            notes.push(r.game ? `Twitch: ${r.videos.length} clips of ${r.game}` : `Twitch: no game called "${q.topic}"`);
          }
        } catch (e) {
          notes.push(`${s === 'youtube' ? 'YouTube' : 'Twitch'}: ${e instanceof Error ? e.message : 'failed'}`);
        }
      }),
    );
    found = { at: Date.now(), value: { videos, notes: notes.sort() } };
    // Only keep an answer worth keeping: a failed look is retried next time
    if (videos.length) cache.set(key, found);
  }
  const ranked = rankVideos(filterVideos(found.value.videos, q));
  return { topic: q.topic, videos: ranked, creators: rankCreators(ranked), notes: found.value.notes, at: new Date(found.at).toISOString() };
}

export const clearScoutCache = () => cache.clear();
