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
| `modules/media` | Clip video (range requests), thumbnails, downloads, zip of all clips (signed links) |
| `clipper/options.ts` | The options schema and output frame sizes |
| `clipper/plan.ts` | Which segments to cut: split / highlights / custom (pure functions, unit-tested) |
| `clipper/filters.ts` | The ffmpeg filter graph for each view and framing (pure, unit-tested) |
| `clipper/media.ts` | ffprobe, loudness analysis, rendering, thumbnails |
| `clipper/source.ts` | yt-dlp metadata and download |
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

### Rendering

One ffmpeg process per clip: fast seek (`-ss` before `-i`), then a filter graph:

* **crop**: scale to cover, crop to the frame at the chosen focus (start / centre / end)
* **blur**: the picture scaled to fit, over a copy blurred at quarter size (cheap) and scaled to fill
* **pad**: scale to fit, black bars
* then `setsar=1`, optional `setpts` speed change, optional fades, `yuv420p`

Audio: `atempo` for speed, `afade` for fades, or dropped (`-an`) when muted. Output is H.264 (`X264_PRESET`,
`X264_CRF`) + AAC 128k with `+faststart`, so it plays while it downloads. A 480-px JPEG thumbnail is taken
from the middle of each clip.

### Security

* Passwords: bcrypt. Sessions: JWT carrying a session version, checked against the database (10 s cache).
* **Media links**: `<video>` and download links can't send headers, so each job's file URLs carry a 12-hour
  token of type `media`. It opens only that job's files and is refused as a session token (and vice versa).
* **SSRF guard**: links must be http(s) and every address the host resolves to must be public (no
  localhost, RFC 1918, link-local / cloud metadata, CGNAT, multicast…). `ALLOW_PRIVATE_URLS` relaxes this for development.
* Rate limits per account / address, with a stricter limit on sign-in and sign-up.
* Uploads: only video types, size-capped, written to disk (never held in memory).

## App (`mobile/`)

| Route | Screen |
|---|---|
| `login` | Sign in / create account |
| `(tabs)/create` | The clipper: link or upload, mode, length, trim / ranges, view, framing, quality, extras, estimate |
| `(tabs)/library` | Your jobs with live progress, filters |
| `(tabs)/discover` | Trending and search → **Clip this** |
| `(tabs)/settings` | Profile, password, theme, default settings, server tool status |
| `job/[id]` | Progress steps, clip gallery (true shape, inline player), downloads, zip, re-clip, delete |

Reused from the template: theme tokens (`src/theme`), `Text`, `Button`, `Input`, `Segmented`, `Glass`, the
motion helpers, secure storage and the fonts (Figtree on phones, Inter on desktop browsers). Wide browsers get a side rail; phones get
the floating pill tab bar.

## Deployment (`deploy/`)

`docker-compose.prod.yml` runs Postgres, the API (with ffmpeg and yt-dlp), Caddy (serving the web build, proxying `/api`,
automatic HTTPS, uploads up to `MAX_UPLOAD_MB`), and a daily database backup. Clips live in the `storage`
volume and expire after `KEEP_JOBS_DAYS`.
