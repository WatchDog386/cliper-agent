# Run Cliper Agent on your laptop (with Supabase)

Everything runs on your machine: the API, the job queue, ffmpeg rendering, speech-to-text and the web
app. Only the database lives in Supabase (or use a local Postgres instead). Works on macOS, Windows and Linux.

You need **Node.js 22+** and **git**. Python 3.9+ is only needed for auto captions.

## 1. Get the code

```bash
git clone -b claude/upbeat-heisenberg-iqqxhz https://github.com/WatchDog386/cliper-agent.git
cd cliper-agent
```

## 2. Database: Supabase

1. In Supabase open **Project Settings → Database → Connection string**.
2. Pick **Session pooler** (port **5432**; it works on IPv4 networks, unlike the direct connection, and
   Prisma migrations work through it. The *Transaction pooler* on port 6543 does not run migrations).
3. Copy it and put your database password in it. Add `?sslmode=require&connection_limit=5`:

```
postgresql://postgres.abcdefghijkl:YOUR-DB-PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=5
```

If the password has special characters (`@ : / ? # %`), URL-encode them (`@` → `%40`, `#` → `%23`).

> No Supabase? `docker compose up -d db` starts a local Postgres; keep the default `DATABASE_URL`.

## 3. API

```bash
cd backend
cp .env.example .env          # Windows (PowerShell): Copy-Item .env.example .env
```

Edit `backend/.env`:

| Setting | Value |
|---|---|
| `DATABASE_URL` | your Supabase string from step 2 |
| `JWT_SECRET` | a random string: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `OPUSCLIP_API_KEY` | `sk-…` from OpusClip (AI clips). Optional |
| `YOUTUBE_API_KEY` | YouTube Data API key (live Trending chart). Optional |
| `WHISPER_CMD` | see step 4. Optional |

Then:

```bash
npm install                   # also installs ffmpeg + ffprobe (ffmpeg-static)
npm run setup                 # downloads yt-dlp, creates the tables in Supabase, runs the doctor
npm run dev                   # http://localhost:4000/api/v1
```

`npm run doctor` checks everything (database, schema, storage, ffmpeg + captions support, yt-dlp,
speech-to-text, OpusClip key) and prints the fix for anything missing. Run it whenever something is off.

## 4. Auto captions (optional, recommended)

Captions and sentence-snapped cuts need speech-to-text, which runs on your CPU with faster-whisper:

```bash
# macOS / Linux
python3 -m pip install faster-whisper
# Windows
python -m pip install faster-whisper
```

In `backend/.env`:

```
WHISPER_CMD=python3 scripts/transcribe.py      # Windows: WHISPER_CMD=python scripts/transcribe.py
WHISPER_MODEL=base                             # tiny (fastest) · base · small · medium (most accurate)
```

The first captioned job downloads the model (about 150 MB for `base`) and caches it. Restart `npm run dev`
and check `npm run doctor` shows "Speech to text ✓". Without it, everything else in auto edit still works.

**ffmpeg and captions:** captions are burned in with libass. If the doctor says your ffmpeg has no
libass, install a full build (`brew install ffmpeg` on macOS, `winget install Gyan.FFmpeg` on Windows) and
set `FFMPEG_PATH=ffmpeg` and `FFPROBE_PATH=ffprobe` in `backend/.env`.

## 5. Web app

In a second terminal:

```bash
cd mobile
cp .env.example .env          # EXPO_PUBLIC_API_URL=http://localhost:4000/api/v1
npm install
npx expo start --web          # opens http://localhost:8081
```

Create the first account: **it becomes the admin**. To use the app from your phone on the same Wi-Fi,
set `EXPO_PUBLIC_API_URL=http://YOUR-LAPTOP-IP:4000/api/v1` and scan the QR code with Expo Go.

## Where things live

| What | Where |
|---|---|
| Users, projects, clips, brand kits, calendar | Supabase (Postgres) |
| Video files, thumbnails, logos | `backend/storage/` on your laptop (`STORAGE_DIR`) |
| Whisper models | your user cache (`~/.cache/huggingface`) |

Finished projects and their files are deleted after `KEEP_JOBS_DAYS` (7 by default; `0` keeps them).
Rendering uses your CPU: `CLIP_CONCURRENCY=1` is right for most laptops.

## Troubleshooting

- **`P1001: Can't reach database server`**: wrong host/port or the Supabase project is paused (free projects pause after a week idle; resume it in the dashboard). Use the *Session pooler* string.
- **`password authentication failed`**: reset the database password in Supabase and URL-encode special characters.
- **`prepared statement "s0" already exists`**: you used the Transaction pooler (6543). Switch to the Session pooler (5432).
- **Links fail with "yt-dlp not found"**: `npm run tools`, or install yt-dlp and set `YTDLP_PATH`.
- **No captions**: `npm run doctor` → Speech to text, and check the video has speech.
