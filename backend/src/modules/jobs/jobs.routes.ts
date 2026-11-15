import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { JobStatus, Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/http-error';
import { incomingDir, jobDir, removeJobFiles, resolveStored } from '../../lib/storage';
import { assertPublicUrl } from '../../lib/url-guard';
import { ah } from '../../middleware/async';
import { me } from '../../middleware/auth';
import { parse } from '../../middleware/validate';
import { optionsSchema } from '../../clipper/options';
import { abortJob, nudgeQueue } from '../../clipper/queue';
import { jobView } from './jobs.view';

export const jobsRouter = Router();

const WAITING: JobStatus[] = [JobStatus.QUEUED, JobStatus.FETCHING, JobStatus.ANALYZING, JobStatus.RENDERING];
const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|webm|avi|wmv|flv|mpeg|mpg|3gp|ts)$/i;

/** One of this person's jobs (or 404: other people's jobs do not exist for them). */
async function ownJob(userId: string, id: string) {
  const job = await prisma.clipJob.findFirst({ where: { id, userId }, include: { clips: true } });
  if (!job) throw notFound('Job');
  return job;
}

const listQuery = z.object({ status: z.enum(['all', 'active', 'done', 'failed']).default('all') });

jobsRouter.get(
  '/',
  ah(async (req, res) => {
    const { status } = parse(listQuery, req.query);
    const where: Prisma.ClipJobWhereInput = { userId: me(req).id };
    if (status === 'active') where.status = { in: WAITING };
    if (status === 'done') where.status = JobStatus.DONE;
    if (status === 'failed') where.status = { in: [JobStatus.FAILED, JobStatus.CANCELLED] };
    const jobs = await prisma.clipJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { clips: true } }, clips: { where: { index: 1 } } },
    });
    const stats = await prisma.clipJob.groupBy({ by: ['status'], where: { userId: me(req).id }, _count: true });
    const clipTotal = await prisma.clip.count({ where: { job: { userId: me(req).id } } });
    res.json({
      jobs: jobs.map(jobView),
      stats: {
        total: stats.reduce((s, r) => s + r._count, 0),
        active: stats.filter((r) => WAITING.includes(r.status)).reduce((s, r) => s + r._count, 0),
        done: stats.find((r) => r.status === JobStatus.DONE)?._count ?? 0,
        clips: clipTotal,
      },
    });
  }),
);

const createBody = z.object({
  url: z.string().min(4, 'Paste a video link'),
  title: z.string().trim().max(200).optional(),
  thumbnailUrl: z.string().url().max(2000).optional(),
  options: optionsSchema,
});

