import { Router } from 'express';
import { z } from 'zod';
import { PublicationStatus, type Clip, type ClipJob, type Prisma, type Publication, type SocialAccount } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { signMediaToken } from '../../lib/jwt';
import { badRequest, conflict, notFound } from '../../lib/http-error';
import { ah } from '../../middleware/async';
import { me } from '../../middleware/auth';
import { parse } from '../../middleware/validate';
import { accountView } from '../../social/accounts';
import { fillTemplate } from '../../social/autopublish';
import { providers } from '../../social/providers';
import { abortPublication, nudgePublisher } from '../../social/publisher';

/** Posts: clips sent (or scheduled to be sent) to connected accounts. */
export const publicationsRouter = Router();

type Full = Publication & { account: SocialAccount; clip: (Clip & { job: Pick<ClipJob, 'id' | 'title'> }) | null };
const include = { account: true, clip: { include: { job: { select: { id: true, title: true } } } } } satisfies Prisma.PublicationInclude;

export function publicationView(p: Full) {
  const scheduled = p.status === PublicationStatus.QUEUED && p.runAt.getTime() > Date.now() + 30_000 && p.attempts === 0;
  return {
    id: p.id,
    status: p.status,
    /** QUEUED with a time still ahead. */
    scheduled,
    runAt: p.runAt,
    title: p.title,
    caption: p.caption,
    privacy: p.privacy,
    progress: p.progress,
    attempts: p.attempts,
    error: p.error,
    externalUrl: p.externalUrl,
    createdAt: p.createdAt,
    publishedAt: p.publishedAt,
    account: accountView(p.account),
    clip: p.clip
      ? {
          id: p.clip.id,
          index: p.clip.index,
          jobId: p.clip.jobId,
          jobTitle: p.clip.job.title,
          duration: p.clip.duration,
          thumbUrl: p.clip.thumb ? `/media/clips/${p.clip.id}/thumb?t=${encodeURIComponent(signMediaToken(p.userId, p.clip.jobId))}` : null,
        }
      : null,
  };
}

const listQuery = z.object({
  status: z.enum(['all', 'waiting', 'published', 'failed']).default('all'),
  jobId: z.string().optional(),
});

publicationsRouter.get(
  '/',
  ah(async (req, res) => {
    const q = parse(listQuery, req.query);
    const where: Prisma.PublicationWhereInput = { userId: me(req).id };
    if (q.status === 'waiting') where.status = { in: [PublicationStatus.QUEUED, PublicationStatus.PUBLISHING] };
    if (q.status === 'published') where.status = PublicationStatus.PUBLISHED;
    if (q.status === 'failed') where.status = { in: [PublicationStatus.FAILED, PublicationStatus.CANCELLED] };
    if (q.jobId) where.clip = { jobId: q.jobId };
    const rows = await prisma.publication.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 200 });
    const counts = await prisma.publication.groupBy({ by: ['status'], where: { userId: me(req).id }, _count: true });
    const n = (s: PublicationStatus[]) => counts.filter((c) => s.includes(c.status)).reduce((a, c) => a + c._count, 0);
    res.json({
      publications: rows.map(publicationView),
      stats: { waiting: n([PublicationStatus.QUEUED, PublicationStatus.PUBLISHING]), published: n([PublicationStatus.PUBLISHED]), failed: n([PublicationStatus.FAILED]) },
    });
  }),
);

const createBody = z.object({
  clipIds: z.array(z.string().min(1)).min(1).max(50),
  accountIds: z.array(z.string().min(1)).min(1).max(20),
  /** {n} becomes the clip number and {title} the video's title, so one text can serve many clips. */
  title: z.string().trim().max(200).default(''),
  caption: z.string().trim().max(5000).default(''),
  privacy: z.enum(['public', 'unlisted', 'private']).default('public'),
  /** When to post (ISO time). Empty: now. */
  scheduledAt: z.coerce.date().optional(),
  /** Minutes between one clip and the next (several clips). */
  everyMinutes: z.number().int().min(0).max(7 * 24 * 60).default(0),
});

