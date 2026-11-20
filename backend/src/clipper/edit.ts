import fs from 'node:fs';
import { run, tools } from '../lib/tools';
import type { Segment } from './plan';

/*
 * Auto-edit: the steps an editor does by hand on every short.
 *   - Smart cuts: clip boundaries snap to sentence starts and ends (needs a transcript).
 *   - Silence removal: pauses longer than ~0.6 s inside a clip are cut out (jump cuts).
 *   - Captions: word-by-word animated captions, the spoken word highlighted (needs a transcript).
 *   - Hook title: the clip's first line, big, for the first seconds.
 * Zoom, progress bar and audio clean-up are pure filters (see filters.ts).
 */

export interface Word {
  start: number;
  end: number;
  text: string;
}

/** Silent stretches of the source, from ffmpeg's silencedetect. */
export async function detectSilences(file: string, signal?: AbortSignal, noiseDb = -35, minSeconds = 0.6): Promise<[number, number][]> {
  const out: [number, number][] = [];
  let start: number | null = null;
  await run(tools.ffmpeg, ['-hide_banner', '-nostdin', '-i', file, '-vn', '-af', `silencedetect=noise=${noiseDb}dB:d=${minSeconds}`, '-f', 'null', '-'], {
    signal,
    collect: false,
    onStderr: (l: string) => {
      const s = /silence_start:\s*(-?[\d.]+)/.exec(l);
      if (s) start = Math.max(0, Number(s[1]));
      const e = /silence_end:\s*([\d.]+)/.exec(l);
      if (e && start !== null) {
        out.push([start, Number(e[1])]);
        start = null;
      }
    },
  });
  return out;
}

/**
 * The parts of [start, end] (source seconds) to keep, as clip-local times, once silences are cut.
 * A little sound is kept either side of every cut so words are not clipped; the clip never ends up
 * shorter than half its length or 3 seconds (then nothing is cut).
 */
export function keepIntervals(start: number, end: number, silences: [number, number][], pad = 0.12): [number, number][] {
  const len = end - start;
  // Silence that runs into the clip's start or end is cut right to the edge (no word to pad for)
  const cuts = silences
    .filter(([a, b]) => b > start && a < end)
    .map(([a, b]) => [a <= start ? start : a + pad, b >= end ? end : b - pad] as [number, number])
    .filter(([a, b]) => b - a >= 0.3)
    .map(([a, b]) => [a - start, b - start] as [number, number]);
  if (!cuts.length) return [[0, len]];
  const keep: [number, number][] = [];
  let t = 0;
  for (const [a, b] of cuts) {
    if (a > t + 0.05) keep.push([t, a]);
    t = Math.max(t, b);
  }
  if (len - t > 0.05) keep.push([t, len]);
  // Slivers under 0.3 s look like glitches: drop them
  const solid = keep.filter(([a, b]) => b - a >= 0.3);
  keep.length = 0;
  keep.push(...solid);
  const total = keep.reduce((s, [a, b]) => s + b - a, 0);
  return total >= Math.max(3, len / 2) ? keep : [[0, len]];
}

/** Where a clip-local time lands in the edited clip (after cuts and speed); null if it was cut. */
export function remapTime(t: number, keep: [number, number][], speed: number): number | null {
  let acc = 0;
  for (const [a, b] of keep) {
    if (t >= a && t <= b) return (acc + t - a) / speed;
    acc += b - a;
  }
  return null;
}

/** Sentence boundaries: a word ending in . ! ? or followed by a pause of 0.7 s or more. */
export function sentences(words: Word[]) {
  const out: { start: number; end: number; text: string }[] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (/[.!?…]["')\]]*$/.test(w.text.trim()) || !next || next.start - w.end >= 0.7) {
      out.push({ start: cur[0]!.start, end: cur[cur.length - 1]!.end, text: cur.map((x) => x.text.trim()).join(' ') });
      cur = [];
    }
  });
  return out;
}

/**
 * Move each clip's start to the beginning of a sentence and its end to the end of one, so no clip
 * opens or closes mid-word. A boundary may move by up to 30% of the clip length (and at most 8 s);
 * clips stay inside the video, keep their order and do not overlap.
 */
export function snapToSentences(segs: Segment[], words: Word[], total: number): Segment[] {
  const sent = sentences(words);
  if (!sent.length) return segs;
  const out: Segment[] = [];
  for (const s of segs) {
    const len = s.end - s.start;
    const reach = Math.min(8, len * 0.3);
    const prevEnd = out.length ? out[out.length - 1]!.end : 0;
    const startCands = sent.map((x) => x.start).filter((t) => Math.abs(t - s.start) <= reach && t >= prevEnd);
    const start = startCands.length ? startCands.reduce((a, b) => (Math.abs(b - s.start) < Math.abs(a - s.start) ? b : a)) : s.start;
    const endCands = sent.map((x) => x.end).filter((t) => Math.abs(t - s.end) <= reach && t - start >= Math.max(3, len * 0.5));
    let end = endCands.length ? endCands.reduce((a, b) => (Math.abs(b - s.end) < Math.abs(a - s.end) ? b : a)) : s.end;
    // A breath of air after the last word
    end = Math.min(total, end + 0.25);
    const st = Math.max(0, start - 0.1);
    out.push({ ...s, start: Math.round(st * 1000) / 1000, end: Math.round(end * 1000) / 1000 });
  }
  return out;
}

