import os from 'node:os';
import { env } from '../config/env';
import { run, tools } from '../lib/tools';

/*
 * Which H.264 encoder renders the clips. libx264 (CPU) always works. With a graphics card passed
 * through to the server, a hardware encoder is several times faster:
 *   h264_nvenc – NVIDIA      h264_qsv – Intel Quick Sync      h264_vaapi – Intel / AMD on Linux
 * The chosen one is tried once at start-up with a tiny test render; if it fails (no card, no driver, no
 * /dev/dri in the container) the server says so and uses libx264.
 */
export type Encoder = 'libx264' | 'h264_nvenc' | 'h264_qsv' | 'h264_vaapi';

let active: Encoder = 'libx264';
let note: string | null = null;

export const currentEncoder = () => active;
export const encoderInfo = () => ({ wanted: env.VIDEO_ENCODER, active, hardware: active !== 'libx264', note, parallel: renderParallel() });

/** Arguments that go before the inputs. */
export function encoderInputArgs(e: Encoder = active): string[] {
  return e === 'h264_vaapi' ? ['-vaapi_device', env.VAAPI_DEVICE] : [];
}

/** How the filter graph has to end for this encoder (pixel format, upload to the card). */
export function encoderFilterTail(e: Encoder = active): string {
  if (e === 'h264_vaapi') return 'format=nv12,hwupload';
  if (e === 'h264_qsv') return 'format=nv12';
  return 'format=yuv420p';
}

/** The video encoding arguments. Quality follows X264_CRF on every encoder (lower = better, bigger). */
export function encoderOutputArgs(e: Encoder = active): string[] {
  const q = String(env.X264_CRF);
  switch (e) {
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', q, '-b:v', '0', '-profile:v', 'high'];
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-global_quality', q, '-profile:v', 'high'];
    case 'h264_vaapi':
      return ['-c:v', 'h264_vaapi', '-qp', q, '-profile:v', 'high'];
    default:
      return ['-c:v', 'libx264', '-preset', env.X264_PRESET, '-crf', q, '-profile:v', 'high'];
  }
}

/** Try the configured encoder; fall back to libx264 when it does not work on this machine. */
export async function detectEncoder(): Promise<ReturnType<typeof encoderInfo>> {
  const wanted = env.VIDEO_ENCODER;
  active = 'libx264';
  note = null;
  if (wanted !== 'libx264') {
    try {
      await run(
        tools.ffmpeg,
        ['-hide_banner', '-nostdin', '-v', 'error', ...encoderInputArgs(wanted), '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=0.4', '-vf', encoderFilterTail(wanted), ...encoderOutputArgs(wanted), '-f', 'null', '-'],
        { collect: false },
      );
      active = wanted;
    } catch (e) {
      const why = e instanceof Error && 'stderr' in e ? String((e as { stderr: string }).stderr).trim().split(/\r?\n/).pop() : '';
      note = `${wanted} is not usable here${why ? ` (${why.slice(0, 160)})` : ''}: rendering on the CPU with libx264`;
    }
  }
  return encoderInfo();
}

/**
 * Clips of one job rendered side by side. libx264 already uses every core for one clip, but the
 * reframing filters (scale, blur) do not, so rendering two or three at once finishes a job sooner
 * (measured on 4 cores, three 30 s 1080×1920 clips: 32 s one at a time, 27 s with two, 24 s with three).
 * A hardware encoder leaves the CPU nearly idle: more at once.
 */
export function renderParallel(): number {
  if (env.RENDER_PARALLEL > 0) return env.RENDER_PARALLEL;
  const cores = os.availableParallelism?.() ?? os.cpus().length;
  if (active !== 'libx264') return Math.max(2, Math.min(4, Math.floor(cores / 2)));
  return cores >= 16 ? 4 : cores >= 8 ? 3 : cores >= 4 ? 2 : 1;
}
