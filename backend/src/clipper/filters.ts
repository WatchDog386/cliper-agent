import { frameSize, type ClipOptions } from './options';

export interface SourceInfo {
  width: number;
  height: number;
  hasAudio: boolean;
}

const FOCUS = { start: 0, center: 0.5, end: 1 } as const;
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const fixed = (n: number) => Number(n.toFixed(3)).toString();

/** A logo stamped on the clip (from a brand kit). It is the second ffmpeg input, [1:v]. */
export interface Watermark {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Logo width as a percentage of the frame width (4–40). */
  size: number;
  /** 0.1–1 */
  opacity: number;
}

/** Auto-edit steps for one clip (see clipper/edit.ts). */
export interface EditPlan {
  /** Parts of the clip to keep, in seconds from the clip's start (silences cut out). */
  keep?: [number, number][];
  /** Punch-in zoom every few seconds. */
  zoom?: boolean;
  /** An .ass subtitle file to burn in (captions and hook title). */
  ass?: string;
  /** A progress bar along the bottom in this colour (#RRGGBB). */
  bar?: string;
  /** Clean up and level the sound (−14 LUFS, as the platforms play it). */
  enhanceAudio?: boolean;
}

/** Quote a path for an ffmpeg filter option (':' , '\' and ''' are special there). */
export const filterPath = (p: string) => `'${p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")}'`;

/** Seconds of a clip that survive the cuts. */
export const keptLength = (keep: [number, number][]) => keep.reduce((s, [a, b]) => s + Math.max(0, b - a), 0);

/**
 * The ffmpeg filter graph that turns a stretch of the source into a finished clip:
 *   cut silences → reframe for the chosen view (crop / blurred background / bars) → speed and fades →
 *   punch-in zoom → logo → captions → progress bar.
 * Produces the labels [v] and, when there is sound to keep, [a].
 */
