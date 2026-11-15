import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { HttpError } from '../../lib/http-error';
import { assertPublicUrl } from '../../lib/url-guard';
import { ah } from '../../middleware/async';
import { parse } from '../../middleware/validate';
import { fetchMeta, ytdlpReason } from '../../clipper/source';

export const sourceRouter = Router();

/** Preview a link before clipping it: title, length, thumbnail, site. */
sourceRouter.post(
  '/inspect',
  ah(async (req, res) => {
    const { url } = parse(z.object({ url: z.string().min(4, 'Paste a video link') }), req.body);
    const safe = await assertPublicUrl(url);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 45_000);
    try {
      const meta = await fetchMeta(safe, ac.signal);
      const tooLong = meta.duration !== null && meta.duration > env.MAX_SOURCE_MINUTES * 60;
      res.json({
        source: { ...meta, url: safe },
        warnings: [
          ...(meta.isLive ? ['This is a live stream. It can be clipped once it has ended.'] : []),
          ...(tooLong ? [`This video is longer than the ${env.MAX_SOURCE_MINUTES}-minute limit on this server.`] : []),
        ],
        canClip: !meta.isLive && !tooLong,
      });
    } catch (err) {
      const reason = ac.signal.aborted ? 'The site took too long to answer. Try again.' : ytdlpReason(err);
      throw new HttpError(422, reason, 'SOURCE_UNREADABLE');
    } finally {
      clearTimeout(timer);
    }
  }),
);
