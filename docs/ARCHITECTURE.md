# Architecture

Cliper Agent is built on the Optimas MS template: an Express + Prisma API, an Expo Router app (web, Android and iOS from one
codebase) with the template's "glass" design system, and a Docker + Caddy production stack.

## Backend (`backend/src`)

| Path | Role |
|---|---|
| `app.ts` | Express app: security headers, CORS, rate limits, routes |
| `modules/auth` | Register, sign in, profile, password change (bumps `sessionVersion` → other devices signed out) |
| `modules/jobs` | Create jobs from a link or an upload; list, get, cancel, retry, re-clip, delete |
| `modules/source` | `POST /source/inspect`: link preview through yt-dlp, without downloading |
| `modules/discover` | Trending: YouTube Data API chart, or yt-dlp search when no key is set |
| `modules/social` | Connect accounts (OAuth 2), list / disconnect them; create, list, retry and cancel posts |
| `social/providers/*` | One file per platform: authorise URL, code exchange, token renewal, upload and publish |
| `social/publisher.ts` | The posting queue (scheduled posts, retries) |
| `social/autopublish.ts` | Queues a finished job's clips for the accounts chosen at creation |
| `lib/secret-box.ts` | AES-256-GCM encryption of the stored account tokens |
| `modules/scout` | `GET /scout` (ranked videos and creators) and the Autopilot campaigns |
| `scout/*` | Sources (YouTube Data API, Twitch Helix, yt-dlp search) and the ranking (pure, unit-tested) |
| `autopilot/runner.ts` | Runs due campaigns: scout → drop what was already taken → queue clip jobs |
| `ai/copy.ts` | Claude: hook, title, caption and hashtags per clip; moments from a transcript. Non-AI fallbacks |
| `clipper/transcribe.ts` | Speech → timed words through a Whisper server (OpenAI protocol) |
| `clipper/overlay.ts` | Captions, hook title and credit as an ASS file for ffmpeg/libass (pure, unit-tested) |
| `modules/media` | Clip video (range requests), thumbnails, downloads, zip of all clips (signed links) |
| `clipper/options.ts` | The options schema and output frame sizes |
| `clipper/plan.ts` | Which segments to cut: split / highlights / custom (pure functions, unit-tested) |
| `clipper/filters.ts` | The ffmpeg filter graph for each view and framing (pure, unit-tested) |
| `clipper/media.ts` | ffprobe, loudness analysis, rendering, thumbnails |
| `clipper/source.ts` | yt-dlp metadata and download |
| `clipper/encoder.ts` | Which H.264 encoder to use (CPU or graphics card), tested at start-up; how many clips render at once |
| `clipper/queue.ts` | The job runner |
| `clipper/retention.ts` | Hourly clean-up of old jobs and abandoned uploads |
| `lib/url-guard.ts` | SSRF protection: only public http(s) hosts may be fetched |
| `lib/tools.ts` | Finds yt-dlp / ffmpeg / ffprobe and runs them |

### Job lifecycle

```
QUEUED ──claim──► FETCHING ──► ANALYZING ──► RENDERING ──► DONE
   ▲                 │              │             │
   │                 └──────────────┴─────────────┴──► FAILED / CANCELLED
   └──── retry / server restart ◄─────────────────────────┘
```

* The **database is the queue**. A job is claimed with a conditional update (`status = QUEUED`), so two
  processes never take the same job. `CLIP_CONCURRENCY` jobs run at once.
* Progress (0–100) and a readable stage (`Rendering clip 3 of 8 · 40%`) are written at most a few times a second.
  The app polls `GET /jobs/:id`.
* **Cancel** marks the job and kills its yt-dlp / ffmpeg process at once. **Delete** also removes the files.
* Jobs that were running when the server stopped are put back in the queue at the next start.
* Progress budget: download 0–35 %, analysis +12 % (best-moments mode), rendering split evenly over the clips.

### Planning

* **Split**: back-to-back clips of `segmentSeconds` within the trim window. A tail shorter than a third of a
  clip (and under 3 s minimum) is dropped. A video shorter than one clip becomes one clip.
* **Best moments**: ffmpeg's EBU R128 meter gives momentary loudness every 100 ms. This is averaged per second.
  Every window is scored `mean + 0.15 × spread` (prefix sums, O(n)), and the best non-overlapping windows are
  kept and returned in time order with a 0–100 score. With no usable audio, clips are spread evenly.
* **Custom**: the listed ranges, clamped to the video and sorted.

### Edits and post text

