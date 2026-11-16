import fs from 'node:fs';
import { run, tools } from '../lib/tools';
import { encoderFilterTail, encoderInputArgs, encoderOutputArgs } from './encoder';
import { buildFilterGraph, type SourceInfo } from './filters';
import type { ClipOptions } from './options';
import type { Segment } from './plan';

export interface Probe extends SourceInfo {
  duration: number;
}

interface FfprobeJson {
  format?: { duration?: string };
  streams?: {
    codec_type?: string;
    width?: number;
    height?: number;
    duration?: string;
    tags?: { rotate?: string };
    side_data_list?: { rotation?: number }[];
  }[];
}

/** Length, frame size (as displayed, after rotation) and whether there is sound. */
export async function probe(file: string, signal?: AbortSignal): Promise<Probe> {
  const out = await run(tools.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { signal });
  const json = JSON.parse(out) as FfprobeJson;
  const video = json.streams?.find((s) => s.codec_type === 'video');
  if (!video?.width || !video.height) throw new Error('This file has no video picture');
  const rotation = Math.abs(Number(video.tags?.rotate ?? video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0)) % 180;
  const duration = Number(json.format?.duration ?? video.duration ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not read how long this video is');
  return {
    duration,
    width: rotation === 90 ? video.height : video.width,
    height: rotation === 90 ? video.width : video.height,
    hasAudio: Boolean(json.streams?.some((s) => s.codec_type === 'audio')),
  };
}

/**
 * Loudness of every second of the source (momentary LUFS from ffmpeg's EBU R128 meter). Only the
 * sound is decoded, so this is quick even for long videos.
 */
export async function loudnessPerSecond(file: string, duration: number, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<number[]> {
  const sums: number[] = [];
  const counts: number[] = [];
  const line = /\bt:\s*([\d.]+)\s+TARGET:.*?\bM:\s*(-?[\d.]+|-?inf|nan)/;
  await run(tools.ffmpeg, ['-hide_banner', '-nostdin', '-i', file, '-vn', '-sn', '-dn', '-af', 'ebur128', '-f', 'null', '-'], {
    signal,
    collect: false,
    onStderr: (l) => {
      const m = line.exec(l);
      if (!m) return;
      const t = Number(m[1]);
      const v = Number(m[2]);
      const sec = Math.floor(t);
      sums[sec] = (sums[sec] ?? 0) + (Number.isFinite(v) ? Math.max(-70, v) : -70);
      counts[sec] = (counts[sec] ?? 0) + 1;
      if (sec % 5 === 0) onProgress(Math.min(1, t / duration));
    },
  });
  return Array.from({ length: Math.ceil(duration) }, (_, i) => (counts[i] ? sums[i]! / counts[i]! : -70));
}

/** Render one clip to `out`. Reports 0–1 progress. */
export async function renderClip(
  file: string,
  src: SourceInfo,
  seg: Segment,
  o: ClipOptions,
  out: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
) {
  const length = seg.end - seg.start;
  const g = buildFilterGraph(src, o, length, encoderFilterTail());
  const args = [
    '-hide_banner',
    '-nostdin',
    '-y',
    ...encoderInputArgs(),
    '-ss',
    seg.start.toFixed(3),
    '-t',
    length.toFixed(3),
    '-i',
    file,
    '-filter_complex',
    g.graph,
    '-map',
    '[v]',
    ...(g.withAudio ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100'] : ['-an']),
    ...encoderOutputArgs(),
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    out,
  ];
  await run(tools.ffmpeg, args, {
    signal,
    collect: false,
    onStdout: (l) => {
      // out_time_us (older ffmpeg: out_time_ms, also in microseconds)
      const m = /^out_time_(?:us|ms)=(\d+)/.exec(l);
      if (m) onProgress(Math.min(1, Number(m[1]) / 1e6 / g.outDuration));
    },
  });
  const { size } = await fs.promises.stat(out);
  return { width: g.width, height: g.height, duration: g.outDuration, sizeBytes: size };
}

/** A still from the clip for the gallery. */
export async function thumbnail(clip: string, duration: number, out: string, signal?: AbortSignal) {
  const at = Math.min(1, duration / 2).toFixed(2);
  await run(tools.ffmpeg, ['-hide_banner', '-nostdin', '-y', '-ss', at, '-i', clip, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', out], { signal, collect: false });
}