/** Clip a video from a link. */
jobsRouter.post(
  '/',
  ah(async (req, res) => {
    const body = parse(createBody, req.body);
    checkLimits(body.options);
    const url = await assertPublicUrl(body.url);
    const job = await prisma.clipJob.create({
      data: { userId: me(req).id, sourceKind: 'URL', sourceUrl: url, title: body.title || null, thumbnailUrl: body.thumbnailUrl ?? null, options: body.options },
    });
    nudgeQueue();
    res.status(201).json({ job: jobView(job) });
  }),
);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, incomingDir()),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`),
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/') || VIDEO_EXT.test(file.originalname)) cb(null, true);
    else cb(badRequest('That file is not a video'));
  },
});

/** Clip a video file uploaded from the phone or computer (multipart: file + options as JSON). */
jobsRouter.post(
  '/upload',
  upload.single('file'),
  ah(async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('Choose a video file to upload');
    try {
      let raw: unknown;
      try {
        raw = JSON.parse(String(req.body.options ?? '{}'));
      } catch {
        throw badRequest('Options must be JSON');
      }
      const options = parse(optionsSchema, raw);
      checkLimits(options);
      const name = path.basename(file.originalname).slice(0, 200);
      const title = typeof req.body.title === 'string' && req.body.title.trim() ? req.body.title.trim().slice(0, 200) : name.replace(VIDEO_EXT, '');
      const job = await prisma.clipJob.create({
        data: { userId: me(req).id, sourceKind: 'UPLOAD', sourceName: name, title, options, status: JobStatus.CANCELLED, stage: 'Receiving upload' },
      });
      const dir = jobDir(job.id);
      await fs.promises.mkdir(dir, { recursive: true });
      await moveFile(file.path, path.join(dir, `source${path.extname(file.filename) || '.mp4'}`));
      const ready = await prisma.clipJob.update({ where: { id: job.id }, data: { status: JobStatus.QUEUED, stage: 'Waiting in line' } });
      nudgeQueue();
      res.status(201).json({ job: jobView(ready) });
    } finally {
      await fs.promises.rm(file.path, { force: true });
    }
  }),
);

jobsRouter.get(
  '/:id',
  ah(async (req, res) => {
    res.json({ job: jobView(await ownJob(me(req).id, String(req.params.id))) });
  }),
);

jobsRouter.post(
  '/:id/cancel',
  ah(async (req, res) => {
    const job = await ownJob(me(req).id, String(req.params.id));
    if (!WAITING.includes(job.status)) throw conflict('This job is not running', 'NOT_RUNNING');
    await prisma.clipJob.updateMany({ where: { id: job.id, status: { in: WAITING } }, data: { status: JobStatus.CANCELLED, stage: 'Cancelled', finishedAt: new Date() } });
    abortJob(job.id);
    res.json({ job: jobView(await ownJob(me(req).id, job.id)) });
  }),
);

/** Run a failed or cancelled job again with the same settings. */
jobsRouter.post(
  '/:id/retry',
  ah(async (req, res) => {
    const job = await ownJob(me(req).id, String(req.params.id));
    if (job.status !== JobStatus.FAILED && job.status !== JobStatus.CANCELLED) throw conflict('Only failed or cancelled jobs can be retried', 'NOT_RETRYABLE');
    if (job.sourceKind === 'UPLOAD' && !(await sourceOf(job.id))) throw conflict('The uploaded file is gone. Upload it again.', 'SOURCE_GONE');
    const updated = await prisma.clipJob.update({
      where: { id: job.id },
      data: { status: JobStatus.QUEUED, progress: 0, stage: 'Waiting in line', error: null, finishedAt: null },
      include: { clips: true },
    });
    nudgeQueue();
    res.json({ job: jobView(updated) });
  }),
);

/** Same source, new settings (e.g. the desktop version of a phone set): a new job. */
jobsRouter.post(
  '/:id/reclip',
  ah(async (req, res) => {
    const { options } = parse(z.object({ options: optionsSchema }), req.body);
    checkLimits(options);
    const job = await ownJob(me(req).id, String(req.params.id));
    const base = {
      userId: job.userId,
      sourceKind: job.sourceKind,
      sourceUrl: job.sourceUrl,
      sourceName: job.sourceName,
      title: job.title,
      uploader: job.uploader,
      thumbnailUrl: job.thumbnailUrl,
      sourceDuration: job.sourceDuration,
      options,
    };
    if (job.sourceKind === 'URL') {
      const next = await prisma.clipJob.create({ data: base });
      nudgeQueue();
      return void res.status(201).json({ job: jobView(next) });
    }
    const src = await sourceOf(job.id);
    if (!src) throw conflict('The uploaded file is gone. Upload it again.', 'SOURCE_GONE');
    const next = await prisma.clipJob.create({ data: { ...base, status: JobStatus.CANCELLED, stage: 'Preparing' } });
    await fs.promises.mkdir(jobDir(next.id), { recursive: true });
    const to = path.join(jobDir(next.id), path.basename(src));
    // A hard link costs no disk space; copy when the file system does not allow one
    await fs.promises.link(src, to).catch(() => fs.promises.copyFile(src, to));
    const ready = await prisma.clipJob.update({ where: { id: next.id }, data: { status: JobStatus.QUEUED, stage: 'Waiting in line' } });
    nudgeQueue();
    res.status(201).json({ job: jobView(ready) });
  }),
);

jobsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const job = await ownJob(me(req).id, String(req.params.id));
    abortJob(job.id);
    await prisma.clipJob.delete({ where: { id: job.id } });
    await removeJobFiles(job.id);
    res.status(204).end();
  }),
);

jobsRouter.delete(
  '/:id/clips/:clipId',
  ah(async (req, res) => {
    const job = await ownJob(me(req).id, String(req.params.id));
    const clip = job.clips.find((c) => c.id === req.params.clipId);
    if (!clip) throw notFound('Clip');
    await prisma.clip.delete({ where: { id: clip.id } });
    for (const rel of [clip.file, clip.thumb]) if (rel) await fs.promises.rm(resolveStored(rel), { force: true });
    res.json({ job: jobView(await ownJob(me(req).id, job.id)) });
  }),
);

function checkLimits(o: z.infer<typeof optionsSchema>) {
  if (o.maxClips > env.MAX_CLIPS_PER_JOB) throw badRequest(`At most ${env.MAX_CLIPS_PER_JOB} clips per video on this server`, 'TOO_MANY_CLIPS');
  if ((o.ranges?.length ?? 0) > env.MAX_CLIPS_PER_JOB) throw badRequest(`At most ${env.MAX_CLIPS_PER_JOB} ranges per video on this server`, 'TOO_MANY_CLIPS');
}

async function sourceOf(jobId: string) {
  const dir = jobDir(jobId);
  const name = (await fs.promises.readdir(dir).catch(() => [] as string[])).find((f) => f.startsWith('source.'));
  return name ? path.join(dir, name) : null;
}

async function moveFile(from: string, to: string) {
  try {
    await fs.promises.rename(from, to);
  } catch {
    // Different disks: copy instead
    await fs.promises.copyFile(from, to);
  }
}
