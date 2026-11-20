// npm run setup — one-time setup on macOS, Windows or Linux:
// installs the API and the app, creates the .env files, downloads yt-dlp, creates the database tables
// (Supabase or local Postgres) and runs the doctor.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend');
const mobile = path.join(root, 'mobile');
const say = (s = '') => console.log(s);
const step = (s) => say(`\n▶ ${s}`);
const sh = (cmd, cwd) => spawnSync(cmd, { cwd, stdio: 'inherit', shell: true }).status === 0;

// React Native / Expo support Node ^22.13 || ^24.3 || >=26 (odd "current" releases like 23 and 25 are skipped)
const [major, minor] = process.versions.node.split('.').map(Number);
const supported = (major === 22 && minor >= 13) || (major === 24 && minor >= 3) || major >= 26;
if (!supported && process.env.SKIP_NODE_CHECK !== '1') {
  say(`✗ Node.js ${process.versions.node} is not supported by the app's toolchain (React Native / Expo need 22.13+, 24.3+ or 26+).`);
  say('  Install Node 24 LTS:');
  say(process.platform === 'win32' ? '    winget install OpenJS.NodeJS.LTS      (or download it from https://nodejs.org)' : process.platform === 'darwin' ? '    brew install node@24      (or https://nodejs.org)' : '    https://nodejs.org (or: nvm install 24)');
  say('  then open a new terminal, check `node -v`, delete backend/node_modules and mobile/node_modules, and run npm run setup again.');
  say('  (To try anyway: set SKIP_NODE_CHECK=1)');
  process.exit(1);
}
if (/onedrive/i.test(root)) {
  say('⚠ This folder is inside OneDrive. OneDrive syncs node_modules (tens of thousands of files) and can lock');
  say('  files mid-install (EPERM / EBUSY errors). If installs fail, move the folder to e.g. C:\\dev\\cliper-agent.');
}

// ── .env files ──
step('Configuration');
const benv = path.join(backend, '.env');
let fresh = false;
if (!fs.existsSync(benv)) {
  fs.copyFileSync(path.join(backend, '.env.example'), benv);
  fresh = true;
  say('  created backend/.env from backend/.env.example');
}
let text = fs.readFileSync(benv, 'utf8');
// A real signing key instead of the example one
if (/^JWT_SECRET=change-me/m.test(text)) {
  text = text.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`);
  fs.writeFileSync(benv, text);
  say('  generated a random JWT_SECRET');
}
const menv = path.join(mobile, '.env');
if (!fs.existsSync(menv)) {
  fs.copyFileSync(path.join(mobile, '.env.example'), menv);
  say('  created mobile/.env (EXPO_PUBLIC_API_URL=http://localhost:4000/api/v1)');
}
const dbUrl = /^DATABASE_URL=(.*)$/m.exec(text)?.[1]?.trim() ?? '';
const localDefault = dbUrl.startsWith('postgresql://cliper:cliper@localhost');
if (/YOUR-/.test(dbUrl) || !dbUrl) {
  say('✗ DATABASE_URL in backend/.env still has placeholders. Paste your Supabase Session pooler string (see docs/LOCAL.md).');
  process.exit(1);
}
say(localDefault ? '  database: local Postgres (localhost:5432). For Supabase, set DATABASE_URL in backend/.env' : `  database: ${new URL(dbUrl).hostname}`);

// ── Install ──
step('Installing the API (backend)');
if (!sh('npm install --no-audit --no-fund', backend)) process.exit(1);
step('Installing the app (mobile)');
if (!sh('npm install --no-audit --no-fund', mobile)) process.exit(1);
step('Downloading yt-dlp');
if (!sh('npm run tools', backend)) say('  ⚠ yt-dlp download failed: links will not work until it is installed (npm --prefix backend run tools)');

// ── Database ──
step('Creating the database tables');
const migrated = sh('npx prisma migrate deploy', backend);
if (!migrated) {
  say('\n✗ Could not create the tables. Check DATABASE_URL in backend/.env:');
  say('  Supabase → Project Settings → Database → Connection string → Session pooler (port 5432),');
  say('  with your database password and ?sslmode=require&connection_limit=5 at the end.');
  if (localDefault) say('  Or start a local Postgres: docker compose up -d db');
}

// ── Check ──
step('Health check (npm run doctor)');
sh('npm run doctor', backend);

say(fresh ? '\nAdd your keys to backend/.env (OPUSCLIP_API_KEY, optional WHISPER_CMD, YOUTUBE_API_KEY), then:' : '\nNext:');
say('  npm run dev        starts the API (http://localhost:4000) and the web app (http://localhost:8081)');
process.exit(migrated ? 0 : 1);
