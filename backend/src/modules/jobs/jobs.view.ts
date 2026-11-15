import type { Clip, ClipJob } from '@prisma/client';
import { signMediaToken } from '../../lib/jwt';

/** A job as the app sees it. File links carry a 12-hour media token (players cannot send headers). */
export function jobView(job: ClipJob & { clips?: Clip[]; _count?: { clips: number } }) {
  const t = encodeURIComponent(signMediaToken(job.userId, job.id));
  const clips = (job.clips ?? [])
    .sort((a, b) => a.index - b.index)
    .map((c) => ({
      id: c.id,
      index: c.index,
      startSec: c.startSec,
      endSec: c.endSec,
      duration: c.duration,
      width: c.width,
      height: c.height,
      sizeBytes: c.sizeBytes,
      score: c.score,
      videoUrl: `/media/clips/${c.id}/video?t=${t}`,
      thumbUrl: c.thumb ? `/media/clips/${c.id}/thumb?t=${t}` : null,
      downloadUrl: `/media/clips/${c.id}/download?t=${t}`,
    }));
  const firstThumb = clips.find((c) => c.thumbUrl)?.thumbUrl ?? null;
  return {
    id: job.id,
    sourceKind: job.sourceKind,
    sourceUrl: job.sourceUrl,
    sourceName: job.sourceName,
    title: job.title ?? job.sourceName ?? job.sourceUrl ?? 'Untitled video',
    uploader: job.uploader,
    thumbnailUrl: job.thumbnailUrl,
    cover: job.thumbnailUrl ?? firstThumb,
    sourceDuration: job.sourceDuration,
    sourceWidth: job.sourceWidth,
    sourceHeight: job.sourceHeight,
    options: job.options,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    error: job.error,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    clipCount: job._count?.clips ?? clips.length,
    totalBytes: clips.reduce((s, c) => s + c.sizeBytes, 0),
    zipUrl: `/media/jobs/${job.id}/zip?t=${t}`,
    clips,
  };
}
