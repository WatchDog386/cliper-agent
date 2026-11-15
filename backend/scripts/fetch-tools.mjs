#!/usr/bin/env node
/*
 * Downloads the standalone yt-dlp program into backend/bin for local development (no Python needed).
 * ffmpeg and ffprobe come from the ffmpeg-static / ffprobe-static packages installed by `npm install`.
 * The Docker image installs all three itself, so this is only for running the API on your own machine.
 *
 *   npm run tools          # download (or update) yt-dlp
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.resolve(here, '..', 'bin');

const asset = (() => {
  const { platform, arch } = process;
  if (platform === 'win32') return 'yt-dlp.exe';
  if (platform === 'darwin') return 'yt-dlp_macos';
  if (platform === 'linux') return arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
  throw new Error(`No standalone yt-dlp build for ${platform}; install it with pip and set YTDLP_PATH`);
})();

const target = path.join(bin, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;

fs.mkdirSync(bin, { recursive: true });
console.log(`⬇  ${url}`);
const res = await fetch(url, { redirect: 'follow' });
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status}`);
  process.exit(1);
}
const data = Buffer.from(await res.arrayBuffer());
fs.writeFileSync(target, data);
if (process.platform !== 'win32') fs.chmodSync(target, 0o755);
console.log(`✔  yt-dlp saved to ${path.relative(process.cwd(), target)} (${(data.length / 1e6).toFixed(1)} MB)`);