After the segments are planned: the words of each clip are fetched (captions on, or a hook to write), the text
for all clips is written in one request (or built from the video's title), and each clip is rendered with an ASS
overlay drawn after the speed change and before the fades. ffmpeg runs inside the job's folder so the overlay is
named without a path. Every optional helper degrades instead of failing the job: the finished job's stage line
carries a note such as *no captions (the transcription service is not set up)*. Details: [AUTOPILOT.md](AUTOPILOT.md).

### Rendering

One ffmpeg process per clip, several clips at a time (`RENDER_PARALLEL`; automatic from the core count, because
x264 uses every core but the reframing filters do not). Fast seek (`-ss` before `-i`), then a filter graph:

* **crop**: scale to cover, crop to the frame at the chosen focus (start / centre / end)
* **blur**: the picture scaled to fit, over a copy blurred at quarter size (cheap) and scaled to fill
* **pad**: scale to fit, black bars
* then `setsar=1`, optional `setpts` speed change, optional fades, `yuv420p`

The encoder is libx264 unless `VIDEO_ENCODER` names a hardware one (`h264_nvenc`, `h264_qsv`, `h264_vaapi`).
That one is tried with a tiny render at start-up; if it fails, the server logs why and uses libx264.

Audio: `atempo` for speed, `afade` for fades, or dropped (`-an`) when muted. Output is H.264 (`X264_PRESET`,
`X264_CRF`) + AAC 128k with `+faststart`, so it plays while it downloads. A 480-px JPEG thumbnail is taken
from the middle of each clip.

### Posting to social accounts

```
app ── POST /social/connect/youtube ──► { url }  ──► the platform's approval page
                                                          │ redirect with ?code&state
platform ── GET /social/callback/youtube ◄────────────────┘
   └─ state checked (single use, 15 min) → code traded for tokens → channel looked up
      → tokens encrypted → SocialAccount saved → back to the app (#connected=YOUTUBE)

POST /publications ──► Publication rows (QUEUED, runAt) ──► publisher (PUBLISH_CONCURRENCY at once)
   └─ token renewed if needed → provider.publish(): chunked upload → wait for processing → post
      → PUBLISHED with the post's link · rate limit / 5xx: retried after 1, 5, 15 min · 401: account flagged
```

* Every platform implements one small interface (`social/types.ts`): `authorizeUrl`, `exchange`, optional
  `refresh`, `publish`. Adding a platform is one file plus a line in `providers/index.ts`.
* Uploads are read from disk in pieces (4–16 MB), never a whole file in memory, using each platform's
  resumable protocol.
* An upload cut off by a restart is marked failed, not re-sent: a post is never duplicated by guessing.
* Retention skips jobs whose clips still have posts waiting.

### Security

* Passwords: bcrypt. Sessions: JWT carrying a session version, checked against the database (10 s cache).
* **Media links**: `<video>` and download links can't send headers, so each job's file URLs carry a 12-hour
  token of type `media`. It opens only that job's files and is refused as a session token (and vice versa).
* **SSRF guard**: links must be http(s) and every address the host resolves to must be public (no
  localhost, RFC 1918, link-local / cloud metadata, CGNAT, multicast…). `ALLOW_PRIVATE_URLS` relaxes this for development.
* **Social tokens** are encrypted at rest (AES-256-GCM, key from `TOKEN_ENCRYPTION_KEY` or `JWT_SECRET`) and never
  leave the server. OAuth `state` is random, single-use and bound to the person; X also uses PKCE. The address
  people are sent back to must be this site, a configured origin or the phone app.
* Rate limits per account / address, with a stricter limit on sign-in and sign-up.
* Uploads: only video types, size-capped, written to disk (never held in memory).

## App (`mobile/`)

| Route | Screen |
|---|---|
| `login` | Sign in / create account |
| `(tabs)/create` | The clipper: link or upload, mode, length, trim / ranges, view, framing, quality, extras, estimate |
| `(tabs)/library` | Your jobs with live progress, filters |
| `(tabs)/channels` | Connect social accounts; everything posted, scheduled or failed |
| `(tabs)/discover` | Trending and search → **Clip this** |
| `(tabs)/settings` | Profile, password, theme, default settings, server tool status |
| `job/[id]` | Progress steps, clip gallery (true shape, inline player), downloads, zip, re-clip, delete, post one clip or all |

Reused from the template: theme tokens (`src/theme`), `Text`, `Button`, `Input`, `Segmented`, `Glass`, the
motion helpers, secure storage and the fonts (Figtree on phones, Inter on desktop browsers). Wide browsers get a side rail; phones get
the floating pill tab bar.

## Deployment (`deploy/`)

For Proxmox (VM creation, sizing, tunnels, GPU passthrough) see [PROXMOX.md](PROXMOX.md).

`docker-compose.prod.yml` runs Postgres, the API (with ffmpeg and yt-dlp), Caddy (serving the web build, proxying `/api`,
automatic HTTPS, uploads up to `MAX_UPLOAD_MB`), and a daily database backup. Clips live in the `storage`
volume and expire after `KEEP_JOBS_DAYS`.
