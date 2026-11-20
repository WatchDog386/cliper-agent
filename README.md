# Cliper Agent

**Paste a trending video link. Get ready-to-post clips, sized for phone or desktop.**

Cliper Agent downloads a video from a link (YouTube, TikTok, X/Twitter, Instagram, Facebook, Reddit, Vimeo,
direct `.mp4` links and [about 1,800 other sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)),
or takes a file you upload. It cuts the video into clips of the length you choose and reframes them for where
they'll be watched:

| View | Size (1080p) | For |
|---|---|---|
| **Phone** | 1080 × 1920 (9:16) | TikTok, Reels, Shorts, Stories |
| **Desktop** | 1920 × 1080 (16:9) | YouTube, websites, presentations |
| **Square** | 1080 × 1080 (1:1) | Feeds |
| **Portrait** | 1080 × 1350 (4:5) | Instagram feed |
| **Original** | source shape | Just cut, no reframing |

## Features

- **Link or upload.** Paste a link, or tap **Paste**, and the app previews the title, length and thumbnail. You can also upload a video file (with upload progress).
- **Four clipping modes:**
  - **AI clips (OpusClip)**: the AI finds the viral hooks in a long video, renders vertical clips with animated captions, and writes a headline, a post caption and hashtags for each, with a **virality score** (clips come back ranked). Choose *ClipAnything* (any video, follows your prompt, e.g. "the funniest reactions") or *ClipBasic* (talking videos), a length range, an AI hook headline and one of your OpusClip brand templates. Needs `OPUSCLIP_API_KEY`.
  - **Split evenly**: back-to-back clips of a set length (15 s, 30 s, 45 s, 1 min, 90 s, 3 min, or any length from 3 s to 10 min).
  - **Best moments**: the agent measures loudness every second (EBU R128) and picks the most energetic, non-overlapping moments.
  - **My time ranges**: cut exactly the parts you list (`1:05 → 1:35`, …).
- **Trim**: use only part of the video (from / to).
- **Framing** when the shape changes: **blurred background**, **fill & crop** (with left / centre / right focus), or **black bars**.
- **Quality**: 480p, 720p or 1080p.
- **Extras**: fade in/out, remove sound, speed 0.75×–2×, a cap on the number of clips.
- **Live progress**: download, analyse, clip, with a percentage and a step indicator. Jobs can be cancelled or retried.
- **Clip gallery**: each clip is shown at its true shape and plays inline. Download clips one at a time or **all as a .zip**. On phones, the share sheet saves to the gallery or posts directly.
- **Re-clip in one tap**: "Make desktop version" / "Make phone version" of the same video.
- **Trending tab**: YouTube's real *most popular* chart by category when a YouTube API key is set, otherwise search-based discovery. **Clip this** sends a video straight to the clipper.
- **Accounts**: email + password. The first account is the admin. Sign-up can be closed. Each person only sees their own jobs.
- **Housekeeping**: finished jobs and their files are deleted after `KEEP_JOBS_DAYS` (default 7).
- **Studio UI**: a dark "neon studio" design (lime actions, violet AI glow) with a Home dashboard (one-box link → clips), a two-column Create studio with a live summary, Projects with search, a per-clip page (player, AI caption to copy, virality ring, previous / next), an Admin page (team, storage, failures) and a 404 page.
- **Demo build**: `EXPO_PUBLIC_DEMO=1 npx expo export -p web` builds the whole app with sample projects in the browser and no server, for previews.
- **Runs everywhere**: one Expo codebase gives a responsive web app (a side rail on desktop, a floating tab bar on phones), an installable PWA, and Android/iOS builds.

## How it works

