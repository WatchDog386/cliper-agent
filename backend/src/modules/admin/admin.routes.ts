import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { JobStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { passwordSchema } from '../../lib/password';
import { badRequest, notFound } from '../../lib/http-error';
import { ah } from '../../middleware/async';
import { forgetUser, me } from '../../middleware/auth';
import { parse } from '../../middleware/validate';
import { userView } from '../auth/auth.routes';

/** Team management for admins: see everyone, deactivate, promote, reset a password. */
export const adminRouter = Router();

adminRouter.get(
  '/users',
  ah(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { jobs: true } } } });
    const clipCounts = await prisma.clip.groupBy({ by: ['jobId'], _count: true });
    const jobsByUser = await prisma.clipJob.findMany({ select: { id: true, userId: true } });
    const owner = new Map(jobsByUser.map((j) => [j.id, j.userId]));
    const clips = new Map<string, number>();
    for (const c of clipCounts) {
      const u = owner.get(c.jobId);
      if (u) clips.set(u, (clips.get(u) ?? 0) + c._count);
    }
    res.json({ users: users.map((u) => ({ ...userView(u), active: u.active, jobs: u._count.jobs, clips: clips.get(u.id) ?? 0 })) });
  }),
);

adminRouter.get(
  '/stats',
  ah(async (_req, res) => {
    const [users, jobs, clips, bytes, failed, running] = await Promise.all([
      prisma.user.count(),
      prisma.clipJob.count(),
      prisma.clip.count(),
      prisma.clip.aggregate({ _sum: { sizeBytes: true } }),
      prisma.clipJob.count({ where: { status: JobStatus.FAILED } }),
      prisma.clipJob.count({ where: { status: { in: [JobStatus.QUEUED, JobStatus.FETCHING, JobStatus.ANALYZING, JobStatus.RENDERING] } } }),
    ]);
    res.json({ users, jobs, clips, bytes: bytes._sum.sizeBytes ?? 0, failed, running });
  }),
);

adminRouter.patch(
  '/users/:id',
  ah(async (req, res) => {
    const body = parse(z.object({ active: z.boolean().optional(), role: z.enum(['USER', 'ADMIN']).optional(), password: passwordSchema.optional() }), req.body);
    const id = String(req.params.id);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound('User');
    if (id === me(req).id && (body.active === false || body.role === 'USER')) throw badRequest('You cannot deactivate or demote your own account', 'SELF');
    const user = await prisma.user.update({
      where: { id },
      data: {
        active: body.active,
        role: body.role,
        // A reset password or a deactivation signs the person out everywhere
        ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 11) } : {}),
        ...(body.password || body.active === false ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
    forgetUser(id);
    res.json({ user: { ...userView(user), active: user.active } });
  }),
);
