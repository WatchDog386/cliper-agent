import type { Campaign, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { nudgeQueue } from '../clipper/queue';
import { optionsSchema } from '../clipper/options';
import { prisma } from '../lib/prisma';
import { assertPublicUrl } from '../lib/url-guard';
import { scout } from '../scout/scout';
import { autoPublishSchema } from '../social/autopublish';

/*
 * Autopilot. A campaign is a standing order: "every 6 hours, find the best new videos about GTA 6 and
 * clip the top 3". Each run scouts the topic, drops what the campaign has already taken, and queues
 * clip jobs for the best of the rest (which post themselves when the campaign names accounts).
 */
let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;

export function startAutopilot() {
  if (env.NODE_ENV === 'test') return;
  timer = setInterval(() => void tick(), 60_000);
  setTimeout(() => void tick(), 15_000).unref();
}
export function stopAutopilot() {
  if (timer) clearInterval(timer);
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const due = await prisma.campaign.findMany({ where: { enabled: true, nextRunAt: { lte: new Date() }, user: { active: true } }, orderBy: { nextRunAt: 'asc' }, take: 5 });
    for (const c of due) await runCampaign(c).catch((e) => console.error(`[autopilot] campaign ${c.id} failed`, e));
  } catch (e) {
    console.error('[autopilot] tick failed', e);
  } finally {
    busy = false;
  }
}

export interface RunResult {
  queued: { title: string; creator: string; url: string; jobId: string }[];
  note: string;
}

/** One run of a campaign, now. The next run is scheduled `everyHours` from now whatever happens. */
export async function runCampaign(campaign: Campaign): Promise<RunResult> {
  const next = new Date(Date.now() + campaign.everyHours * 3_600_000);
  const done = async (note: string, queued: RunResult['queued'] = []) => {
    await prisma.campaign.updateMany({ where: { id: campaign.id }, data: { lastRunAt: new Date(), nextRunAt: next, lastNote: note.slice(0, 500) } });
    return { queued, note };
  };
  const options = optionsSchema.safeParse(campaign.options);
  if (!options.success) return done('This campaign has invalid clip settings. Edit and save it again.');
  const auto = campaign.autoPublish ? autoPublishSchema.safeParse(campaign.autoPublish) : null;

  const sources = campaign.sources.filter((s): s is 'youtube' | 'twitch' => s === 'youtube' || s === 'twitch');
  const found = await scout({
    topic: campaign.topic,
    days: campaign.days,
    sources: sources.length ? sources : ['youtube'],
    minViews: campaign.minViews,
    minSubscribers: campaign.minSubscribers,
    maxSeconds: Math.min(campaign.maxMinutes, env.MAX_SOURCE_MINUTES) * 60,
    // Nothing shorter than one clip's worth
    minSeconds: 5,
  });
  if (!found.videos.length) return done(`Nothing new found. ${found.notes.join(' · ')}`);

  const taken = new Set((await prisma.campaignItem.findMany({ where: { campaignId: campaign.id }, select: { url: true } })).map((i) => i.url));
  const fresh = found.videos.filter((v) => !taken.has(v.url)).slice(0, campaign.videosPerRun);
  if (!fresh.length) return done(`No new videos: the ${found.videos.length} found were already clipped.`);

  // Posting only to accounts that are still connected
  let autoPublish: Prisma.InputJsonValue | undefined;
  if (auto?.success) {
    const ids = (await prisma.socialAccount.findMany({ where: { id: { in: auto.data.accountIds }, userId: campaign.userId }, select: { id: true } })).map((a) => a.id);
    if (ids.length) autoPublish = { ...auto.data, accountIds: ids } as Prisma.InputJsonValue;
  }

  const queued: RunResult['queued'] = [];
  for (const v of fresh) {
    let url: string;
    try {
      url = await assertPublicUrl(v.url);
    } catch {
      continue;
    }
    // A Twitch clip is already the moment: reframe and caption the whole thing instead of cutting it up
    const o = v.kind === 'clip' ? { ...options.data, mode: 'split' as const, segmentSeconds: Math.max(options.data.segmentSeconds, Math.ceil(v.duration ?? 60)), maxClips: 1, startAt: undefined, endAt: undefined } : options.data;
    const job = await prisma.clipJob.create({
      data: {
        userId: campaign.userId,
        sourceKind: 'URL',
        sourceUrl: url,
        title: v.title.slice(0, 200),
        uploader: v.creator,
        thumbnailUrl: v.thumbnail,
        sourceDuration: v.duration,
        options: { ...o, topic: o.topic ?? campaign.topic } as Prisma.InputJsonValue,
        autoPublish,
      },
    });
    await prisma.campaignItem.create({ data: { campaignId: campaign.id, url: v.url, platform: v.platform, title: v.title.slice(0, 300), creator: v.creator, views: Math.min(v.views, 2_147_483_647), score: v.score ?? null, jobId: job.id } }).catch(() => undefined);
    queued.push({ title: v.title, creator: v.creator, url: v.url, jobId: job.id });
  }
  nudgeQueue();
  return done(queued.length ? `Clipping ${queued.length} video${queued.length === 1 ? '' : 's'}: ${queued.map((q) => `${q.creator} – ${q.title}`).join(' · ')}` : 'The videos found could not be used.', queued);
}
