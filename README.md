# Cliper Agent

**Paste a trending video link. Get ready-to-post clips, sized for phone or desktop, and post them to your social accounts.**

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
- **Three clipping modes:**
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
- **Scout**: type a topic (a game, a streamer, an event) and see the videos and creators most worth clipping right now, ranked by momentum, views and audience, from YouTube and Twitch.
- **Autopilot**: a standing order such as "every 6 hours, clip the 3 best new GTA 6 videos and post them an hour apart". Finds, downloads, clips, edits, writes the post and publishes. Guide: [docs/AUTOPILOT.md](docs/AUTOPILOT.md).
- **Edits that make clips ready to post**: burned-in captions (the spoken word lights up), a hook title, the creator's credit, even loudness.
- **Post text written for you**: every clip gets a title and a caption with credit and hashtags, by Claude when an API key is set.
- **Post to your channels**: connect YouTube, TikTok, Instagram, Facebook Pages, X and LinkedIn once, then post a clip (or all of them) to several accounts in one go. Post now, schedule, or space clips out over hours or days. Setup: [docs/SOCIAL.md](docs/SOCIAL.md).
- **Post automatically**: tick accounts when you start a job and every clip is posted as soon as it is ready.
- **Fast**: clips of one video render side by side, and a graphics card (NVIDIA, Intel, AMD) is used when the server has one.
- **Trending tab**: YouTube's real *most popular* chart by category when a YouTube API key is set, otherwise search-based discovery. **Clip this** sends a video straight to the clipper.
- **Accounts**: email + password. The first account is the admin. Sign-up can be closed. Each person only sees their own jobs.
- **Housekeeping**: finished jobs and their files are deleted after `KEEP_JOBS_DAYS` (default 7).
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
                                         ├─ whisper  → what is said (captions; optional)
                                         ├─ claude   → hook, title, caption, hashtags (optional)
                                         └─ ffmpeg   → each clip: trim → reframe → captions/hook/credit → H.264/AAC + thumbnail
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · API: [docs/API.md](docs/API.md) · Scout, edits and autopilot: [docs/AUTOPILOT.md](docs/AUTOPILOT.md) · Social accounts: [docs/SOCIAL.md](docs/SOCIAL.md) · Proxmox: [docs/PROXMOX.md](docs/PROXMOX.md)

## Repository layout

```
backend/   Node.js + Express + TypeScript + Prisma (PostgreSQL) API and the clipping engine (src/clipper)
mobile/    Expo Router app: web, Android and iOS from one codebase
deploy/    Production stack: Docker Compose, Caddy (HTTPS), backups
docs/      Architecture, API reference, social-account setup, Proxmox guide
```

## Deploy on your server

You need a Linux server with Docker. Video rendering is CPU-heavy, so plan on 4+ cores and enough disk for the clips you keep.
**On Proxmox**, [docs/PROXMOX.md](docs/PROXMOX.md) covers creating the VM (one script), sizing, HTTPS or a Cloudflare Tunnel, and GPU passthrough.

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
| `RENDER_PARALLEL` | `0` | Clips of one video rendered at once (`0` = from the CPU cores) |
| `VIDEO_ENCODER` | `libx264` | `h264_nvenc`, `h264_qsv` or `h264_vaapi` with a graphics card (falls back to `libx264`) |
| `PUBLIC_URL` | – | The site's public https address; needed to connect social accounts |
| `YOUTUBE_CLIENT_ID` … `LINKEDIN_CLIENT_SECRET` | – | Developer-app keys per platform ([docs/SOCIAL.md](docs/SOCIAL.md)) |
| `CAPTIONS` / `WHISPER_URL` | – | Speech-to-text for captions: `CAPTIONS=local` (bundled container) or a hosted service's address |
| `ANTHROPIC_API_KEY` | – | Claude writes hooks, titles, captions and hashtags, and can pick moments from the transcript |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | – | Lets Scout rank Twitch clips and streamers |
| `TOKEN_ENCRYPTION_KEY` | from `JWT_SECRET` | Encrypts stored social-account tokens |
| `YOUTUBE_API_KEY` | – | Enables YouTube's real trending chart in the Trending tab |
| `TRENDING_REGION` | `US` | Country for the trending chart |
| `ALLOW_PRIVATE_URLS` | `false` | Development only: allow links to localhost / private networks |

## Responsible use

Only clip videos you own or have permission to reuse, and respect each platform's terms and creators' rights.
