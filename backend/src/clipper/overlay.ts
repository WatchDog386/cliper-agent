import type { ClipOptions } from './options';

/*
 * The text burned into a clip, written as an ASS subtitle file that ffmpeg (libass) draws:
 *   captions – what is said, a few words at a time, low in the frame
 *   hook     – a title in a box across the top for the first seconds
 *   credit   – who made the original, small, in a corner for the whole clip
 * All times are in the finished clip's time (after any speed change). Pure: unit-tested.
 */
export interface Word {
  /** Seconds from the start of the clip. */
  start: number;
  end: number;
  text: string;
}

export interface CaptionLine {
  start: number;
  end: number;
  words: Word[];
}

const WHITE = '&H00FFFFFF';
/** ASS colours are AABBGGRR: this is the yellow #FFE600 the spoken word lights up in. */
const HIGHLIGHT = '&H0000E6FF';

/** Words → short lines that are comfortable to read at a glance (a new line after a pause or when full). */
export function groupWords(words: Word[], maxWords = 3, maxChars = 18, maxGap = 0.7): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) lines.push({ start: cur[0]!.start, end: cur[cur.length - 1]!.end, words: cur });
    cur = [];
  };
  for (const w of words) {
    const text = w.text.trim();
    if (!text) continue;
    const last = cur[cur.length - 1];
    const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + text.length;
    if (last && (cur.length >= maxWords || chars > maxChars || w.start - last.end > maxGap)) flush();
    cur.push({ ...w, text });
    // A sentence ends: the next one starts on a fresh line
    if (/[.!?]$/.test(text)) flush();
  }
  flush();
  // A line stays up until the next one starts (no flicker in short gaps), at most 1.2 s after its last word
  return lines.map((l, i) => ({ ...l, end: Math.min(lines[i + 1]?.start ?? l.end + 1.2, l.end + 1.2) }));
}

/** 75.5 → "0:01:15.50" */
export function assTime(seconds: number) {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/** Text is data: braces would start an ASS command, a backslash an escape. */
export const assText = (t: string) => t.replace(/[{}\\]/g, '').replace(/\s+/g, ' ').trim();

export interface OverlayInput {
  width: number;
  height: number;
  /** Length of the finished clip. */
  duration: number;
  /** Speed of the clip: word times (source time) are divided by it. */
  speed?: number;
  words?: Word[];
  style?: ClipOptions['captionStyle'];
  hook?: string | null;
  credit?: string | null;
  font?: string;
}

/** The ASS file for a clip, or null when there is nothing to draw. */
export function buildAss(p: OverlayInput): string | null {
  const speed = p.speed ?? 1;
  const style = p.style ?? 'karaoke';
  const font = (p.font ?? 'Inter').replace(/,/g, ' ');
  const short = Math.min(p.width, p.height);
  const tall = p.height > p.width;
  const big = style !== 'minimal';
  const capSize = Math.round(short * (big ? 0.078 : 0.046));
  const hookSize = Math.round(short * 0.056);
  const creditSize = Math.round(short * 0.03);
  const side = Math.round(p.width * 0.07);
  // Tall clips: clear of the platforms' own buttons and captions at the bottom
  const capMargin = Math.round(p.height * (tall ? 0.24 : 0.09));
  const hookMargin = Math.round(p.height * (tall ? 0.1 : 0.06));

  const events: string[] = [];
  const line = (start: number, end: number, name: string, text: string) => {
    const a = Math.max(0, Math.min(p.duration, start));
    const b = Math.max(0, Math.min(p.duration, end));
    if (b - a >= 0.05 && text) events.push(`Dialogue: 0,${assTime(a)},${assTime(b)},${name},,0,0,0,,${text}`);
  };

  const hook = p.hook ? assText(p.hook) : '';
  if (hook) line(0, p.duration, 'Hook', hook);
  const credit = p.credit ? assText(p.credit).slice(0, 40) : '';
  if (credit) line(0, p.duration, 'Credit', `via ${credit}`);

  const words = (p.words ?? []).map((w) => ({ start: w.start / speed, end: w.end / speed, text: assText(w.text) })).filter((w) => w.text && w.end > 0 && w.start < p.duration);
  const show = (t: string) => (big ? t.toUpperCase().replace(/[.,;:]+$/, '') : t);
  // A small "pop" as each line arrives
  const pop = big ? '{\\fscx88\\fscy88\\t(0,90,\\fscx100\\fscy100)}' : '';
  for (const l of groupWords(words, big ? 3 : 6, big ? 18 : 34)) {
    if (style !== 'karaoke') {
      line(l.start, l.end, 'Cap', pop + l.words.map((w) => show(w.text)).join(' '));
      continue;
    }
    // One event per word: the same line, with the word being spoken lit up
    l.words.forEach((w, i) => {
      const from = i === 0 ? l.start : w.start;
      const to = l.words[i + 1]?.start ?? l.end;
      const text = l.words.map((x, j) => (j === i ? `{\\c${HIGHLIGHT}&}${show(x.text)}{\\c${WHITE}&}` : show(x.text))).join(' ');
      line(from, to, 'Cap', (i === 0 ? pop : '') + text);
    });
  }
  if (!events.length) return null;

  const outline = Math.max(2, Math.round(capSize * 0.09));
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${p.width}`,
    `PlayResY: ${p.height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // White words with a heavy black edge: readable over any picture
    `Style: Cap,${font},${capSize},${WHITE},${WHITE},&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,${outline},${Math.round(outline / 2)},2,${side},${side},${capMargin},1`,
    // Black on a white box, top centre
    `Style: Hook,${font},${hookSize},&H00111111,&H00111111,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,3,${Math.round(hookSize * 0.35)},0,8,${side},${side},${hookMargin},1`,
    // Small and half see-through, bottom left
    `Style: Credit,${font},${creditSize},&H40FFFFFF,&H40FFFFFF,&H60000000,&H96000000,-1,0,0,0,100,100,0,0,1,${Math.max(1, Math.round(creditSize * 0.08))},0,1,${Math.round(side * 0.6)},${side},${Math.round(p.height * 0.025)},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}
