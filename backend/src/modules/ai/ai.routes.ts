import { Router } from 'express';
import { ah } from '../../middleware/async';
import { listTemplates, opusEnabled, OpusError } from '../../clipper/opus';

/** AI clips (OpusClip): whether they are available and which caption templates the account has. */
export const aiRouter = Router();

let cache: { at: number; body: unknown } | null = null;

aiRouter.get(
  '/status',
  ah(async (_req, res) => {
    if (!opusEnabled()) return void res.json({ enabled: false, ok: false, provider: 'OpusClip', templates: [], message: 'No OpusClip API key on this server' });
    // Cached for a minute: the OpusClip rate limit is 30 requests a minute
    if (cache && Date.now() - cache.at < 60_000) return void res.json(cache.body);
    try {
      const templates = await listTemplates();
      cache = { at: Date.now(), body: { enabled: true, ok: true, provider: 'OpusClip', templates } };
    } catch (e) {
      cache = { at: Date.now(), body: { enabled: true, ok: false, provider: 'OpusClip', templates: [], message: e instanceof OpusError ? e.message : 'Could not reach OpusClip' } };
    }
    res.json(cache.body);
  }),
);
