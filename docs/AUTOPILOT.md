# Scout, edits and autopilot

The whole clipping job, end to end:

```
Scout ──► pick the best videos ──► download ──► find the moments ──► edit ──► write the post ──► post
(YouTube, Twitch)   (momentum, views,   (yt-dlp)    (loudness, or the    (reframe, captions,  (title, caption,   (your connected
                     audience)                       AI reading the       hook title, credit,  credit, hashtags)   accounts)
                                                     transcript)          even loudness)
```

You can run each step by hand, or let an **Autopilot** campaign run all of them on a schedule.

## What each tool does

| Step | Tool | Needs |
|---|---|---|
| Find videos and creators | YouTube Data API, Twitch API (or a plain yt-dlp search) | `YOUTUBE_API_KEY`, `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` (optional) |
| Download | yt-dlp | built in |
| Find the best moments | ffmpeg loudness meter; or Claude reading the transcript | built in; `ANTHROPIC_API_KEY` + captions for the second |
| Reframe, cut, speed, fades | ffmpeg | built in |
| Captions | Whisper (speech to text) + ffmpeg/libass (drawing) | `CAPTIONS=local` or `WHISPER_URL` |
| Hook title, creator credit | ffmpeg/libass | built in |
| Even loudness | ffmpeg `loudnorm` (−14 LUFS) | built in |
| Titles, captions, hashtags | Claude; or the video's own title | `ANTHROPIC_API_KEY` (optional) |
| Post and schedule | the platforms' APIs | [SOCIAL.md](SOCIAL.md) |

Nothing optional is required: without a transcription service clips come out without captions, without the
AI key the titles are built from the video's title, without API keys Scout falls back to a plain search.
The job's status line says which fallback was used (for example *3 clips ready · no captions (the
transcription service is not set up)*).

## Scout

**Scout** tab → type a topic (`GTA 6`, a streamer's name, an event) → pick the period and a minimum number of
views. You get:

- **Top creators**: who is behind the best videos, with subscribers / followers and total views.
- **Videos**, each with a score from 0 to 100:

  | Part | Weight | Meaning |
  |---|---|---|
  | Momentum | 55 % | Views per hour since it was published: what is taking off now |
  | Reach | 25 % | Total views |
  | Audience | 20 % | The creator's subscribers or followers |

  Each part is compared with the other videos found, on a log scale, so one giant channel does not flatten
  everything else.

**Clip this** sends a video to the Create tab; **Autopilot this topic** starts a campaign from it.

Sources:

- **YouTube with `YOUTUBE_API_KEY`**: the most-viewed and most relevant videos of the period, with publication
  dates and channel subscriber counts. Each Scout costs about 200 of the key's 10,000 daily quota units
  (answers are cached for 10 minutes).
- **YouTube without a key**: a yt-dlp search. It has views but no dates, so the period is ignored and momentum
  cannot be judged. Get a key at [console.cloud.google.com](https://console.cloud.google.com) (enable *YouTube
  Data API v3*, create an API key).
- **Twitch**: the most-viewed clips of the game in the period, and the follower counts of the streamers behind
  them. The topic is matched to a Twitch category, so use the game's name. Register an app at
  [dev.twitch.tv/console](https://dev.twitch.tv/console) (any redirect URL, category *Application Integration*)
  and copy its client ID and secret.

Live streams are skipped: a stream can be clipped once it has ended and its video is up.

## Edits

On the **Create** tab, under **Edits** (all on by default):

- **Captions**: what is said, a few words at a time. Three looks: the spoken word lights up, bold, or small.
- **Hook title**: a title in a box across the top for the first 4.5 seconds. *Written per clip* uses the AI
  (or, without it, the first sentence said in the clip, or the video's title); *My own text* puts the same
  line on every clip.
- **Credit the creator**: their name in a corner for the whole clip, and in the post's caption.
- **Even out the sound**: every clip at the loudness the platforms play at.
- **Choose moments by what is said** (Best moments mode): the AI reads the whole transcript and names the
  moments that work on their own. Without the AI key or captions, the loudest moments are used.
- **Topic**: used for hashtags and titles.

Every clip also gets **text ready to post**: a title, and a caption with the credit and hashtags. It is shown on
the clip, filled in when you press Post, and used by automatic posting.

### Switching captions on

Captions need speech-to-text. Two ways, in `deploy/.env`:

**On your own server** (free, private):

```
CAPTIONS=local
```

`deploy.sh` then starts a Whisper container next to the API. The model (about 500 MB for `small`) downloads on
first use. Transcribing runs on the CPU and competes with rendering for cores;
`WHISPER_MODEL=Systran/faster-whisper-base` is faster and less accurate, `…-medium` slower and better.

**A hosted service** (faster, pay per minute of audio):

```
WHISPER_URL=https://api.groq.com/openai/v1
WHISPER_API_KEY=…
WHISPER_MODEL=whisper-large-v3-turbo
```

Any service that speaks the OpenAI `audio/transcriptions` protocol works (OpenAI: `https://api.openai.com/v1`
with `whisper-1`).

### Switching the AI on

```
ANTHROPIC_API_KEY=sk-ant-…
```

from [console.anthropic.com](https://console.anthropic.com). One request per video writes the hook, title,
caption and hashtags for all its clips; choosing moments from the transcript is one more. `AI_MODEL` selects the
model (default `claude-opus-5-5`).

## Autopilot

**Scout → Autopilot → New autopilot.** A campaign is a standing order:

> every **6 hours**, find the best new videos about **GTA 6** on **YouTube and Twitch** published in the last
> **3 days** with **100K+ views**, clip the top **3** with my settings, and post them **an hour apart** to
> these accounts.

- **Clip settings** are taken from the Create tab as it is set when you start the campaign (length, view,
  framing, edits). Use *Best moments* for long videos.
- **A video is never clipped twice** by the same campaign.
- **Twitch clips** are already the moment: they are reframed and captioned whole, as one clip.
- **Posting**: tick accounts and every clip is posted by itself, spaced out. Leave them empty and the clips
  wait under *My clips* for you to review and post.
- **Run now** does a run at once; the switch pauses a campaign; deleting it keeps the clips it made.
- Each campaign shows what its last run did and when the next one is due.

Limits worth knowing: sources longer than the campaign's limit (60 minutes) or the server's
`MAX_SOURCE_MINUTES` are skipped; each run takes at most 10 videos; a person can have 10 campaigns.

## Use it fairly

Clipping other people's streams is only fine when they allow it. Many streamers run clipping programmes or
publish rules for clip channels: follow them, keep the credit on, and do not post a creator's work to accounts
where they have asked you not to. Platforms remove reposted content and strike the accounts that post it,
and YouTube and TikTok both demote unedited reuploads, so the creator's permission protects your accounts too.

## How far this has been tested

Ranking, caption layout, the edit pipeline (with the real ffmpeg), campaigns and their de-duplication are covered
by automated tests, and a full captioned job was run through a live server. The parts that talk to outside
services were tested against stand-ins, not the real thing, because the development environment had no
credentials or network access for them: the **YouTube and Twitch lookups**, the **Whisper container** (its
image name and settings are untested), and the **Claude calls**. Expect to confirm each with one real run; when
one fails, the job or campaign says so in its status line and carries on with the fallback.
