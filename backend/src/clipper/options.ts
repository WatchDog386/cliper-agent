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
 *
 * AI mode ("ai") hands the video to OpusClip (needs OPUSCLIP_API_KEY): it finds the hooks, writes a
 * headline, caption and hashtags per clip, adds animated captions from the brand template and scores
 * each clip's virality. The clips come back as OpusClip renders them (vertical, captioned).
 *   aiModel         ClipBasic (talking videos) · ClipAnything (any video, follows aiPrompt)
 *   aiDuration      auto · short (<30 s) · medium (30–60 s) · long (60–90 s) · xl (90 s–3 min)
 *   aiPrompt        what to look for, e.g. "funny moments" (ClipAnything) / topic keywords (ClipBasic)
 *   aiTemplateId    an OpusClip brand template id (empty: the account's default)
 *   aiHook          add an AI headline over the first seconds
 */

export const ASPECTS = ['phone', 'desktop', 'square', 'portrait', 'original'] as const;
export const FITS = ['crop', 'blur', 'pad'] as const;
export const MODES = ['split', 'highlights', 'custom', 'ai'] as const;
export const AI_DURATIONS = ['auto', 'short', 'medium', 'long', 'xl'] as const;

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
    aiModel: z.enum(['ClipBasic', 'ClipAnything']).default('ClipAnything'),
    aiDuration: z.enum(AI_DURATIONS).default('auto'),
    aiPrompt: z.string().trim().max(300).optional(),
    aiTemplateId: z.string().trim().max(120).optional(),
    aiHook: z.boolean().default(false),
    aiLanguage: z.string().trim().max(8).optional(),
    /** A brand kit whose logo is stamped on every clip (local modes). */
    brandKitId: z.string().trim().max(40).optional(),
    /** Auto-edit for the local modes (see clipper/edit.ts). */
    autoEdit: z
      .object({
        captions: z.boolean().default(false),
        captionStyle: z.enum(['karaoke', 'bold', 'clean']).default('karaoke'),
        hook: z.boolean().default(false),
        smartCuts: z.boolean().default(true),
        removeSilence: z.boolean().default(false),
        zoom: z.boolean().default(false),
        enhanceAudio: z.boolean().default(false),
        progressBar: z.boolean().default(false),
      })
      .optional(),
  })
  .refine((o) => o.endAt === undefined || o.startAt === undefined || o.endAt > o.startAt, { message: 'End must be after start', path: ['endAt'] })
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
