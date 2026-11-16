import { z } from 'zod';

/*
 * What a person chooses when they clip a video. Kept in the job's `options` column.
 *
 *   mode            split      – cut the whole video (or the trimmed part) into back-to-back clips
 *                   highlights – find the loudest / most energetic moments and cut those
 *                   custom     – cut exactly the time ranges given
 *   segmentSeconds  length of each clip (split / highlights)
 *   aspect          phone (9:16) · desktop (16:9) · square (1:1) · portrait (4:5) · original
 *   fit             crop  – fill the frame, trimming the sides (best for phone view)
 *                   blur  – whole picture on a blurred copy of itself
 *                   pad   – whole picture with black bars
 *   focus           which part of the picture to keep when cropping: start (left/top), center, end (right/bottom)
 */

export const ASPECTS = ['phone', 'desktop', 'square', 'portrait', 'original'] as const;
export const FITS = ['crop', 'blur', 'pad'] as const;
export const MODES = ['split', 'highlights', 'custom'] as const;

export type Aspect = (typeof ASPECTS)[number];
export type Fit = (typeof FITS)[number];
export type Mode = (typeof MODES)[number];

const range = z
  .object({ start: z.number().min(0), end: z.number().positive() })
  .refine((r) => r.end > r.start, { message: 'Each range must end after it starts' })
  .refine((r) => r.end - r.start >= 1, { message: 'Each range must be at least 1 second long' });

export const optionsSchema = z
  .object({
    mode: z.enum(MODES).default('split'),
    segmentSeconds: z.number().min(3, 'Clips must be at least 3 seconds').max(600, 'Clips can be at most 10 minutes').default(30),
    maxClips: z.number().int().min(1).max(200).default(10),
    /** Only use this part of the source (seconds). */
    startAt: z.number().min(0).optional(),
    endAt: z.number().positive().optional(),
    ranges: z.array(range).max(200).optional(),
    aspect: z.enum(ASPECTS).default('phone'),
    fit: z.enum(FITS).default('crop'),
    focus: z.enum(['start', 'center', 'end']).default('center'),
    quality: z.enum(['480', '720', '1080']).default('1080'),
    fade: z.boolean().default(false),
    mute: z.boolean().default(false),
    /** Playback speed of the clip (0.5–2×). */
    speed: z.number().min(0.5).max(2).default(1),

    /* ── Edits that make a clip ready to post ── */
    /** Burn what is said into the picture, a few words at a time. */
    captions: z.boolean().default(false),
    /** bold: big upper-case words · karaoke: the spoken word lights up · minimal: small, sentence case */
    captionStyle: z.enum(['bold', 'karaoke', 'minimal']).default('karaoke'),
    /** A title across the top for the first seconds: none, the same text on every clip, or written per clip. */
    hook: z.enum(['none', 'custom', 'auto']).default('none'),
    hookText: z.string().trim().max(80).optional(),
    /** Show who made the original ("🎥 name") in a corner for the whole clip. */
    credit: z.boolean().default(false),
    /** Even out loudness to the level the platforms play at (−14 LUFS). */
    normalizeAudio: z.boolean().default(false),
    /** Best moments chosen from what is said (needs captions and the AI key); otherwise by loudness. */
    aiPick: z.boolean().default(false),
    /** What the video is about, for hashtags and titles ("GTA 6"). */
    topic: z.string().trim().max(80).optional(),
  })
  .refine((o) => o.endAt === undefined || o.startAt === undefined || o.endAt > o.startAt, { message: 'End must be after start', path: ['endAt'] })
  .refine((o) => o.hook !== 'custom' || Boolean(o.hookText), { message: 'Write the title to show on the clips', path: ['hookText'] })
  .refine((o) => o.mode !== 'custom' || (o.ranges?.length ?? 0) > 0, { message: 'Add at least one time range', path: ['ranges'] });

export type ClipOptions = z.infer<typeof optionsSchema>;

/**
 * Output frame size for an aspect at a quality (always even numbers, as H.264 needs). The quality is the
 * frame's shorter side, so "1080" is 1080×1920 for phone view and 1920×1080 for desktop view.
 */
export function frameSize(aspect: Aspect, quality: ClipOptions['quality'], source?: { width: number; height: number }) {
  const q = Number(quality);
  switch (aspect) {
    case 'phone':
      return { width: q, height: even((q * 16) / 9) } as const;
    case 'desktop':
      return { width: even((q * 16) / 9), height: q } as const;
    case 'square':
      return { width: q, height: q } as const;
    case 'portrait':
      return { width: q, height: even((q * 5) / 4) } as const;
    case 'original': {
      if (!source?.width || !source.height) return { width: even((q * 16) / 9), height: q } as const;
      // Shorter side capped at the chosen quality, never upscaled
      const short = Math.min(source.width, source.height);
      const k = Math.min(1, q / short);
      return { width: even(source.width * k), height: even(source.height * k) } as const;
    }
  }
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