/** Post clips to accounts: one publication per clip and account. */
publicationsRouter.post(
  '/',
  ah(async (req, res) => {
    const body = parse(createBody, req.body);
    const userId = me(req).id;
    const clips = await prisma.clip.findMany({ where: { id: { in: body.clipIds }, job: { userId } }, include: { job: { select: { title: true, sourceName: true } } }, orderBy: [{ jobId: 'asc' }, { index: 'asc' }] });
    if (clips.length !== new Set(body.clipIds).size) throw notFound('Clip');
    const accounts = await prisma.socialAccount.findMany({ where: { id: { in: body.accountIds }, userId } });
    if (accounts.length !== new Set(body.accountIds).size) throw notFound('Account');
    for (const a of accounts) {
      const p = providers[a.platform];
      if (a.needsReconnect) throw conflict(`${a.name} (${p.label}) has to be connected again before posting to it.`, 'NEEDS_RECONNECT');
      if (!p.configured()) throw badRequest(`${p.label} is not set up on this server.`, 'NOT_CONFIGURED');
      const tooLong = clips.find((c) => c.duration > p.limits.maxSeconds);
      if (tooLong) throw badRequest(`${p.label} takes videos up to ${span(p.limits.maxSeconds)}: clip ${tooLong.index} is longer.`, 'TOO_LONG');
    }
    const first = body.scheduledAt ?? new Date();
    if (first.getTime() < Date.now() - 5 * 60_000) throw badRequest('The scheduled time is in the past', 'PAST');
    const rows = clips.flatMap((clip, i) => {
      const jobTitle = clip.job.title ?? clip.job.sourceName ?? 'Clip';
      const fill = (t: string) => fillTemplate(t, { n: clip.index, title: jobTitle });
      return accounts.map((account) => ({
        userId,
        clipId: clip.id,
        accountId: account.id,
        // No text given: the clip's own ready-to-post title and caption
        title: (fill(body.title) || clip.title || (clips.length > 1 ? `${jobTitle} (${clip.index})` : jobTitle)).slice(0, 200),
        caption: fill(body.caption) || clip.caption || '',
        privacy: body.privacy,
        runAt: new Date(first.getTime() + i * body.everyMinutes * 60_000),
      }));
    });
    const made = await prisma.$transaction(rows.map((data) => prisma.publication.create({ data, include })));
    nudgePublisher();
    res.status(201).json({ publications: made.map(publicationView) });
  }),
);

const span = (s: number) => (s < 60 ? `${s} s` : s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`);

async function own(userId: string, id: string) {
  const p = await prisma.publication.findFirst({ where: { id, userId }, include });
  if (!p) throw notFound('Post');
  return p;
}

/** Post a failed or cancelled one again, now. */
publicationsRouter.post(
  '/:id/retry',
  ah(async (req, res) => {
    const p = await own(me(req).id, String(req.params.id));
    if (p.status !== PublicationStatus.FAILED && p.status !== PublicationStatus.CANCELLED) throw conflict('Only failed or cancelled posts can be tried again', 'NOT_RETRYABLE');
    if (!p.clip) throw conflict('The clip was deleted', 'CLIP_GONE');
    await prisma.publication.update({ where: { id: p.id }, data: { status: PublicationStatus.QUEUED, runAt: new Date(), attempts: 0, error: null, progress: 0 } });
    nudgePublisher();
    res.json({ publication: publicationView(await own(me(req).id, p.id)) });
  }),
);

/** Stop a post that is waiting, scheduled or uploading. */
publicationsRouter.post(
  '/:id/cancel',
  ah(async (req, res) => {
    const p = await own(me(req).id, String(req.params.id));
    const r = await prisma.publication.updateMany({
      where: { id: p.id, status: { in: [PublicationStatus.QUEUED, PublicationStatus.PUBLISHING] } },
      data: { status: PublicationStatus.CANCELLED, error: null },
    });
    if (!r.count) throw conflict('This post is not waiting', 'NOT_WAITING');
    abortPublication(p.id);
    res.json({ publication: publicationView(await own(me(req).id, p.id)) });
  }),
);

/** Remove the record (a published post stays on the platform). */
publicationsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const p = await own(me(req).id, String(req.params.id));
    abortPublication(p.id);
    await prisma.publication.delete({ where: { id: p.id } });
    res.status(204).end();
  }),
);
