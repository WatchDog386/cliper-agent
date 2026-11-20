import { frameSize, type ClipOptions } from './options';

export interface SourceInfo {
  width: number;
  height: number;
  hasAudio: boolean;
}

const FOCUS = { start: 0, center: 0.5, end: 1 } as const;

/** A logo stamped on the clip (from a brand kit). It is the second ffmpeg input, [1:v]. */
export interface Watermark {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Logo width as a percentage of the frame width (4–40). */
  size: number;
  /** 0.1–1 */
  opacity: number;
}
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const fixed = (n: number) => Number(n.toFixed(3)).toString();

/**
 * The ffmpeg filter graph that turns a stretch of the source into a finished clip: reframed for the
 * chosen view (crop / blurred background / bars), sped up or slowed down, with optional fades.
 * Produces the labels [v] and, when there is sound to keep, [a].
 */
export function buildFilterGraph(src: SourceInfo, o: Pick<ClipOptions, 'aspect' | 'fit' | 'focus' | 'quality' | 'fade' | 'mute' | 'speed'>, segmentSeconds: number, mark?: Watermark) {
  const { width: W, height: H } = frameSize(o.aspect, o.quality, src);
  const f = FOCUS[o.focus];
  const outDuration = segmentSeconds / o.speed;
  const fadeLen = Math.min(0.5, outDuration / 4);

  const tail: string[] = ['setsar=1'];
  if (o.speed !== 1) tail.push(`setpts=PTS/${fixed(o.speed)}`);
  if (o.fade) tail.push(`fade=t=in:st=0:d=${fixed(fadeLen)}`, `fade=t=out:st=${fixed(Math.max(0, outDuration - fadeLen))}:d=${fixed(fadeLen)}`);
  tail.push('format=yuv420p');
  const finish = tail.join(',');

  let video: string;
  if (o.aspect === 'original') {
    video = `[0:v]scale=${W}:${H},${finish}[v]`;
  } else if (o.fit === 'pad') {
    video = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,${finish}[v]`;
  } else if (o.fit === 'blur') {
    // The background is blurred at quarter size (much faster) and scaled back up
    const w4 = even(W / 4);
    const h4 = even(H / 4);
    video =
      `[0:v]split=2[bg][fg];` +
      `[bg]scale=${w4}:${h4}:force_original_aspect_ratio=increase,crop=${w4}:${h4},boxblur=8:2,scale=${W}:${H}[bgb];` +
      `[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs];` +
      `[bgb][fgs]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2,${finish}[v]`;
  } else {
    video = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:(iw-ow)*${f}:(ih-oh)*${f},${finish}[v]`;
  }

  if (mark) {
    // The reframed picture becomes [base]; the logo is scaled, faded and laid over a corner of it
    video = video.replace(/\[v\]$/, '[base]');
    const lw = even((W * Math.max(4, Math.min(40, mark.size))) / 100);
    const margin = Math.round(Math.min(W, H) * 0.04);
    const x = mark.position.endsWith('left') ? `${margin}` : `main_w-overlay_w-${margin}`;
    const y = mark.position.startsWith('top') ? `${margin}` : `main_h-overlay_h-${margin}`;
    const alpha = fixed(Math.max(0.1, Math.min(1, mark.opacity)));
    video += `;[1:v]scale=${lw}:-2,format=rgba,colorchannelmixer=aa=${alpha}[logo];[base][logo]overlay=${x}:${y}:format=auto,format=yuv420p[v]`;
  }

  const withAudio = src.hasAudio && !o.mute;
  let audio = '';
  if (withAudio) {
    const a: string[] = [];
    if (o.speed !== 1) a.push(`atempo=${fixed(o.speed)}`);
    if (o.fade) a.push(`afade=t=in:st=0:d=${fixed(fadeLen)}`, `afade=t=out:st=${fixed(Math.max(0, outDuration - fadeLen))}:d=${fixed(fadeLen)}`);
    if (!a.length) a.push('anull');
    audio = `;[0:a:0]${a.join(',')}[a]`;
  }
  return { graph: video + audio, width: W, height: H, withAudio, outDuration };
}
