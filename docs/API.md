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
| GET | `/system` | `{ tools: { "yt-dlp", ffmpeg, ffprobe: { ok, version, path } }, queue: { running, concurrency }, encoder: { wanted, active, hardware, note, parallel }, publisher: { running, concurrency } }` |

## Social accounts

Setup per platform: [SOCIAL.md](SOCIAL.md). `:platform` is `youtube`, `tiktok`, `instagram`, `facebook`, `x` or `linkedin`.

| Method | Path | |
|---|---|---|
| GET | `/social/providers` | `{ providers: [{ platform, label, noun, configured, envNames, privacy, limits: { title?, caption, maxSeconds }, redirectUri }] }` |
| GET | `/social/accounts` | `{ accounts: [{ id, platform, name, handle, avatarUrl, needsReconnect, connectedAt }] }` (never tokens) |
| POST | `/social/connect/:platform` | `{ returnTo? }` → `{ url }`: open it; the person approves on the platform. `400 NOT_CONFIGURED` without the server's keys |
| GET | `/social/callback/:platform` | Where the platform sends the person back (no sign-in header; the single-use `state` identifies them). Redirects to `returnTo#connected=<PLATFORM>&name=…` or `returnTo#error=…` |
| DELETE | `/social/accounts/:id` | `204`. Forgets the tokens and cancels that account's waiting posts |

`returnTo` must be this site, a `CORS_ORIGIN`, or the phone app (`cliperagent://…`); anything else is replaced by `<site>/channels`.

## Posts

One post = one clip sent to one account.

| Method | Path | |
|---|---|---|
| GET | `/publications?status=all\|waiting\|published\|failed&jobId=` | `{ publications, stats: { waiting, published, failed } }` |
| POST | `/publications` | `{ clipIds, accountIds, title?, caption?, privacy?, scheduledAt?, everyMinutes? }` → `201 { publications }` (one per clip and account) |
| POST | `/publications/:id/retry` | Send a failed or cancelled post again → `{ publication }` |
| POST | `/publications/:id/cancel` | Stop a waiting, scheduled or uploading post → `{ publication }` |
| DELETE | `/publications/:id` | `204`. Removes the record (a published post stays on the platform) |

- `title` / `caption`: `{n}` becomes the clip's number, `{title}` the video's title.
- `privacy`: `public` (default), `unlisted`, `private`. Platforms without the notion post publicly.
- `scheduledAt`: ISO time for the first clip; `everyMinutes` spaces the following clips.
- Errors: `404` for clips or accounts that are not yours, `409 NEEDS_RECONNECT`, `400 TOO_LONG` (clip longer than the platform allows), `400 PAST`.

A publication:

```jsonc
{
  "id": "…", "status": "PUBLISHED", "scheduled": false, "runAt": "…", "title": "…", "caption": "…", "privacy": "public",
  "progress": 100, "attempts": 1, "error": null, "externalUrl": "https://www.youtube.com/shorts/…", "publishedAt": "…",
  "account": { "id": "…", "platform": "YOUTUBE", "name": "…", "handle": "@…", "avatarUrl": "…", "needsReconnect": false },
  "clip": { "id": "…", "index": 1, "jobId": "…", "jobTitle": "…", "duration": 30, "thumbUrl": "/media/clips/<id>/thumb?t=…" }
}
```

Statuses: `QUEUED` (waiting for `runAt`) `→ PUBLISHING → PUBLISHED`, or `FAILED` / `CANCELLED`.

### Posting automatically

`POST /jobs` and `POST /jobs/upload` (as a JSON form field) accept
`autoPublish: { accountIds, caption?, title?, privacy?, everyMinutes? }`. When the job finishes, every clip is
queued for every account, `everyMinutes` apart.

## Clip options for edits

Besides the options above, `options` accepts:

| Field | Default | |
|---|---|---|
| `captions` | `false` | Burn in what is said (needs a transcription service; skipped with a note otherwise) |
| `captionStyle` | `karaoke` | `karaoke` (spoken word lit up), `bold`, `minimal` |
| `hook` | `none` | `none`, `custom` (with `hookText`, at most 80 characters), `auto` (written per clip) |
| `credit` | `false` | The creator's name in a corner |
| `normalizeAudio` | `false` | Loudness evened out to −14 LUFS |
| `aiPick` | `false` | Best moments chosen from the transcript (needs captions and the AI key) |
| `topic` | – | For hashtags and titles |

Each clip in a job then carries `title`, `caption` (with credit and hashtags) and `transcript`.
`GET /config` reports `features: { captions, ai, twitch, youtubeApi }`.

## Scout

| Method | Path | |
|---|---|---|
| GET | `/scout/sources` | `{ sources: { youtube: { available, mode: "api" \| "search" }, twitch: { available, mode } } }` |
| GET | `/scout?topic=GTA 6&days=7&sources=youtube,twitch&minViews=&minSubscribers=&maxMinutes=` | `{ topic, videos, creators, notes, at }` (looked up at most every 10 min per topic) |

A video: `{ id, platform, kind: "video" | "clip", url, title, creator, creatorUrl, subscribers, views, publishedAt, duration, thumbnail, score }`.
A creator: `{ key, platform, name, url, subscribers, views, videos, score }`. `notes` says what each source found or why it could not look.

## Autopilot campaigns

| Method | Path | |
|---|---|---|
| GET | `/campaigns` | `{ campaigns }` |
| POST | `/campaigns` | `{ name, topic, sources, days?, minViews?, minSubscribers?, maxMinutes?, videosPerRun?, everyHours?, options, autoPublish?, enabled? }` → `201 { campaign }`; the first run follows at once |
| PUT | `/campaigns/:id` | Replace its settings → `{ campaign }` |
| PATCH | `/campaigns/:id` | `{ enabled }` → `{ campaign }` |
| POST | `/campaigns/:id/run` | Run now → `{ queued: [{ title, creator, url, jobId }], note, campaign }` |
| DELETE | `/campaigns/:id` | `204`. The clips it made are kept |

A campaign also reports `lastRunAt`, `nextRunAt`, `lastNote`, `videosTaken` and `recent` (the last videos it took, with their `jobId`).
`options.mode` must be `split` or `highlights`.
