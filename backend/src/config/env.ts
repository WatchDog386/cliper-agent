import 'dotenv/config';
import { z } from 'zod';

const bool = (def: 'true' | 'false') =>
  z
    .string()
    .default(def)
    .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  /** Number of reverse proxies in front of the API (1 behind Caddy). */
  TRUST_PROXY: z.coerce.number().default(0),
  LOGIN_RATE_LIMIT: z.coerce.number().default(30),
  API_RATE_LIMIT: z.coerce.number().default(600),
  /** Anyone may create an account. Set false once your team is in. */
  ALLOW_SIGNUP: bool('true'),

  /** Where sources, clips and thumbnails are written. */
  STORAGE_DIR: z.string().default('storage'),
  /** Largest video file that may be uploaded. */
  MAX_UPLOAD_MB: z.coerce.number().default(2048),
  /** Longest source video accepted (minutes). */
  MAX_SOURCE_MINUTES: z.coerce.number().default(180),
  /** Most clips one job may produce. */
  MAX_CLIPS_PER_JOB: z.coerce.number().int().min(1).default(50),
  /** Jobs rendered at the same time (each runs ffmpeg; 1–2 per 4 CPU cores is sensible). */
  CLIP_CONCURRENCY: z.coerce.number().int().min(1).default(1),
  /** Finished jobs and their files are deleted after this many days (0 keeps them forever). */
  KEEP_JOBS_DAYS: z.coerce.number().min(0).default(7),
  /** Keep the downloaded source next to the clips (uses much more disk). */
  KEEP_SOURCE: bool('false'),
  /** x264 speed/quality trade-off: ultrafast … veryfast … medium. */
  X264_PRESET: z.string().default('veryfast'),
  X264_CRF: z.coerce.number().default(22),
  /**
   * Video encoder. libx264 runs on any CPU. With a graphics card passed through to the server (Proxmox):
   * h264_nvenc (NVIDIA), h264_qsv (Intel Quick Sync) or h264_vaapi (Intel / AMD) render several times
   * faster. If the chosen one does not work at start-up the server falls back to libx264.
   */
  VIDEO_ENCODER: z.enum(['libx264', 'h264_nvenc', 'h264_qsv', 'h264_vaapi']).default('libx264'),
  VAAPI_DEVICE: z.string().default('/dev/dri/renderD128'),
  /** Clips of one job rendered at the same time. 0 = decide from the number of CPU cores. */
  RENDER_PARALLEL: z.coerce.number().int().min(0).max(16).default(0),

  /** Tool locations. Empty: bundled binaries (npm run tools / ffmpeg-static) or the ones on PATH. */
  FFMPEG_PATH: z.string().default(''),
  FFPROBE_PATH: z.string().default(''),
  YTDLP_PATH: z.string().default(''),
  /** Let links point at private / local network addresses (development only). */
  ALLOW_PRIVATE_URLS: bool('false'),

  /** YouTube Data API key: switches on the real "Trending" chart in Discover. Without it Discover uses search. */
  YOUTUBE_API_KEY: z.string().default(''),
  TRENDING_REGION: z.string().length(2).default('US'),
  APP_NAME: z.string().default('Cliper Agent'),

  /**
   * The address people open the app at, e.g. https://clips.example.com (no trailing slash). The social
   * platforms send people back to <PUBLIC_URL>/api/v1/social/callback/<platform> after they approve.
   * Empty: worked out from each request (fine for local development).
   */
  PUBLIC_URL: z.string().default('').transform((v) => v.replace(/\/+$/, '')),
  /** Key that encrypts the social-account tokens in the database. Empty: derived from JWT_SECRET. */
  TOKEN_ENCRYPTION_KEY: z.string().default(''),
  /*
   * Captions. Speech is turned into timed words by a Whisper server that speaks the OpenAI
   * "audio/transcriptions" protocol: the bundled `whisper` container, or a hosted one (OpenAI, Groq).
   * Empty: clips are made without captions.
   */
  WHISPER_URL: z.string().default('').transform((v) => v.replace(/\/+$/, '')),
  WHISPER_API_KEY: z.string().default(''),
  WHISPER_MODEL: z.string().default('Systran/faster-whisper-small'),
  /** Font for captions and titles burned into clips (must be installed on the server). */
  CAPTION_FONT: z.string().default('Inter'),
  /*
   * Claude writes each clip's hook, title, caption and hashtags and can pick the best moments from
   * what is said. Empty key: titles and hashtags are built from the video's own title instead.
   */
  ANTHROPIC_API_KEY: z.string().default(''),
  AI_MODEL: z.string().default('claude-opus-5-5'),
  /** Twitch app (dev.twitch.tv): lets Scout rank Twitch clips and streamers. */
  TWITCH_CLIENT_ID: z.string().default(''),
  TWITCH_CLIENT_SECRET: z.string().default(''),

  /** Posts uploaded to the platforms at the same time. */
  PUBLISH_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),

  /* Developer-app credentials for each platform (docs/SOCIAL.md). A platform with none is shown as "not set up". */
  YOUTUBE_CLIENT_ID: z.string().default(''),
  YOUTUBE_CLIENT_SECRET: z.string().default(''),
  TIKTOK_CLIENT_KEY: z.string().default(''),
  TIKTOK_CLIENT_SECRET: z.string().default(''),
  INSTAGRAM_APP_ID: z.string().default(''),
  INSTAGRAM_APP_SECRET: z.string().default(''),
  FACEBOOK_APP_ID: z.string().default(''),
  FACEBOOK_APP_SECRET: z.string().default(''),
  X_CLIENT_ID: z.string().default(''),
  X_CLIENT_SECRET: z.string().default(''),
  LINKEDIN_CLIENT_ID: z.string().default(''),
  LINKEDIN_CLIENT_SECRET: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;

// A live server must not run with a guessable signing key: anyone who knows it can sign in as any user.
if (env.NODE_ENV === 'production') {
  const placeholder = /change[-_ ]?me|replace[-_ ]?me|your[-_ ]?secret|^(secret|password|test|default|example)/i.test(env.JWT_SECRET);
  if (placeholder) {
    console.error('❌ JWT_SECRET is still a placeholder: use 32+ random characters (e.g. `openssl rand -hex 32`).');
    process.exit(1);
  }
  if (env.JWT_SECRET.length < 32) console.warn('⚠️  JWT_SECRET is shorter than 32 characters: generate a longer one (`openssl rand -hex 32`).');
  if (env.ALLOW_PRIVATE_URLS) console.warn('⚠️  ALLOW_PRIVATE_URLS is on: links may reach machines on your private network.');
}