export function buildFilterGraph(
  src: SourceInfo,
  o: Pick<ClipOptions, 'aspect' | 'fit' | 'focus' | 'quality' | 'fade' | 'mute' | 'speed'>,
  segmentSeconds: number,
  mark?: Watermark,
  edit: EditPlan = {},
) {
  const { width: W, height: H } = frameSize(o.aspect, o.quality, src);
  const f = FOCUS[o.focus];
  const withAudio = src.hasAudio && !o.mute;
  const parts: string[] = [];

  // ── Cuts: keep only the listed stretches, joined back to back ──
  let inV = '[0:v]';
  let inA = '[0:a:0]';
  let length = segmentSeconds;
  const keep = edit.keep?.filter(([a, b]) => b - a > 0.05);
  if (keep && keep.length > 1) {
    const join: string[] = [];
    keep.forEach(([a, b], i) => {
      parts.push(`[0:v]trim=start=${fixed(a)}:end=${fixed(b)},setpts=PTS-STARTPTS[cv${i}]`);
      join.push(`[cv${i}]`);
      if (withAudio) {
        parts.push(`[0:a:0]atrim=start=${fixed(a)}:end=${fixed(b)},asetpts=PTS-STARTPTS[ca${i}]`);
        join.push(`[ca${i}]`);
      }
    });
    parts.push(`${join.join('')}concat=n=${keep.length}:v=1:a=${withAudio ? 1 : 0}[cv]${withAudio ? '[ca]' : ''}`);
    inV = '[cv]';
    inA = '[ca]';
    length = keptLength(keep);
  }

  const outDuration = length / o.speed;
  const fadeLen = Math.min(0.5, outDuration / 4);

  const tail: string[] = ['setsar=1'];
  if (o.speed !== 1) tail.push(`setpts=PTS/${fixed(o.speed)}`);
  if (o.fade) tail.push(`fade=t=in:st=0:d=${fixed(fadeLen)}`, `fade=t=out:st=${fixed(Math.max(0, outDuration - fadeLen))}:d=${fixed(fadeLen)}`);
  tail.push('format=yuv420p');
  const finish = tail.join(',');

  // ── Reframe ──
  if (o.aspect === 'original') {
    parts.push(`${inV}scale=${W}:${H},${finish}[r]`);
  } else if (o.fit === 'pad') {
    parts.push(`${inV}scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,${finish}[r]`);
  } else if (o.fit === 'blur') {
    // The background is blurred at quarter size (much faster) and scaled back up
    const w4 = even(W / 4);
    const h4 = even(H / 4);
    parts.push(
      `${inV}split=2[bg][fg];` +
        `[bg]scale=${w4}:${h4}:force_original_aspect_ratio=increase,crop=${w4}:${h4},boxblur=8:2,scale=${W}:${H}[bgb];` +
        `[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs];` +
        `[bgb][fgs]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2,${finish}[r]`,
    );
  } else {
    parts.push(`${inV}scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:(iw-ow)*${f}:(ih-oh)*${f},${finish}[r]`);
  }

  let cur = '[r]';
  const step = (filter: string, label: string) => {
    parts.push(`${cur}${filter}[${label}]`);
    cur = `[${label}]`;
  };

  // ── Punch-in zoom: 12% closer every other 3.5 s, the classic talking-head jump zoom ──
  if (edit.zoom) {
    const z = `if(mod(floor(t/3.5)\\,2)\\,1.12\\,1)`;
    step(`scale=w='${W}*${z}':h='${H}*${z}':eval=frame,crop=${W}:${H}`, 'z');
  }

  // ── Logo ──
  if (mark) {
    const lw = even((W * Math.max(4, Math.min(40, mark.size))) / 100);
    const margin = Math.round(Math.min(W, H) * 0.04);
    const x = mark.position.endsWith('left') ? `${margin}` : `main_w-overlay_w-${margin}`;
    const y = mark.position.startsWith('top') ? `${margin}` : `main_h-overlay_h-${margin}`;
    const alpha = fixed(Math.max(0.1, Math.min(1, mark.opacity)));
    parts.push(`[1:v]scale=${lw}:-2,format=rgba,colorchannelmixer=aa=${alpha}[logo]`);
    parts.push(`${cur}[logo]overlay=${x}:${y}:format=auto[lg]`);
    cur = '[lg]';
  }

  // ── Captions and hook title ──
  if (edit.ass) step(`ass=filename=${filterPath(edit.ass)}`, 'cap');

  // ── Progress bar: a strip of colour sliding in from the left ──
  if (edit.bar) {
    const bh = even(Math.max(6, H * 0.007));
    parts.push(`color=c=0x${edit.bar.replace('#', '')}:s=${W}x${bh}:r=30:d=${fixed(outDuration + 0.5)}[barsrc]`);
    parts.push(`${cur}[barsrc]overlay=x='-w+w*t/${fixed(Math.max(0.1, outDuration))}':y=H-h:eval=frame:shortest=1[bar]`);
    cur = '[bar]';
  }

  if (cur === '[r]') {
    // Nothing after the reframe: keep the original single chain ending in [v]
    parts[parts.length - 1] = parts[parts.length - 1]!.replace(/\[r\]$/, '[v]');
  } else {
    parts.push(`${cur}format=yuv420p[v]`);
  }

  // ── Sound ──
  if (withAudio) {
    const a: string[] = [];
    if (edit.enhanceAudio) a.push('highpass=f=80', 'afftdn=nf=-25');
    if (o.speed !== 1) a.push(`atempo=${fixed(o.speed)}`);
    if (o.fade) a.push(`afade=t=in:st=0:d=${fixed(fadeLen)}`, `afade=t=out:st=${fixed(Math.max(0, outDuration - fadeLen))}:d=${fixed(fadeLen)}`);
    if (edit.enhanceAudio) a.push('loudnorm=I=-14:TP=-1.5:LRA=11', 'aresample=44100');
    if (!a.length) a.push('anull');
    parts.push(`${inA}${a.join(',')}[a]`);
  }
  return { graph: parts.join(';'), width: W, height: H, withAudio, outDuration };
}
