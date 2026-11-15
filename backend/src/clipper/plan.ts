import type { ClipOptions } from './options';

/** One clip to cut from the source, in source seconds. */
export interface Segment {
  start: number;
  end: number;
  /** Highlight score 0–100 (highlights mode). */
  score?: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** The part of the source to use (the trim), clamped to the video. */
export function usableWindow(total: number, o: Pick<ClipOptions, 'startAt' | 'endAt'>) {
  const from = Math.min(Math.max(0, o.startAt ?? 0), total);
  const to = Math.min(Math.max(from, o.endAt ?? total), total);
  return { from, to };
}

/**
 * Back-to-back clips of exactly `segmentSeconds`. A short tail (less than a third of a clip, and under
 * 3 seconds at minimum) is dropped rather than published as a stub; a video shorter than one clip
 * becomes a single clip.
 */
export function planSplit(total: number, o: Pick<ClipOptions, 'segmentSeconds' | 'maxClips' | 'startAt' | 'endAt'>): Segment[] {
  const { from, to } = usableWindow(total, o);
  const seg = o.segmentSeconds;
  const minTail = Math.max(3, seg / 3);
  const out: Segment[] = [];
  for (let t = from; to - t > 0.05 && out.length < o.maxClips; t += seg) {
    const end = Math.min(t + seg, to);
    if (end - t < minTail && out.length > 0) break;
    out.push({ start: round(t), end: round(end) });
  }
  return out;
}

/** Exactly the ranges given (clamped to the video; the trim does not apply), in time order. */
export function planCustom(total: number, o: Pick<ClipOptions, 'ranges' | 'maxClips'>): Segment[] {
  return (o.ranges ?? [])
    .map((r) => ({ start: Math.max(0, Math.min(r.start, total)), end: Math.max(0, Math.min(r.end, total)) }))
    .filter((r) => r.end - r.start >= 1)
    .sort((a, b) => a.start - b.start)
    .slice(0, o.maxClips)
    .map((r) => ({ start: round(r.start), end: round(r.end) }));
}

/**
 * The most energetic moments. `loudness[i]` is the loudness of second i (LUFS, about −70 for silence
 * to −5 for very loud). Every window of `segmentSeconds` is scored by its average loudness plus a small
 * bonus for spread (moments where the sound rises and falls — laughter, cheering, a punchline — beat a
 * steady drone of the same level; the bonus is kept small so a window never wins by straddling a quiet
 * gap); the best windows that do not overlap are kept and returned in time order.
 * Without usable audio the clips are spread evenly across the video.
 */
export function planHighlights(total: number, loudness: number[], o: Pick<ClipOptions, 'segmentSeconds' | 'maxClips' | 'startAt' | 'endAt'>): Segment[] {
  const { from, to } = usableWindow(total, o);
  const span = to - from;
  if (span < 1) return [];
  const seg = Math.min(o.segmentSeconds, span);
  const count = Math.max(1, Math.min(o.maxClips, Math.floor(span / seg)));

  const first = Math.floor(from);
  const last = Math.floor(to - seg);
  const values = (i: number) => {
    const v = loudness[i];
    return v === undefined || !Number.isFinite(v) ? -70 : Math.max(-70, v);
  };
  const usable = loudness.slice(first, Math.ceil(to)).some((v) => Number.isFinite(v) && v > -60);
  if (!usable || last < first) return spreadEvenly(from, to, seg, count);

  // Prefix sums make every window's mean and spread O(1)
  const n = Math.ceil(to) + 1;
  const sum = new Float64Array(n + 1);
  const sq = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const v = values(i);
    sum[i + 1] = sum[i]! + v;
    sq[i + 1] = sq[i]! + v * v;
  }
  const len = Math.max(1, Math.round(seg));
  const windows: { start: number; score: number }[] = [];
  for (let s = first; s <= last; s++) {
    const e = Math.min(s + len, n);
    const k = e - s;
    const mean = (sum[e]! - sum[s]!) / k;
    const variance = Math.max(0, (sq[e]! - sq[s]!) / k - mean * mean);
    windows.push({ start: s, score: mean + 0.15 * Math.sqrt(variance) });
  }
  const lo = Math.min(...windows.map((w) => w.score));
  const hi = Math.max(...windows.map((w) => w.score));

  const picked: Segment[] = [];
  for (const w of [...windows].sort((a, b) => b.score - a.score)) {
    if (picked.length >= count) break;
    const start = Math.max(from, w.start);
    const end = Math.min(to, start + seg);
    if (picked.some((p) => start < p.end && end > p.start)) continue;
    picked.push({ start: round(start), end: round(end), score: hi > lo ? Math.round(((w.score - lo) / (hi - lo)) * 100) : 50 });
  }
  return picked.sort((a, b) => a.start - b.start);
}

function spreadEvenly(from: number, to: number, seg: number, count: number): Segment[] {
  const gap = count > 1 ? (to - from - seg) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => {
    const start = from + i * gap;
    return { start: round(start), end: round(Math.min(to, start + seg)) };
  });
}

/** The segments a job will cut. */
export function planSegments(total: number, o: ClipOptions, loudness: number[] = []): Segment[] {
  if (o.mode === 'custom') return planCustom(total, o);
  if (o.mode === 'highlights') return planHighlights(total, loudness, o);
  return planSplit(total, o);
}