/** The words spoken inside [start, end] (source seconds), as clip-local times. */
export const wordsIn = (words: Word[], start: number, end: number): Word[] =>
  words.filter((w) => w.start >= start - 0.05 && w.end <= end + 0.05).map((w) => ({ start: w.start - start, end: w.end - start, text: w.text.trim() }));

export type CaptionStyle = 'karaoke' | 'bold' | 'clean';

const assTime = (s: number) => {
  const t = Math.max(0, s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = (t % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${sec}`;
};
/** #RRGGBB → ASS &HBBGGRR& */
const assColor = (hex: string) => {
  const h = hex.replace('#', '');
  return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase();
};
const escapeAss = (s: string) => s.replace(/\\/g, '').replace(/[{}]/g, '').replace(/\n/g, ' ');

/**
 * An .ass subtitle file: captions in groups of up to three words, the word being spoken highlighted
 * (karaoke) or the whole line shown (clean), plus an optional hook title at the top.
 */
export function buildAss(o: {
  width: number;
  height: number;
  /** Clip-local words, already remapped to output time. */
  words: Word[];
  style: CaptionStyle;
  highlight: string;
  hook?: string;
  hookSeconds?: number;
  uppercase?: boolean;
}) {
  const { width: W, height: H } = o;
  const short = Math.min(W, H);
  const size = Math.round(short * (o.style === 'clean' ? 0.055 : 0.075));
  const marginV = Math.round(H * (H > W ? 0.24 : 0.1));
  const hl = assColor(o.highlight);
  const up = (s: string) => (o.uppercase ?? o.style !== 'clean' ? s.toUpperCase() : s);
  const styles = [
    // Name, Font, Size, Primary, Secondary, Outline, Back, Bold, Italic, Underline, Strike, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Align, ML, MR, MV, Enc
    `Style: Cap,Inter,${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,${o.style === 'bold' ? 3 : 1},${Math.round(size / 11)},${o.style === 'clean' ? 0 : 2},2,${Math.round(W * 0.07)},${Math.round(W * 0.07)},${marginV},1`,
    `Style: Hook,Inter,${Math.round(short * 0.068)},&H00000000,&H00000000,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,3,${Math.round(short * 0.02)},0,8,${Math.round(W * 0.08)},${Math.round(W * 0.08)},${Math.round(H * 0.11)},1`,
  ];
  const events: string[] = [];
  if (o.hook) {
    events.push(`Dialogue: 1,${assTime(0)},${assTime(o.hookSeconds ?? 2.8)},Hook,,0,0,0,,{\\fad(120,200)}${escapeAss(up(o.hook))}`);
  }
  // Groups of up to 3 words, broken at long pauses and sentence ends
  const groups: Word[][] = [];
  let g: Word[] = [];
  o.words.forEach((w, i) => {
    g.push(w);
    const next = o.words[i + 1];
    if (g.length >= 3 || !next || next.start - w.end > 0.5 || /[.!?,;:]$/.test(w.text)) {
      groups.push(g);
      g = [];
    }
  });
  for (const grp of groups) {
    const gEnd = grp[grp.length - 1]!.end;
    if (o.style === 'clean') {
      events.push(`Dialogue: 0,${assTime(grp[0]!.start)},${assTime(gEnd + 0.1)},Cap,,0,0,0,,${escapeAss(up(grp.map((w) => w.text).join(' ')))}`);
      continue;
    }
    grp.forEach((w, i) => {
      const until = i + 1 < grp.length ? grp[i + 1]!.start : gEnd + 0.1;
      const text = grp
        .map((x, j) => (j === i ? `{\\c${hl}\\fscx112\\fscy112}${escapeAss(up(x.text))}{\\c&HFFFFFF&\\fscx100\\fscy100}` : escapeAss(up(x.text))))
        .join(' ');
      events.push(`Dialogue: 0,${assTime(w.start)},${assTime(Math.max(until, w.start + 0.08))},Cap,,0,0,0,,${text}`);
    });
  }
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}

/** A short hook line: the first sentence spoken in the clip, at most 8 words. */
export function hookLine(words: Word[], fallback: string) {
  const first = sentences(words)[0]?.text ?? '';
  const pick = (first || fallback).replace(/\s+/g, ' ').trim();
  const w = pick.split(' ');
  return w.length > 8 ? `${w.slice(0, 8).join(' ')}…` : pick;
}

export const writeFile = (p: string, s: string) => fs.promises.writeFile(p, s, 'utf8');
