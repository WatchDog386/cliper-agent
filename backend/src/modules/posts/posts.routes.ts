import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { signMediaToken } from '../../lib/jwt';
import { badRequest, notFound } from '../../lib/http-error';
import { ah } from '../../middleware/async';
import { me } from '../../middleware/auth';
import { parse } from '../../middleware/validate';

/*
 * The content calendar: clips planned for a platform on a date. Planning only: the clip is not sent to
 * the platform (that needs each platform's own sign-in); the app reminds you, hands you the file and
 * the caption, and you mark the post as done.
 */
export const postsRouter = Router();

export const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'x', 'facebook', 'linkedin'] as const;
const STATUSES = ['PLANNED', 'POSTED', 'SKIPPED'] as const;

type Row = Awaited<ReturnType<typeof load>>[number];
const load = (where: Parameters<typeof prisma.scheduledPost.findMany>[0]) =>
  prisma.scheduledPost.findMany({ ...where, include: { clip: { select: { id: true, index: true, title: true, thumb: true, duration: true, width: true, height: true, jobId: true, job: { select: { title: true } } } } } });

function view(userId: string, p: Row) {
  const t = encodeURIComponent(signMediaToken(userId, p.clip.jobId));
  return {
    id: p.id,
    platform: p.platform,
    caption: p.caption,
    scheduledAt: p.scheduledAt,
    status: p.status,
    clip: {
      id: p.clip.id,
      jobId: p.clip.jobId,
      index: p.clip.index,
      title: p.clip.title ?? `Clip ${p.clip.index} · ${p.clip.job.title ?? 'video'}`,
      duration: p.clip.duration,
      width: p.clip.width,
      height: p.clip.height,
      thumbUrl: p.clip.thumb ? `/media/clips/${p.clip.id}/thumb?t=${t}` : null,
      downloadUrl: `/media/clips/${p.clip.id}/download?t=${t}`,
    },
  };
}

const range = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

postsRouter.get(
  '/',
  ah(async (req, res) => {
    const { from, to } = parse(range, req.query);
    const userId = me(req).id;
    const rows = await load({ where: { userId, scheduledAt: { gte: from, lt: to } }, orderBy: { scheduledAt: 'asc' }, take: 500 });
    res.json({ posts: rows.map((r) => view(userId, r)) });
  }),
);

const body = z.object({
  clipId: z.string().min(1),
  platform: z.enum(PLATFORMS),
  caption: z.string().max(2200).default(''),
  scheduledAt: z.coerce.date(),
});

postsRouter.post(
  '/',
  ah(async (req, res) => {
    const b = parse(body, req.body);
    const userId = me(req).id;
    const clip = await prisma.clip.findFirst({ where: { id: b.clipId, job: { userId } } });
    if (!clip) throw notFound('Clip');
    if (b.scheduledAt.getTime() < Date.now() - 24 * 3600_000) throw badRequest('Pick a date from today on', 'PAST_DATE');
    const p = await prisma.scheduledPost.create({ data: { ...b, userId } });
    const [row] = await load({ where: { id: p.id } });
    res.status(201).json({ post: view(userId, row!) });
  }),
);

postsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const b = parse(z.object({ platform: z.enum(PLATFORMS).optional(), caption: z.string().max(2200).optional(), scheduledAt: z.coerce.date().optional(), status: z.enum(STATUSES).optional() }), req.body);
    const userId = me(req).id;
    const found = await prisma.scheduledPost.findFirst({ where: { id: String(req.params.id), userId } });
    if (!found) throw notFound('Post');
    await prisma.scheduledPost.update({ where: { id: found.id }, data: b });
    const [row] = await load({ where: { id: found.id } });
    res.json({ post: view(userId, row!) });
  }),
);

postsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const r = await prisma.scheduledPost.deleteMany({ where: { id: String(req.params.id), userId: me(req).id } });
    if (!r.count) throw notFound('Post');
    res.status(204).end();
  }),
);
