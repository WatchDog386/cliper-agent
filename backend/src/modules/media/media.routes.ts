import fs from 'node:fs';
import { Router, type Request } from 'express';
import { ZipFile } from 'yazl';
import { prisma } from '../../lib/prisma';
import { verifyMediaToken } from '../../lib/jwt';
import { notFound, unauthorized } from '../../lib/http-error';
import { resolveStored } from '../../lib/storage';
import { ah } from '../../middleware/async';
import type { Aspect } from '../../clipper/options';

/*
 * Clip files. Opened by <video>, <img> and download links, which cannot send a sign-in header, so each
 * link carries the job's media token (?t=…, from GET /jobs/:id). A token opens one job's files only.
 */
export const mediaRouter = Router();

function token(req: Request) {
  const t = typeof req.query.t === 'string' ? req.query.t : '';
  try {
    return verifyMediaToken(t);
  } catch {
    throw unauthorized('This link has expired. Open the job again to refresh it.');
  }
}

async function clipFor(req: Request) {
  const t = token(req);
  const clip = await prisma.clip.findUnique({ where: { id: String(req.params.id) }, include: { job: { select: { id: true, userId: true, title: true, options: true } } } });
  if (!clip || clip.job.id !== t.job || clip.job.userId !== t.sub) throw notFound('Clip');
  return clip;
}

const slug = (s: string | null) =>
  (s ?? 'video')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .slice(0, 60)
    .toLowerCase() || 'video';

const ASPECT_TAG: Record<Aspect, string> = { phone: '9x16', desktop: '16x9', square: '1x1', portrait: '4x5', original: 'original' };
const fileName = (title: string | null, index: number, aspect: Aspect) => `${slug(title)}-clip-${String(index).padStart(2, '0')}-${ASPECT_TAG[aspect] ?? 'clip'}.mp4`;

const aspectOf = (options: unknown) => ((options as { aspect?: Aspect } | null)?.aspect ?? 'original') as Aspect;

mediaRouter.get(
  '/clips/:id/video',
  ah(async (req, res) => {
    const clip = await clipFor(req);
    // sendFile answers Range requests, so players can seek
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.type('video/mp4').sendFile(resolveStored(clip.file));
  }),
);

mediaRouter.get(
  '/clips/:id/thumb',
  ah(async (req, res) => {
    const clip = await clipFor(req);
    if (!clip.thumb) throw notFound('Thumbnail');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type('image/jpeg').sendFile(resolveStored(clip.thumb));
  }),
);

mediaRouter.get(
  '/clips/:id/download',
  ah(async (req, res) => {
    const clip = await clipFor(req);
    res.download(resolveStored(clip.file), fileName(clip.job.title, clip.index, aspectOf(clip.job.options)));
  }),
);

/** Every clip of a job in one zip (stored, not recompressed: video does not shrink). */
mediaRouter.get(
  '/jobs/:id/zip',
  ah(async (req, res) => {
    const t = token(req);
    const job = await prisma.clipJob.findUnique({ where: { id: String(req.params.id) }, include: { clips: { orderBy: { index: 'asc' } } } });
    if (!job || job.id !== t.job || job.userId !== t.sub) throw notFound('Job');
    if (!job.clips.length) throw notFound('Clips');
    res.attachment(`${slug(job.title)}-clips.zip`);
    const zip = new ZipFile();
    zip.outputStream.on('error', (err: Error) => res.destroy(err));
    zip.outputStream.pipe(res);
    const aspect = aspectOf(job.options);
    for (const c of job.clips) {
      const p = resolveStored(c.file);
      if (fs.existsSync(p)) zip.addFile(p, fileName(job.title, c.index, aspect), { compress: false });
    }
    zip.end();
  }),
);
