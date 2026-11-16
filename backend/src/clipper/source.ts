import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { run, ToolError, tools } from '../lib/tools';

export interface SourceMeta {
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  webpageUrl: string;
  site: string;
  isLive: boolean;
  viewCount: number | null;
  width: number | null;
  height: number | null;
}

interface YtJson {
  _type?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  webpage_url?: string;
  extractor_key?: string;
  is_live?: boolean;
  live_status?: string;
  view_count?: number;
  width?: number;
  height?: number;
  entries?: YtJson[];
}

/** The readable reason from yt-dlp's output ("ERROR: [youtube] abc: Video unavailable" → "Video unavailable"). */
export function ytdlpReason(err: unknown): string {
  if (err instanceof ToolError) {
    if (err.message === 'Cancelled') return 'Cancelled';
    const line = err.stderr
      .split(/\r?\n/)
      .reverse()
      .find((l) => l.startsWith('ERROR:'));
    if (line) return line.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?([\w-]+:\s*)?/, '').trim() || line;
    if (err.code === null) return err.message;
  }
  return err instanceof Error ? err.message : 'Could not read that link';
}

const toMeta = (j: YtJson, url: string): SourceMeta => ({
  title: j.title ?? 'Untitled video',
  uploader: j.uploader ?? j.channel ?? null,
  duration: typeof j.duration === 'number' ? j.duration : null,
  thumbnail: j.thumbnail ?? null,
  webpageUrl: j.webpage_url ?? url,
  site: j.extractor_key ?? 'Web',
  isLive: Boolean(j.is_live) || j.live_status === 'is_live',
  viewCount: typeof j.view_count === 'number' ? j.view_count : null,
  width: j.width ?? null,
  height: j.height ?? null,
});

/** Title, length and thumbnail of the video behind a link, without downloading it. */
export async function fetchMeta(url: string, signal?: AbortSignal): Promise<SourceMeta> {
  const out = await run(tools.ytdlp, ['-J', '--no-playlist', '--no-warnings', '--skip-download', url], { signal });
  let j = JSON.parse(out) as YtJson;
  if (j._type === 'playlist') {
    const first = j.entries?.find(Boolean);
    if (!first) throw new Error('That link is a playlist with no videos');
    j = first;
  }
  return toMeta(j, url);
}

/**
 * Download the video into `dir` as source.<ext>, at most `maxHeight` lines tall (no point fetching 4K
 * for a 1080p clip). Reports 0–1 progress across the video and audio parts.
 */
export async function downloadSource(url: string, dir: string, maxHeight: number, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<string> {
  await fs.promises.mkdir(dir, { recursive: true });
  const h = maxHeight;
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--no-part',
    '--no-mtime',
    // Segmented streams (most of YouTube, TikTok…) download several pieces at a time
    '--concurrent-fragments',
    '4',
    '-f',
    // Short side ≤ h, whether the video is landscape or portrait
    `bv*[height<=${h}]+ba/bv*[width<=${h}]+ba/b[height<=${h}]/b[width<=${h}]/bv*+ba/b`,
    '-S',
    'vcodec:h264,res,acodec:m4a',
    '--merge-output-format',
    'mp4',
    '--max-filesize',
    `${env.MAX_UPLOAD_MB}M`,
    '-o',
    path.join(dir, 'source.%(ext)s'),
  ];
  // yt-dlp merges video and audio with ffmpeg: point it at ours when it is not simply on PATH
  if (path.isAbsolute(tools.ffmpeg)) args.push('--ffmpeg-location', tools.ffmpeg);
  args.push(url);

  let parts = 1;
  let done = 0;
  let last = 0;
  await run(tools.ytdlp, args, {
    signal,
    collect: false,
    onStdout: (l) => {
      const formats = /Downloading \d+ format\(s\):\s*(\S+)/.exec(l);
      if (formats) parts = formats[1]!.split('+').length;
      if (/^\[download\] Destination:/.test(l) && last > 0) {
        done += 1;
        last = 0;
      }
      const pct = /^\[download\]\s+([\d.]+)%/.exec(l);
      if (pct) {
        last = Number(pct[1]) / 100;
        onProgress(Math.min(1, (done + last) / Math.max(parts, done + 1)));
      }
    },
  });

  const files = await fs.promises.readdir(dir);
  const found = files.filter((f) => f.startsWith('source.') && !f.endsWith('.part') && !f.endsWith('.ytdl'));
  const best = found.find((f) => f.endsWith('.mp4')) ?? found.find((f) => /\.(mkv|webm|mov)$/.test(f)) ?? found[0];
  if (!best) throw new Error('The download finished but no video file was saved');
  return path.join(dir, best);
}