```
 app (Expo: web / Android / iOS)
   │  POST /jobs {url, options}            GET /jobs/:id (poll)        /media/... (signed links)
   ▼
 API (Express + Prisma/Postgres) ──► job queue (DB-backed, CLIP_CONCURRENCY at a time)
                                         │
                                         ├─ yt-dlp   → download the source (≤ chosen quality)
                                         ├─ ffprobe  → length, size, sound
                                         ├─ ffmpeg   → loudness per second (best-moments mode)
                                         └─ ffmpeg   → each clip: trim → reframe → speed/fade → H.264/AAC + thumbnail
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · API: [docs/API.md](docs/API.md)

## Repository layout

```
backend/   Node.js + Express + TypeScript + Prisma (PostgreSQL) API and the clipping engine (src/clipper)
mobile/    Expo Router app: web, Android and iOS from one codebase
deploy/    Production stack: Docker Compose, Caddy (HTTPS), backups
docs/      Architecture and API reference
```

## Deploy on your server

You need a Linux server with Docker. Video rendering is CPU-heavy, so plan on 2+ cores and enough disk for the clips you keep.

```bash
git clone https://github.com/WatchDog386/cliper-agent.git && cd cliper-agent
sudo bash deploy/install.sh            # once, on a fresh Ubuntu server: Docker, firewall, swap
cp deploy/.env.example deploy/.env     # set SITE_ADDRESS (your domain), POSTGRES_PASSWORD, JWT_SECRET
bash deploy/deploy.sh                  # build + start (use it for every update too)
```

Open your domain and **create the first account: it becomes the admin**. Then set `ALLOW_SIGNUP=false`
if the server is just for your team.

- **Your own database server**: set `DATABASE_URL=postgresql://…` in `deploy/.env`. The bundled `db` service is then unused.
- **HTTPS**: point a DNS record at the server and set `SITE_ADDRESS=clips.example.com`. Caddy gets the certificate automatically.
- The API image contains **ffmpeg** and **yt-dlp**. Sites change often, so rebuild now and then (`bash deploy/deploy.sh`) to get a fresh yt-dlp.

## Local development

Prerequisites: Node.js 22+, PostgreSQL 16 (or Docker).

```bash
docker compose up -d db                 # Postgres on localhost:5432

cd backend
cp .env.example .env
npm install                             # also installs ffmpeg + ffprobe binaries (ffmpeg-static)
npm run tools                           # downloads the standalone yt-dlp into backend/bin
npx prisma migrate deploy
npm run dev                             # http://localhost:4000/api/v1

cd ../mobile
npm install
npx expo start --web                    # or scan the QR code with Expo Go (set EXPO_PUBLIC_API_URL to your LAN IP)
```

### Video tools

The API looks for each tool in this order: the `*_PATH` setting → `backend/bin` (`npm run tools`) /
`ffmpeg-static` → the program on `PATH`. **Settings → Server** in the app shows which ones were found.

### Tests

```bash
cd backend
npm test                                # API + end-to-end clipping with real ffmpeg (needs Postgres)
SKIP_DB=1 npx vitest run test/plan.test.ts   # planner / filter unit tests only
```

## Configuration (`backend/.env` / `deploy/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `ALLOW_SIGNUP` | `true` | Anyone can create an account (the first account is always allowed and becomes admin) |
| `MAX_UPLOAD_MB` | `2048` | Largest upload |
| `MAX_SOURCE_MINUTES` | `180` | Longest source video |
| `MAX_CLIPS_PER_JOB` | `50` | Most clips from one video |
| `CLIP_CONCURRENCY` | `1` | Jobs rendered at once (about 1 per 4 cores) |
| `KEEP_JOBS_DAYS` | `7` | Delete finished jobs and their clips after this many days (`0` = keep forever) |
| `X264_PRESET` / `X264_CRF` | `veryfast` / `22` | Encoding speed vs. quality |
| `YOUTUBE_API_KEY` | – | Enables YouTube's real trending chart in the Trending tab |
| `TRENDING_REGION` | `US` | Country for the trending chart |
| `ALLOW_PRIVATE_URLS` | `false` | Development only: allow links to localhost / private networks |
| `OPUSCLIP_API_KEY` | – | OpusClip API key: switches on **AI clips**. Server-side only; never commit it |
| `OPUSCLIP_TIMEOUT_MINUTES` | `120` | Give up on an OpusClip project after this long |
| `TRUST_PROXY` | `1` (prod) | Proxies in front of the API; `2` behind Cloudflare ([docs/CLOUDFLARE.md](docs/CLOUDFLARE.md)) |

## AI clips (OpusClip)

1. Get an API key in the OpusClip dashboard (API access is on the Pro (Beta), Max and Business plans).
2. Put it in `backend/.env` (development) or `deploy/.env` (production) as `OPUSCLIP_API_KEY=sk-…` and restart the API.
3. **Settings** shows *AI engine · OpusClip: Connected* and your brand templates.

An AI project: the server creates an OpusClip project from the link (`POST /api/clip-projects`), polls it
(about every 20 s, well under the 30 requests/minute limit), then downloads each finished clip into its own
storage with a thumbnail, so downloads, the zip, the clip page and retention work as for any other project.
A retry re-uses the OpusClip project instead of paying for it again. Credits: 1 per source minute,
10 minimum per project. AI clips need a link (uploads use the other modes).

## Behind Cloudflare

See [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md): edge caching of the hashed scripts and fonts, `TRUST_PROXY=2`,
SSL "Full (strict)" and the 100 MB upload limit.

## Responsible use

Only clip videos you own or have permission to reuse, and respect each platform's terms and creators' rights.
