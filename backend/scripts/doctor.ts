/*
 * npm run doctor — checks that this machine can run Cliper Agent and says how to fix what is missing.
 *   database (Supabase or any Postgres) · migrations · storage · ffmpeg + libass · ffprobe · yt-dlp ·
 *   speech-to-text (auto captions) · OpusClip key (AI clips) · YouTube key (Trending)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import { checkTools, run, tools } from '../src/lib/tools';
import { STORAGE_ROOT, ensureStorage } from '../src/lib/storage';
import { transcriberStatus } from '../src/clipper/transcribe';
import { listTemplates, opusEnabled } from '../src/clipper/opus';
import { FONTS_DIR } from '../src/clipper/filters';

let problems = 0;
const ok = (label: string, detail = '') => console.log(`  ✓ ${label}${detail ? `  ${detail}` : ''}`);
const bad = (label: string, fix: string, required = true) => {
  if (required) problems++;
  console.log(`  ${required ? '✗' : '–'} ${label}\n      → ${fix}`);
};

async function main() {
  console.log(`\nCliper Agent doctor (${process.platform}, Node ${process.version})\n`);

  // ── Database ──
  const url = env.DATABASE_URL;
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  const supabase = /supabase\.(co|com)$/.test(host);
  try {
    await prisma.$queryRaw`SELECT 1`;
    ok('Database reachable', supabase ? `(Supabase · ${host})` : `(${host})`);
    if (supabase && !/sslmode=require/.test(url)) console.log('      note: add ?sslmode=require to DATABASE_URL for Supabase');
    if (supabase && /:6543\//.test(url) && !/pgbouncer=true/.test(url)) bad('Supabase transaction pooler without pgbouncer=true', 'Use the Session pooler (port 5432), or add &pgbouncer=true and run migrations against port 5432');
    try {
      const rows = await prisma.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null }[]>('SELECT migration_name, finished_at FROM "_prisma_migrations"');
      const want = fs.readdirSync(path.resolve(__dirname, '../prisma/migrations')).filter((d) => /^\d+_/.test(d));
      const done = new Set(rows.filter((r) => r.finished_at).map((r) => r.migration_name));
      const missing = want.filter((m) => !done.has(m));
      if (missing.length) bad(`${missing.length} migration(s) not applied`, 'npx prisma migrate deploy');
      else ok('Database schema up to date', `(${want.length} migrations)`);
    } catch {
      bad('Database has no tables yet', 'npx prisma migrate deploy');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message.split('\n').filter(Boolean).pop() : String(e);
    bad(
      `Cannot reach the database (${host || 'bad DATABASE_URL'})`,
      supabase
        ? 'Check DATABASE_URL in backend/.env: Supabase → Project Settings → Database → Connection string → Session pooler, with your database password and ?sslmode=require'
        : `Start Postgres (docker compose up -d db) or fix DATABASE_URL. ${msg ?? ''}`,
    );
  }

  // ── Storage ──
  try {
    ensureStorage();
    const probe = path.join(STORAGE_ROOT, '.write-test');
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe);
    ok('Storage writable', STORAGE_ROOT);
  } catch {
    bad(`Storage not writable: ${STORAGE_ROOT}`, 'Set STORAGE_DIR in backend/.env to a folder you can write to');
  }

  // ── Video tools ──
  const t = await checkTools();
  if (t.ffmpeg.ok) {
    ok('ffmpeg', `${t.ffmpeg.version} (${t.ffmpeg.path})`);
    const filters = await run(tools.ffmpeg, ['-hide_banner', '-filters']).catch(() => '');
    if (/\sass\s/.test(filters)) ok('ffmpeg has libass (burned-in captions)');
    else bad('ffmpeg has no libass: captions cannot be burned in', 'Install a full ffmpeg build (macOS: brew install ffmpeg; Windows: winget install Gyan.FFmpeg) and set FFMPEG_PATH', false);
  } else bad('ffmpeg not found', 'npm install (bundles ffmpeg-static), or install ffmpeg and set FFMPEG_PATH');
  if (t.ffprobe.ok) ok('ffprobe', t.ffprobe.version);
  else bad('ffprobe not found', 'npm install (bundles ffprobe-static), or install ffmpeg and set FFPROBE_PATH');
  if (t['yt-dlp'].ok) ok('yt-dlp', t['yt-dlp'].version);
  else bad('yt-dlp not found: links cannot be downloaded (uploads still work)', 'npm run tools');
  if (fs.existsSync(path.join(FONTS_DIR, 'Inter_800ExtraBold.ttf'))) ok('Caption fonts', FONTS_DIR);
  else bad('Caption fonts missing', `Restore backend/assets/fonts from git`, false);

  // ── Speech to text ──
  const w = await transcriberStatus();
  if (w.ok) ok('Speech to text (auto captions, smart cuts)', w.version);
  else {
    const py = process.platform === 'win32' ? 'python' : 'python3';
    bad(`Speech to text: ${w.version}`, `${py} -m pip install faster-whisper, then in backend/.env: WHISPER_CMD=${py} scripts/transcribe.py (the other auto-edit steps work without it)`, false);
  }

  // ── Keys ──
  if (opusEnabled()) {
    try {
      const tpl = await listTemplates();
      ok('OpusClip key works (AI clips)', `${tpl.length} brand template(s)`);
    } catch (e) {
      bad('OpusClip key set but rejected or unreachable', e instanceof Error ? e.message : String(e));
    }
  } else bad('OpusClip key not set: AI clips are off', 'Add OPUSCLIP_API_KEY=sk-… to backend/.env', false);
  if (env.YOUTUBE_API_KEY) ok('YouTube key set (real Trending chart)');
  else bad('No YouTube key: Trending uses search instead of the live chart', 'Optional: YOUTUBE_API_KEY in backend/.env', false);

  // ── Auth ──
  if (/change[-_ ]?me/i.test(env.JWT_SECRET)) bad('JWT_SECRET is still the example value', `Set a random one: ${randomHint()}`, env.NODE_ENV === 'production');

  console.log(problems ? `\n${problems} problem(s) to fix before clipping.\n` : '\nAll set. Start the API with: npm run dev\n');
  await prisma.$disconnect();
  process.exit(problems ? 1 : 0);
}

function randomHint() {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return 'openssl rand -hex 32';
  } catch {
    return `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;
  }
}

void main();
