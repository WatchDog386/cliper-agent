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
   * Speech to text for auto captions and smart cuts, e.g. "python3 scripts/transcribe.py" (needs
   * `pip install faster-whisper`). Empty: captions are skipped; other auto-edit steps still work.
   */
  WHISPER_CMD: z.string().default(''),
  /** faster-whisper model: tiny · base · small · medium (bigger = better and slower). */
  WHISPER_MODEL: z.string().default('base'),

  /** OpusClip API key (sk-…): switches on the "AI clips" mode. Keep it in .env only, never in git. */
  OPUSCLIP_API_KEY: z.string().default(''),
  OPUSCLIP_API_URL: z.string().url().default('https://api.opus.pro'),
  /** Give up on an OpusClip project after this many minutes. */
  OPUSCLIP_TIMEOUT_MINUTES: z.coerce.number().min(5).default(120),
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
