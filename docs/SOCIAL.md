# Connecting social accounts

Cliper Agent posts clips to **YouTube, TikTok, Instagram, Facebook Pages, X and LinkedIn**. People connect
their accounts on the **Channels** tab; they approve on the platform's own page, and the server keeps only the
access tokens it is given (encrypted, see [Security](#security)).

Each platform only talks to apps it knows. So, once per server, the admin registers a free **developer app**
with each platform that should be available and puts its two keys in `deploy/.env`. A platform without keys
shows as *not set up*; the others work regardless.

## Before you start

1. The server needs a public **https** address (platforms refuse plain http). Set it in `deploy/.env`:
   ```
   PUBLIC_URL=https://clips.example.com
   ```
   No public IP? See the Cloudflare Tunnel section of [PROXMOX.md](PROXMOX.md).
2. Every developer app asks for a **redirect address**. It is always
   ```
   <PUBLIC_URL>/api/v1/social/callback/<platform>
   ```
   with `<platform>` one of `youtube`, `tiktok`, `instagram`, `facebook`, `x`, `linkedin`. The Channels tab
   shows the exact address for each platform (admins: **Set up on the server**). It has to match to the letter.
3. After editing `deploy/.env`, run `bash deploy/deploy.sh`. The API's start-up log lists the platforms it found.

## The six platforms

| Platform | Where | Keys in `deploy/.env` |
|---|---|---|
| YouTube | [console.cloud.google.com](https://console.cloud.google.com) | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` |
| TikTok | [developers.tiktok.com](https://developers.tiktok.com) | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |
| Instagram | [developers.facebook.com](https://developers.facebook.com) | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` |
| Facebook | [developers.facebook.com](https://developers.facebook.com) | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` |
| X | [developer.x.com](https://developer.x.com) | `X_CLIENT_ID`, `X_CLIENT_SECRET` |
| LinkedIn | [linkedin.com/developers](https://www.linkedin.com/developers) | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |

### YouTube

1. Create a project, then **APIs & Services → Library → YouTube Data API v3 → Enable**.
2. **OAuth consent screen**: External. Add the scopes `youtube.upload` and `youtube.readonly`.
   Set the publishing status to **In production** (in *Testing*, Google ends every sign-in after 7 days and
   the channel has to be reconnected each week).
3. **Credentials → Create credentials → OAuth client ID → Web application**. Add the redirect address.
   Copy the client ID and secret.

Good to know:
- Until Google has **audited** the project, videos uploaded through the API are locked to *private* on
  YouTube. Request the audit from the YouTube API Services form once things work.
- An upload costs 1,600 of the default 10,000 daily quota units: about **6 uploads a day** until you ask for more.
- Tall clips up to 3 minutes become Shorts automatically.

### TikTok

1. **Manage apps → Create app**. Add the products **Login Kit** and **Content Posting API**, and switch on
   **Direct Post** in the Content Posting API settings.
2. Add the redirect address under Login Kit. Scopes: `user.info.basic`, `video.publish`.
3. Copy the client key and secret.

Good to know: until TikTok has **audited** the app, it can only post as *private* ("Only me"). Choose
**Private** when posting; other choices are refused with a message that says so.

### Instagram

Works for **professional** accounts (Business or Creator; switching is free in the Instagram app).

1. Create a Meta app (type **Business**) and add the **Instagram** product → **API setup with Instagram login**.
2. Under **Business login settings**, add the redirect address.
3. Copy the **Instagram app ID** and **Instagram app secret** shown on that page (they differ from the Meta
   app's own ID and secret).

Good to know: without App Review, only Instagram accounts added as testers of the app can connect, which is
enough for your own accounts. Clips are published as Reels.

### Facebook

Posts to **Pages** (Facebook does not let apps post to personal profiles).

1. In a Meta app, add **Facebook Login for Business** and put the redirect address under
   **Valid OAuth Redirect URIs**.
2. Copy the **App ID** and **App secret** from **App settings → Basic**.

One sign-in connects every Page you tick. Without App Review this works for Pages managed by people who have a
role on the app.

### X

1. Create a project and app. Under **User authentication settings** choose **OAuth 2.0**, app type
   **Web App**, permissions **Read and write**, and add the redirect address.
2. Copy the **OAuth 2.0 Client ID and Client Secret**.

Good to know: X accepts videos up to 2 min 20 s, and how many posts an app may make depends on your X API plan.

### LinkedIn

1. Create an app (LinkedIn asks for a company page to attach it to).
2. **Products**: add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.
3. **Auth**: add the redirect address; copy the client ID and secret.

Good to know: posts go to the person's own profile. LinkedIn's access lasts about 60 days and cannot be renewed
silently, so the profile then shows *Connect again*.

## Posting

- **One clip or all of them**: on a finished video, press the paper-plane on a clip or **Post all clips**. Pick
  the accounts, write a title and caption, choose who can see it, and post now or schedule.
- **Several clips**: `{n}` in the title or caption becomes the clip's number and `{title}` the video's title.
  *Time between clips* spreads them out (every 30 minutes, hour, day…).
- **Automatically**: on the Create page, tick accounts under **Post automatically**. Every clip is queued the
  moment the job finishes.
- **Channels → Posts** shows everything waiting, scheduled, posted and failed, with links to the live posts.
  Failed posts can be sent again; waiting ones can be cancelled.

What the server does for you: renews tokens before they expire, retries rate limits and platform hiccups three
times (after 1, 5 and 15 minutes), and marks an account *Connect again* when a platform withdraws access. An
upload interrupted by a server restart is marked failed rather than re-sent, so nothing is ever posted twice
by accident. Videos with posts still scheduled are kept past `KEEP_JOBS_DAYS` until those posts have gone out.

## Security

- Tokens are encrypted in the database with AES-256-GCM. The key comes from `TOKEN_ENCRYPTION_KEY`
  (or from `JWT_SECRET` when that is empty). Changing the key disconnects every account.
- The API never returns a token; the app only sees names, handles and pictures.
- The OAuth `state` is random, single-use, expires after 15 minutes and is tied to the person who started it.
  X additionally uses PKCE.
- **Disconnect** deletes the tokens and cancels that account's waiting posts. To revoke access completely,
  also remove the app in the platform's own security settings.

## How far this has been tested

The connectors follow each platform's published API, and the whole flow (connect, token storage and renewal,
chunked upload, retries, scheduling) is covered by automated tests that stand in for the platforms' servers.
They have **not** been run against the live platforms with real developer apps, because that needs your
credentials. Expect to confirm each platform with one real post, and check the API's log line if a platform
answers with something unexpected: the message it sent is shown on the failed post.
