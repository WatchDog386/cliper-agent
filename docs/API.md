# API reference

Base URL: `/api/v1`. JSON in and out. Send `Authorization: Bearer <token>` on everything except
`/config`, `/auth/register`, `/auth/login` and `/media/*` (which uses a `?t=` media token).
Errors look like `{ "error": { "message": "…", "code": "…", "details": [{ "field", "message" }] } }`.

## Public

| Method | Path | |
|---|---|---|
| GET | `/config` | `{ appName, allowSignup, limits: { maxSourceMinutes, maxClipsPerJob, maxUploadMb }, discover }` |
| GET | `/health` (no prefix) | `200 { status: "ok" }` while the database answers |

## Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` | `201 { token, user }` (first user → `ADMIN`) |
| POST | `/auth/login` | `{ email, password }` | `{ token, user }` |
| GET | `/auth/me` | | `{ user }` |
| PATCH | `/auth/me` | `{ name }` | `{ user }` |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` | `{ token, user }` (other devices signed out) |

Passwords: 8+ characters with a letter and a number.

## Clip options

```jsonc
{
  "mode": "split",          // split | highlights | custom
  "segmentSeconds": 30,     // 3–600 (split, highlights)
  "maxClips": 10,           // 1–200, capped by MAX_CLIPS_PER_JOB
  "startAt": 60,            // optional trim (seconds; split, highlights)
  "endAt": 600,
  "ranges": [{ "start": 65, "end": 95 }],   // custom mode
  "aspect": "phone",        // phone 9:16 | desktop 16:9 | square 1:1 | portrait 4:5 | original
  "fit": "blur",            // blur | crop | pad
  "focus": "center",        // start | center | end (crop)
  "quality": "1080",        // 480 | 720 | 1080 (short side of the frame)
  "fade": false,
  "mute": false,
  "speed": 1                // 0.5–2
}
```

Everything has a default except `ranges` in custom mode.

## Jobs

| Method | Path | |
|---|---|---|
| POST | `/source/inspect` | `{ url }` → `{ source: { title, uploader, duration, thumbnail, site, isLive, viewCount, url }, warnings, canClip }` (`422` if unreadable) |
| POST | `/jobs` | `{ url, options, title?, thumbnailUrl? }` → `201 { job }` |
| POST | `/jobs/upload` | multipart: `file` (video) + `options` (JSON string) + `title?` → `201 { job }` |
| GET | `/jobs?status=all\|active\|done\|failed` | `{ jobs, stats: { total, active, done, clips } }` (newest 100) |
| GET | `/jobs/:id` | `{ job }` with `clips` |
| POST | `/jobs/:id/cancel` | Stop a running job |
| POST | `/jobs/:id/retry` | Re-run a failed / cancelled job |
| POST | `/jobs/:id/reclip` | `{ options }` → `201 { job }`: a new job from the same source |
| DELETE | `/jobs/:id` | `204`. Removes the job and its files |
| DELETE | `/jobs/:id/clips/:clipId` | Remove one clip → `{ job }` |

A job:

```jsonc
{
  "id": "…", "status": "RENDERING", "progress": 64, "stage": "Rendering clip 3 of 5 · 40%",
  "title": "…", "uploader": "…", "sourceDuration": 812.4, "sourceWidth": 1920, "sourceHeight": 1080,
  "options": { … }, "error": null, "clipCount": 2, "totalBytes": 18234112,
  "zipUrl": "/media/jobs/<id>/zip?t=…",
  "clips": [{
    "id": "…", "index": 1, "startSec": 0, "endSec": 30, "duration": 30, "width": 1080, "height": 1920,
    "sizeBytes": 9123456, "score": 87,
    "videoUrl": "/media/clips/<id>/video?t=…", "thumbUrl": "/media/clips/<id>/thumb?t=…", "downloadUrl": "/media/clips/<id>/download?t=…"
  }]
}
```

Statuses: `QUEUED → FETCHING → ANALYZING → RENDERING → DONE`, or `FAILED` / `CANCELLED`.

## Media (signed links, no header)

Prefix every path with `/api/v1`. Tokens last 12 hours. Fetch the job again for fresh links.

| Path | |
|---|---|
| `/media/clips/:id/video?t=` | MP4, supports `Range` (seeking) |
| `/media/clips/:id/thumb?t=` | JPEG |
| `/media/clips/:id/download?t=` | MP4 as an attachment, e.g. `my-video-clip-01-9x16.mp4` |
| `/media/jobs/:id/zip?t=` | Every clip in one zip |

## Discover

| Method | Path | |
|---|---|---|
| GET | `/discover/categories` | `{ categories: [{ id, label }], mode, region }` |
| GET | `/discover?category=music&q=&region=KE` | `{ source: "youtube-trending" \| "search", items: [{ id, title, channel, thumbnail, duration, views, publishedAt, url }] }` (cached 10 min) |

## System

| Method | Path | |
|---|---|---|
| GET | `/system` | `{ tools: { "yt-dlp", ffmpeg, ffprobe: { ok, version, path } }, queue: { running, concurrency } }` |
