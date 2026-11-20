import { frameSize, type ClipOptions } from './options';

export interface SourceInfo {
  width: number;
  height: number;
  hasAudio: boolean;
}

const FOCUS = { start: 0, center: 0.5, end: 1 } as const;
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const fixed = (n: number) => Number(n.toFixed(3)).toString();

/**
 * The ffmpeg filter graph that turns a stretch of the source into a finished clip: reframed for the
 * chosen view (crop / blurred background / bars / split-screen), sped up or slowed down, with optional
 * silence removal and fades. Produces the labels [v] and, when there is sound to keep, [a].
 */
export function buildFilterGraph(
  src: SourceInfo,
  o: Pick<ClipOptions, 'aspect' | 'fit' | 'focus' | 'quality' | 'fade' | 'mute' | 'speed' | 'layoutTemplate' | 'removeSilence'> & Partial<Pick<ClipOptions, 'normalizeAudio'>>,
  segmentSeconds: number,
  pixelTail = 'format=yuv420p',
  /** An ASS file (captions, title, credit) to draw, named relative to the folder ffmpeg runs in. */
  overlayFile?: string,
) {
  const { width: W, height: H } = frameSize(o.aspect, o.quality, src);
  const f = FOCUS[o.focus];
  const outDuration = segmentSeconds / o.speed;
  const fadeLen = Math.min(0.5, outDuration / 4);
  const tall = H > W;

  const tail: string[] = ['setsar=1'];
  if (o.speed !== 1) tail.push(`setpts=PTS/${fixed(o.speed)}`);
  if (overlayFile) tail.push(`ass=${overlayFile}`);
  if (o.fade) tail.push(`fade=t=in:st=0:d=${fixed(fadeLen)}`, `fade=t=out:st=${fixed(Math.max(0, outDuration - fadeLen))}:d=${fixed(fadeLen)}`);
  tail.push(pixelTail);
  const finish = tail.join(',');

  // ── Video graph ──
  let video: string;
  if (o.aspect === 'original') {
    video = `[0:v]scale=${W}:${H},${finish}[v]`;
  } else if (o.fit === 'pad') {
    video = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,${finish}[v]`;
  } else if (o.fit === 'blur') {
    const w4 = even(W / 4);
    const h4 = even(H / 4);
    video =
      `[0:v]split=2[bg][fg];` +
      `[bg]scale=${w4}:${h4}:force_original_aspect_ratio=increase,crop=${w4}:${h4},boxblur=8:2,scale=${W}:${H}[bgb];` +
      `[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs];` +
      `[bgb][fgs]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2,${finish}[v]`;
  } else if (o.layoutTemplate === 'split-screen') {
    // Split-screen: stack or place two views of the same source
    if (tall) {
      // Phone (9:16): top half + bottom half, stacked vertically
      // Top half: source top portion → output top half
      // Bottom half: source bottom portion → output bottom half
      video =
        `[0:v]split=2[t][b];` +
        `[t]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H / 2}:0:0[ts];` +
        `[b]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H / 2}:0:${H / 2}[bs];` +
        `[ts][bs]vstack=inputs=2,${finish}[v]`;
    } else {
      // Desktop (16:9): left half + right half, side by side
      video =
        `[0:v]split=2[l][r];` +
        `[l]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W / 2}:${H}:0:0[ls];` +
        `[r]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W / 2}:${H}:${W / 2}:0[rs];` +
        `[ls][rs]hstack=inputs=2,${finish}[v]`;
    }
  } else {
    video = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:(iw-ow)*${f}:(ih-oh)*${f},${finish}[v]`;
  }

  const withAudio = src.hasAudio && !o.mute;
  let audio = '';
  if (withAudio) {
    const a: string[] = [];
    if (o.speed !== 1) a.push(`atempo=${fixed(o.speed)}`);
    // Remove silence: cut gaps shorter than 0.3s between speech (keep 0.1s padding)
    if (o.removeSilence) {
      a.push('silenceremove=start_periods=1:start_duration=0.1:start_threshold=-40dB:detection=peak:window=0.2:stop_periods=-1:stop_duration=0.3:stop_threshold=-40dB');
    }
    if (o.normalizeAudio) a.push('loudnorm=I=-14:TP=-1.5:LRA=11');
    if (o.fade) a.push(`afade=t=in:st=0:d=${fixed(fadeLen)}`, `afade=t=out:st=${fixed(Math.max(0, outDuration - fadeLen))}:d=${fixed(fadeLen)}`);
    if (!a.length) a.push('anull');
    audio = `;[0:a:0]${a.join(',')}[a]`;
  }
  return { graph: video + audio, width: W, height: H, withAudio, outDuration };
}