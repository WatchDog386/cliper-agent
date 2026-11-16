import fs from 'node:fs';
import { PublicationStatus, type Prisma } from '@prisma/client';
import { env } from '../config/env';
import { signMediaToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { resolveStored } from '../lib/storage';
import { flagReconnect, freshTokens } from './accounts';
import { ProviderError } from './http';
import { providers } from './providers';
import type { Privacy } from './types';

/*
 * The posting queue. Like the clip queue, the database is the queue: a publication waits as QUEUED
 * until its `runAt` (now, or a scheduled time), is claimed atomically, uploaded to the platform and
 * ends PUBLISHED or FAILED. Rate limits and platform hiccups are retried a few times, a while apart.
 */
const MAX_ATTEMPTS = 4;
const RETRY_AFTER_MS = [60_000, 5 * 60_000, 15 * 60_000];

const running = new Map<string, AbortController>();
let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
let stopping = false;

export function startPublisher() {
  if (env.NODE_ENV === 'test') return;
  stopping = false;
  // An upload cut off by a restart may or may not have gone through: never post twice by guessing
  void prisma.publication
    .updateMany({
      where: { status: PublicationStatus.PUBLISHING },
      data: { status: PublicationStatus.FAILED, error: 'The server restarted during this upload. Check the account before posting again.' },
    })
    .then(() => tick())
    .catch((e) => console.error('[publisher] could not recover', e));
  timer = setInterval(() => void tick(), 5000);
}

export async function stopPublisher() {
  stopping = true;
  if (timer) clearInterval(timer);
  for (const ac of running.values()) ac.abort();
}

/** Wake the queue now (something was just queued). */
export const nudgePublisher = () => void tick();
export const abortPublication = (id: string) => running.get(id)?.abort();
export const publisherStats = () => ({ running: running.size, concurrency: env.PUBLISH_CONCURRENCY });

async function tick() {
  if (ticking || stopping || env.NODE_ENV === 'test') return;
  ticking = true;
  try {
    while (running.size < env.PUBLISH_CONCURRENCY && !stopping) {
      const next = await prisma.publication.findFirst({
        where: { status: PublicationStatus.QUEUED, runAt: { lte: new Date() }, id: { notIn: [...running.keys()] } },
        orderBy: { runAt: 'asc' },
        select: { id: true },
      });
      if (!next) break;
      if (!(await claim(next.id))) continue;
      const ac = new AbortController();
      running.set(next.id, ac);
      void publishOne(next.id, ac.signal).finally(() => {
        running.delete(next.id);
        void tick();
      });
    }
  } catch (e) {
    console.error('[publisher] tick failed', e);
  } finally {
    ticking = false;
  }
}

const claim = async (id: string) =>
  (await prisma.publication.updateMany({ where: { id, status: PublicationStatus.QUEUED }, data: { status: PublicationStatus.PUBLISHING, progress: 0, error: null, attempts: { increment: 1 } } })).count > 0;

/** The address a platform can download a clip from (Instagram), when the server is on the internet. */
function publicClipUrl(userId: string, jobId: string, clipId: string) {
  if (!/^https:\/\//.test(env.PUBLIC_URL)) return null;
  return `${env.PUBLIC_URL}/api/v1/media/clips/${clipId}/video?t=${encodeURIComponent(signMediaToken(userId, jobId))}`;
}

/** Uploads one claimed publication (status PUBLISHING). Exported for the tests. */
export async function publishOne(id: string, signal: AbortSignal) {
  const finish = (data: Prisma.PublicationUpdateManyMutationInput) => prisma.publication.updateMany({ where: { id, status: PublicationStatus.PUBLISHING }, data });
  let accountId: string | null = null;
  let attempts = MAX_ATTEMPTS;
  try {
    const pub = await prisma.publication.findUniqueOrThrow({ where: { id }, include: { clip: true, account: true } });
    accountId = pub.accountId;
    attempts = pub.attempts;
    const provider = providers[pub.account.platform];
    if (!provider.configured()) throw new ProviderError(`${provider.label} is not set up on this server any more`, 400);
    if (!pub.clip) throw new ProviderError('The clip was deleted before it could be posted', 400);
    const file = resolveStored(pub.clip.file);
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat) throw new ProviderError('The clip file is no longer on the server', 400);
    if (pub.clip.duration > provider.limits.maxSeconds)
      throw new ProviderError(`${provider.label} takes videos up to ${Math.round(provider.limits.maxSeconds / 60)} minutes; this clip is longer`, 400);

    const tokens = await freshTokens(pub.account);
    let lastWrite = 0;
    const result = await provider.publish({
      tokens,
      account: { externalId: pub.account.externalId, name: pub.account.name, handle: pub.account.handle },
      file,
      size: stat.size,
      width: pub.clip.width,
      height: pub.clip.height,
      duration: pub.clip.duration,
      title: pub.title,
      caption: pub.caption,
      privacy: (provider.privacy.includes(pub.privacy as Privacy) ? pub.privacy : provider.privacy[0]) as Privacy,
      publicVideoUrl: publicClipUrl(pub.userId, pub.clip.jobId, pub.clip.id),
      signal,
      onProgress: (f) => {
        if (Date.now() - lastWrite < 1500) return;
        lastWrite = Date.now();
        void finish({ progress: Math.max(0, Math.min(99, Math.round(f * 100))) }).catch(() => undefined);
      },
    });
    await finish({ status: PublicationStatus.PUBLISHED, progress: 100, externalId: result.externalId, externalUrl: result.url, publishedAt: new Date(), error: null });
  } catch (err) {
    if (signal.aborted) {
      // Cancelled by the person (already marked) or the server is stopping (see startPublisher)
      return;
    }
    const e = err instanceof ProviderError ? err : new ProviderError(err instanceof Error ? err.message : 'Posting failed', 0);
    if (e.authFailed && accountId) await flagReconnect(accountId).catch(() => undefined);
    if (e.transient && attempts < MAX_ATTEMPTS) {
      const wait = RETRY_AFTER_MS[Math.min(attempts - 1, RETRY_AFTER_MS.length - 1)]!;
      await finish({ status: PublicationStatus.QUEUED, runAt: new Date(Date.now() + wait), error: `${e.message} (trying again in ${Math.round(wait / 60_000)} min)` }).catch(() => undefined);
      return;
    }
    if (!(err instanceof ProviderError)) console.error(`[publisher] ${id} failed`, err);
    await finish({ status: PublicationStatus.FAILED, error: e.message.slice(0, 500) }).catch(() => undefined);
  }
}
