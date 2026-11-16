import { Router } from 'express';
import { z } from 'zod';
import { Prisma, type Campaign, type CampaignItem } from '@prisma/client';
import { env } from '../../config/env';
import { optionsSchema } from '../../clipper/options';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/http-error';
import { ah } from '../../middleware/async';
import { me } from '../../middleware/auth';
import { parse } from '../../middleware/validate';
import { runCampaign } from '../../autopilot/runner';
import { scout } from '../../scout/scout';
import { scoutSources } from '../../scout/sources';
import { autoPublishSchema } from '../../social/autopublish';

/*
 * Scout (find the best videos and creators for a topic) and Autopilot campaigns (do that on a schedule
 * and clip what is found).
 */
export const scoutRouter = Router();
export const campaignsRouter = Router();

const sources = z.array(z.enum(['youtube', 'twitch'])).min(1).max(2);
const csv = z
  .string()
  .default('youtube,twitch')
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
  .pipe(sources);

const scoutQuery = z.object({
  topic: z.string().trim().min(2, 'Type what to look for, e.g. GTA 6').max(80),
  days: z.coerce.number().int().min(1).max(30).default(7),
  sources: csv,
  minViews: z.coerce.number().int().min(0).default(0),
  minSubscribers: z.coerce.number().int().min(0).default(0),
  maxMinutes: z.coerce.number().int().min(1).max(600).optional(),
});

scoutRouter.get('/sources', (_req, res) => res.json({ sources: scoutSources() }));

scoutRouter.get(
  '/',
  ah(async (req, res) => {
    const q = parse(scoutQuery, req.query);
    const result = await scout({
      topic: q.topic,
      days: q.days,
      sources: q.sources,
      minViews: q.minViews,
      minSubscribers: q.minSubscribers,
      maxSeconds: Math.min(q.maxMinutes ?? env.MAX_SOURCE_MINUTES, env.MAX_SOURCE_MINUTES) * 60,
    });
    res.json({ ...result, videos: result.videos.slice(0, 60), creators: result.creators.slice(0, 20) });
  }),
);

/* ───────────── Campaigns ───────────── */

const MAX_CAMPAIGNS = 10;

const campaignBody = z.object({
  name: z.string().trim().min(2, 'Give the campaign a name').max(60),
  topic: z.string().trim().min(2, 'Type what to look for, e.g. GTA 6').max(80),
  sources,
  days: z.number().int().min(1).max(30).default(3),
  minViews: z.number().int().min(0).default(0),
  minSubscribers: z.number().int().min(0).default(0),
  maxMinutes: z.number().int().min(1).max(600).default(60),
  videosPerRun: z.number().int().min(1).max(10).default(3),
  everyHours: z.number().int().min(1).max(168).default(6),
  options: optionsSchema,
  autoPublish: autoPublishSchema.nullable().optional(),
  enabled: z.boolean().default(true),
});

type Full = Campaign & { items?: CampaignItem[]; _count?: { items: number } };
const view = (c: Full) => ({
  id: c.id,
  name: c.name,
  topic: c.topic,
  sources: c.sources,
  days: c.days,
  minViews: c.minViews,
  minSubscribers: c.minSubscribers,
  maxMinutes: c.maxMinutes,
  videosPerRun: c.videosPerRun,
  everyHours: c.everyHours,
  options: c.options,
  autoPublish: c.autoPublish,
  enabled: c.enabled,
  lastRunAt: c.lastRunAt,
  nextRunAt: c.nextRunAt,
  lastNote: c.lastNote,
  createdAt: c.createdAt,
  videosTaken: c._count?.items ?? c.items?.length ?? 0,
  recent: (c.items ?? []).map((i) => ({ id: i.id, title: i.title, creator: i.creator, platform: i.platform, views: i.views, score: i.score, url: i.url, jobId: i.jobId, at: i.createdAt })),
});

const include = { _count: { select: { items: true } }, items: { orderBy: { createdAt: 'desc' }, take: 8 } } satisfies Prisma.CampaignInclude;

async function own(userId: string, id: string) {
  const c = await prisma.campaign.findFirst({ where: { id, userId }, include });
  if (!c) throw notFound('Campaign');
  return c;
}

async function checked(userId: string, body: z.infer<typeof campaignBody>) {
  if (body.options.maxClips > env.MAX_CLIPS_PER_JOB) throw badRequest(`At most ${env.MAX_CLIPS_PER_JOB} clips per video on this server`, 'TOO_MANY_CLIPS');
  if (body.options.mode === 'custom') throw badRequest('A campaign cannot use fixed time ranges: choose Best moments or Split evenly', 'BAD_MODE');
  if (body.autoPublish) {
    const n = await prisma.socialAccount.count({ where: { id: { in: body.autoPublish.accountIds }, userId } });
    if (n !== new Set(body.autoPublish.accountIds).size) throw notFound('Account');
  }
  const { autoPublish, options, ...rest } = body;
  return { ...rest, options: options as Prisma.InputJsonValue, autoPublish: (autoPublish ?? undefined) as Prisma.InputJsonValue | undefined };
}

campaignsRouter.get(
  '/',
  ah(async (req, res) => {
    const rows = await prisma.campaign.findMany({ where: { userId: me(req).id }, include, orderBy: { createdAt: 'desc' } });
    res.json({ campaigns: rows.map(view) });
  }),
);

campaignsRouter.post(
  '/',
  ah(async (req, res) => {
    const userId = me(req).id;
    const data = await checked(userId, parse(campaignBody, req.body));
    if ((await prisma.campaign.count({ where: { userId } })) >= MAX_CAMPAIGNS) throw badRequest(`At most ${MAX_CAMPAIGNS} campaigns. Delete one first.`, 'TOO_MANY');
    // The first run happens at once when the campaign starts switched on
    const made = await prisma.campaign.create({ data: { ...data, userId, nextRunAt: new Date() }, include });
    res.status(201).json({ campaign: view(made) });
  }),
);

campaignsRouter.put(
  '/:id',
  ah(async (req, res) => {
    const userId = me(req).id;
    const current = await own(userId, String(req.params.id));
    const data = await checked(userId, parse(campaignBody, req.body));
    const updated = await prisma.campaign.update({
      where: { id: current.id },
      // Switched back on: due now. Otherwise the schedule is kept.
      data: { ...data, autoPublish: data.autoPublish ?? Prisma.JsonNull, nextRunAt: data.enabled && !current.enabled ? new Date() : current.nextRunAt },
      include,
    });
    res.json({ campaign: view(updated) });
  }),
);

/** Switch a campaign on or off without resending everything. */
campaignsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
    const current = await own(me(req).id, String(req.params.id));
    const updated = await prisma.campaign.update({ where: { id: current.id }, data: { enabled, nextRunAt: enabled && !current.enabled ? new Date() : current.nextRunAt }, include });
    res.json({ campaign: view(updated) });
  }),
);

/** Run it now (also when it is switched off: a one-off). */
campaignsRouter.post(
  '/:id/run',
  ah(async (req, res) => {
    const current = await own(me(req).id, String(req.params.id));
    const result = await runCampaign(current);
    res.json({ ...result, campaign: view(await own(me(req).id, current.id)) });
  }),
);

/** Deleting a campaign keeps the clips it already made. */
campaignsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const current = await own(me(req).id, String(req.params.id));
    await prisma.campaign.delete({ where: { id: current.id } });
    res.status(204).end();
  }),
);
