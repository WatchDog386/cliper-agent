import fs from 'node:fs';
import path from 'node:path';
import { JobStatus } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { incomingDir, removeJobFiles } from '../lib/storage';

/*
 * Video is big. Finished, failed and cancelled jobs (with their files) are deleted KEEP_JOBS_DAYS after
 * they ended; half-finished uploads are cleared after a day. Runs hourly.
 */
export async function sweep() {
  if (env.KEEP_JOBS_DAYS > 0) {
    const before = new Date(Date.now() - env.KEEP_JOBS_DAYS * 86_400_000);
    const old = await prisma.clipJob.findMany({
      // A job whose clips still wait to be posted (scheduled posts) is kept until they have gone out
      where: {
        status: { in: [JobStatus.DONE, JobStatus.FAILED, JobStatus.CANCELLED] },
        updatedAt: { lt: before },
        clips: { none: { publications: { some: { status: { in: ['QUEUED', 'PUBLISHING'] } } } } },
      },
      select: { id: true },
      take: 500,
    });
    for (const { id } of old) {
      await removeJobFiles(id);
      await prisma.clipJob.delete({ where: { id } }).catch(() => undefined);
    }
    if (old.length) console.log(`[retention] removed ${old.length} old job(s)`);
  }
  const dir = incomingDir();
  for (const f of await fs.promises.readdir(dir).catch(() => [] as string[])) {
    const p = path.join(dir, f);
    const st = await fs.promises.stat(p).catch(() => null);
    if (st && Date.now() - st.mtimeMs > 86_400_000) await fs.promises.rm(p, { force: true });
  }
}

export function scheduleRetention() {
  if (env.NODE_ENV === 'test') return;
  const go = () => void sweep().catch((e) => console.error('[retention] failed', e));
  setTimeout(go, 30_000).unref();
  setInterval(go, 60 * 60_000).unref();
}
