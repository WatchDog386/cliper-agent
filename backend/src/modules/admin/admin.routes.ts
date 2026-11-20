import { Router } from 'express';
import { z } from 'zod';
import { JobStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/http-error';
import { removeJobFiles } from '../../lib/storage';
import { ah } from '../../middleware/async';
import { forgetUser, me } from '../../middleware/auth';
import { parse } from '../../middleware/validate';
import { abortJob, nudgeQueue, queueStats } from '../../clipper/queue';
import { jobView } from '../jobs/jobs.view';

/*
 * The admin surface: everyone on the server, every job, and the load of the whole machine.
 * Only ADMIN accounts get past the router guard (see app.ts).
 */
export const adminRouter = Router();

const WAITING: JobStatus[] = [JobStatus.QUEUED, JobStatus.FETCHING, JobStatus.ANALYZING, JobStatus.RENDERING];

adminRouter.get(
  '/stats',
  ah(async (_req, res) => {
    const [users, activeUsers, jobs, jobsByStatus, clips, bytes] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { active: true } }),
      prisma.clipJob.count(),
      prisma.clipJob.groupBy({ by: ['status'], _count: true }),
      prisma.clip.count(),
      prisma.clip.aggregate({ _sum: { sizeBytes: true } }),
    ]);
    res.json({
      users: { total: users, active: activeUsers },
      jobs: {
        total: jobs,
        active: jobsByStatus.filter((r) => WAITING.includes(r.status)).reduce((s, r) => s + r._count, 0),
        done: jobsByStatus.find((r) => r.status === JobStatus.DONE)?._count ?? 0,
        failed: jobsByStatus.filter((r) => r.status === JobStatus.FAILED || r.status === JobStatus.CANCELLED).reduce((s, r) => s + r._count, 0),
      },
      clips,
      storageBytes: bytes._sum.sizeBytes ?? 0,
      queue: await queueStats(),
    });
  }),
);

const usersQuery = z.object({ q: z.string().trim().max(120).optional() });

/** Everyone with an account, newest first, with how much they have used the server. */
adminRouter.get(
  '/users',
  ah(async (req, res) => {
    const { q } = parse(usersQuery, req.query);
    const where: Prisma.UserWhereInput = q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {};
    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, _count: { select: { jobs: true } } },
    });
    const clips = await prisma.clipJob.groupBy({ by: ['userId'], where: { userId: { in: users.map((u) => u.id) } }, _count: { _all: true } });
    const jobsOf = new Map(clips.map((c) => [c.userId, c._count._all]));
    res.json({
      users: users.map((u) => ({ ...u, jobCount: jobsOf.get(u.id) ?? 0 })),
    });
  }),
);

const userPatch = z.object({
  active: z.boolean().optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

/** Deactivate an account (or let it back in), or hand out / take back admin. */
adminRouter.patch(
  '/users/:id',
  ah(async (req, res) => {
    const body = parse(userPatch, req.body);
    if (Object.keys(body).length === 0) throw badRequest('Nothing to change');
    const id = String(req.params.id);
    if (id === me(req).id) throw badRequest('You cannot change your own account here (use Settings)');
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('User');
    if (user.role === 'ADMIN' && body.role === 'USER' && (await prisma.user.count({ where: { role: 'ADMIN', active: true } })) <= 1)
      throw badRequest('The last admin cannot be demoted', 'LAST_ADMIN');
    const updated = await prisma.user.update({
      where: { id },
      data: { ...(body.active !== undefined ? { active: body.active } : {}), ...(body.role ? { role: body.role } : {}) },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });
    // Role and active are re-checked on every request: drop the cache so this applies at once
    forgetUser(id);
    res.json({ user: updated });
  }),
);

const jobsQuery = z.object({
  status: z.enum(['all', 'active', 'done', 'failed']).default('all'),
  userId: z.string().optional(),
});

/** Every job on the server (whose it is shown too). */
adminRouter.get(
  '/jobs',
  ah(async (req, res) => {
    const { status, userId } = parse(jobsQuery, req.query);
    const where: Prisma.ClipJobWhereInput = {};
    if (userId) where.userId = userId;
    if (status === 'active') where.status = { in: WAITING };
    if (status === 'done') where.status = JobStatus.DONE;
    if (status === 'failed') where.status = { in: [JobStatus.FAILED, JobStatus.CANCELLED] };
    const jobs = await prisma.clipJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { clips: true } }, clips: { where: { index: 1 } }, user: { select: { id: true, email: true, name: true } } },
    });
    res.json({ jobs: jobs.map((j) => ({ ...jobView(j), user: j.user })) });
  }),
);

/** Stop a job of anyone's (a stuck one, or one that should not have been started). */
adminRouter.post(
  '/jobs/:id/cancel',
  ah(async (req, res) => {
    const id = String(req.params.id);
    const job = await prisma.clipJob.findUnique({ where: { id } });
    if (!job) throw notFound('Job');
    if (!WAITING.includes(job.status)) throw badRequest('This job is not running', 'NOT_RUNNING');
    await prisma.clipJob.updateMany({ where: { id, status: { in: WAITING } }, data: { status: JobStatus.CANCELLED, stage: 'Cancelled by an admin', finishedAt: new Date() } });
    abortJob(id);
    res.json({ ok: true });
  }),
);

/** Retry a job of anyone's. */
adminRouter.post(
  '/jobs/:id/retry',
  ah(async (req, res) => {
    const id = String(req.params.id);
    const job = await prisma.clipJob.findUnique({ where: { id } });
    if (!job) throw notFound('Job');
    if (job.status !== JobStatus.FAILED && job.status !== JobStatus.CANCELLED) throw badRequest('Only failed or cancelled jobs can be retried', 'NOT_RETRYABLE');
    await prisma.clipJob.update({ where: { id }, data: { status: JobStatus.QUEUED, progress: 0, stage: 'Waiting in line', error: null, finishedAt: null } });
    nudgeQueue();
    res.json({ ok: true });
  }),
);

/** Remove a job of anyone's (and its clips) for good. */
adminRouter.delete(
  '/jobs/:id',
  ah(async (req, res) => {
    const id = String(req.params.id);
    const job = await prisma.clipJob.findUnique({ where: { id } });
    if (!job) throw notFound('Job');
    abortJob(id);
    await prisma.clipJob.delete({ where: { id } });
    await removeJobFiles(id);
    res.status(204).end();
  }),
);
