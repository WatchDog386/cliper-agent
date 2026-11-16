import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { nudgePublisher } from './publisher';

/*
 * "Post automatically": chosen when a job is created. When the job finishes, every clip is queued for
 * every chosen account, `everyMinutes` apart (0 = all at once), so a long video can feed a channel for
 * hours without anyone watching it.
 */
export const autoPublishSchema = z.object({
  accountIds: z.array(z.string().min(1)).min(1).max(20),
  /** Text for every post; {n} becomes the clip number, {title} the video's title. */
  caption: z.string().max(5000).default(''),
  /** Empty: each clip's own title. */
  title: z.string().max(200).default(''),
  privacy: z.enum(['public', 'unlisted', 'private']).default('public'),
  everyMinutes: z.number().int().min(0).max(7 * 24 * 60).default(0),
});
export type AutoPublish = z.infer<typeof autoPublishSchema>;

export const fillTemplate = (text: string, v: { n: number; title: string }) => text.replace(/\{n\}/g, String(v.n)).replace(/\{title\}/g, v.title);

/** Queue the posts for a job that just finished. Returns how many were queued. */
export async function queueAutoPublish(jobId: string): Promise<number> {
  const job = await prisma.clipJob.findUnique({ where: { id: jobId }, include: { clips: { orderBy: { index: 'asc' } } } });
  if (!job?.autoPublish || !job.clips.length) return 0;
  const parsed = autoPublishSchema.safeParse(job.autoPublish);
  if (!parsed.success) return 0;
  const plan = parsed.data;
  // Only accounts that are still connected, and still this person's
  const accounts = await prisma.socialAccount.findMany({ where: { id: { in: plan.accountIds }, userId: job.userId } });
  if (!accounts.length) return 0;
  const title = job.title ?? job.sourceName ?? 'Clip';
  const now = Date.now();
  const rows = job.clips.flatMap((clip, i) =>
    accounts.map((account) => ({
      userId: job.userId,
      clipId: clip.id,
      accountId: account.id,
      // Text written for this post wins; otherwise the clip's own ready-to-post title and caption
      title: (fillTemplate(plan.title, { n: clip.index, title }) || clip.title || `${title} (${clip.index})`).slice(0, 200),
      caption: fillTemplate(plan.caption, { n: clip.index, title }) || clip.caption || '',
      privacy: plan.privacy,
      runAt: new Date(now + i * plan.everyMinutes * 60_000),
    })),
  );
  await prisma.publication.createMany({ data: rows });
  nudgePublisher();
  return rows.length;
}
