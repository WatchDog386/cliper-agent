import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { env } from '../config/env';

/*
 * The three command-line tools the clipper drives:
 *   yt-dlp   – fetches the video behind a link (YouTube, TikTok, X, Instagram, Facebook, direct .mp4 …)
 *   ffprobe  – reads a video's length, size and streams
 *   ffmpeg   – measures loudness and renders the clips
 * Each is found in this order: the *_PATH setting → a bundled copy (backend/bin from `npm run tools`,
 * or the ffmpeg-static / ffprobe-static packages) → the program on PATH (the Docker image installs them).
 */

const BIN = path.resolve(__dirname, '..', '..', 'bin');
const exe = (name: string) => (process.platform === 'win32' ? `${name}.exe` : name);

function optionalRequire(id: string): unknown {
  try {
    return require(id);
  } catch {
    return undefined;
  }
}

function pick(setting: string, bundled: (string | undefined)[], fallback: string) {
  if (setting) return setting;
  for (const p of bundled) if (p && fs.existsSync(p)) return p;
  return fallback;
}

export const tools = {
  get ytdlp() {
    return pick(env.YTDLP_PATH, [path.join(BIN, exe('yt-dlp'))], 'yt-dlp');
  },
  get ffmpeg() {
    return pick(env.FFMPEG_PATH, [path.join(BIN, exe('ffmpeg')), optionalRequire('ffmpeg-static') as string | undefined], 'ffmpeg');
  },
  get ffprobe() {
    const probe = optionalRequire('ffprobe-static') as { path?: string } | undefined;
    return pick(env.FFPROBE_PATH, [path.join(BIN, exe('ffprobe')), probe?.path], 'ffprobe');
  },
};

export interface RunOptions {
  /** Each line written to stdout. */
  onStdout?: (line: string) => void;
  /** Each line written to stderr. */
  onStderr?: (line: string) => void;
  signal?: AbortSignal;
  /** Keep stdout (default true; switch off for chatty commands). */
  collect?: boolean;
  /** Folder to run in (so files can be named without their path). */
  cwd?: string;
}

export class ToolError extends Error {
  constructor(
    message: string,
    public code: number | null,
    public stderr: string,
  ) {
    super(message);
  }
}

/** Run a tool and resolve with its stdout. Rejects with the tail of stderr when it fails. */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new ToolError('Cancelled', null, ''));
    const child = spawn(cmd, args, { windowsHide: true, cwd: opts.cwd });
    let out = '';
    let errTail = '';
    const lines = (cb?: (l: string) => void) => {
      let buf = '';
      return (chunk: Buffer) => {
        if (!cb) return;
        buf += chunk.toString();
        const parts = buf.split(/\r?\n|\r/);
        buf = parts.pop() ?? '';
        for (const p of parts) if (p) cb(p);
      };
    };
    const outLines = lines(opts.onStdout);
    const errLines = lines(opts.onStderr);
    child.stdout.on('data', (c: Buffer) => {
      if (opts.collect !== false) out += c.toString();
      outLines(c);
    });
    child.stderr.on('data', (c: Buffer) => {
      errTail = (errTail + c.toString()).slice(-4000);
      errLines(c);
    });
    const onAbort = () => child.kill('SIGKILL');
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (e) => {
      opts.signal?.removeEventListener('abort', onAbort);
      reject(new ToolError(`Could not start ${path.basename(cmd)}: ${e.message}`, null, ''));
    });
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (opts.signal?.aborted) return reject(new ToolError('Cancelled', code, errTail));
      if (code === 0) resolve(out);
      else reject(new ToolError(`${path.basename(cmd)} exited with code ${code}`, code, errTail));
    });
  });
}

export type ToolStatus = Record<'yt-dlp' | 'ffmpeg' | 'ffprobe', { ok: boolean; version?: string; path: string }>;

let cached: { at: number; value: ToolStatus } | null = null;

/** Which tools are installed (cached for a minute). */
export async function checkTools(): Promise<ToolStatus> {
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const probe = async (p: string, args: string[], parse: (s: string) => string) => {
    try {
      return { ok: true, version: parse(await run(p, args)), path: p };
    } catch {
      return { ok: false, path: p };
    }
  };
  const ffv = (s: string) => s.match(/version\s+(\S+)/)?.[1] ?? 'unknown';
  const value: ToolStatus = {
    'yt-dlp': await probe(tools.ytdlp, ['--version'], (s) => s.trim()),
    ffmpeg: await probe(tools.ffmpeg, ['-version'], ffv),
    ffprobe: await probe(tools.ffprobe, ['-version'], ffv),
  };
  cached = { at: Date.now(), value };
  return value;
}
