import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { env } from '../config/env';
import type { ClipOptions } from './options';

/*
 * OpusClip API client (https://help.opus.pro/api-reference). Used by the "AI clips" mode:
 *   POST /api/clip-projects                         { videoUrl, curationPref, … } → the project
 *   GET  /api/clip-projects/:id                     the project (polled until it finishes)
 *   GET  /api/exportable-clips?q=findByProjectId    the clips: uriForExport, title, description, hashtags…
 *   GET  /api/brand-templates?q=mine                the account's caption / layout templates
 * Auth: `Authorization: Bearer <OPUSCLIP_API_KEY>`. Rate limit: 30 requests a minute per key.
 * The project response is not fully documented, so its fields are read defensively.
 */

export const opusEnabled = () => Boolean(env.OPUSCLIP_API_KEY);

export class OpusError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown>;

async function call<T = Json>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  if (!opusEnabled()) throw new OpusError('AI clips are not set up on this server (OPUSCLIP_API_KEY is empty)');
  let res: Response;
  try {
    res = await fetch(`${env.OPUSCLIP_API_URL}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: { Authorization: `Bearer ${env.OPUSCLIP_API_KEY}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
  } catch (e) {
    if (init.signal?.aborted) throw e;
    throw new OpusError('Could not reach OpusClip. Check the server’s internet connection.');
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const msg = pickString(json as Json, ['message', 'error', 'msg']) ?? text.slice(0, 200);
    if (res.status === 401 || res.status === 403) throw new OpusError('OpusClip rejected the API key. Check OPUSCLIP_API_KEY.', res.status);
    if (res.status === 429) throw new OpusError('OpusClip rate limit reached (30 requests a minute). Try again shortly.', 429);
    if (res.status === 402 || /credit/i.test(msg ?? '')) throw new OpusError(`OpusClip: not enough credits. ${msg ?? ''}`.trim(), res.status);
    throw new OpusError(`OpusClip: ${msg || `request failed (${res.status})`}`, res.status);
  }
  return json as T;
}

function pickString(o: Json | null | undefined, keys: string[]): string | undefined {
  if (!o || typeof o !== 'object') return undefined;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v) return v;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = pickString(v as Json, ['message', 'text']);
      if (inner) return inner;
    }
  }
  return undefined;
}

function pickNumber(o: Json, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

const DURATIONS: Record<ClipOptions['aiDuration'], [number, number][]> = {
  auto: [[0, 180]],
  short: [[0, 30]],
  medium: [[30, 60]],
  long: [[60, 90]],
  xl: [[90, 180]],
};

/** The request body for a new project from our options. */
export function projectBody(videoUrl: string, o: ClipOptions, title?: string | null) {
  const curationPref: Json = { model: o.aiModel, clipDurations: DURATIONS[o.aiDuration], genre: 'Auto' };
  if (o.aiHook) curationPref.enableAutoHook = true;
  if (o.aiPrompt) {
    if (o.aiModel === 'ClipAnything') curationPref.customPrompt = o.aiPrompt;
    else curationPref.topicKeywords = o.aiPrompt.split(/[,;\n]/).map((k) => k.trim()).filter(Boolean).slice(0, 10);
  }
  // Both ends are required when a range is sent; omit it to clip the whole video
  if (o.startAt !== undefined || o.endAt !== undefined) {
    const startSec = Math.floor(o.startAt ?? 0);
    const endSec = Math.ceil(o.endAt ?? 10 * 3600);
    if (endSec > startSec) curationPref.range = { startSec, endSec };
  }
  const body: Json = { videoUrl, curationPref };
  if (o.aiTemplateId) body.brandTemplateId = o.aiTemplateId;
  if (o.aiLanguage) body.importPref = { sourceLang: o.aiLanguage };
  if (title) body.uploadedVideoAttr = { title: title.slice(0, 200) };
  return body;
}

export async function createProject(videoUrl: string, o: ClipOptions, title?: string | null, signal?: AbortSignal) {
  const r = await call<Json>('/api/clip-projects', { body: projectBody(videoUrl, o, title), signal });
  const data = (r?.data && typeof r.data === 'object' ? r.data : r) as Json;
  const id = pickString(data, ['projectId', 'id', 'project_id']);
  if (!id) throw new OpusError('OpusClip did not return a project id');
  return id;
}

export type ProjectState = 'running' | 'done' | 'failed';

/** Where a project is, read from whichever status field the API returns. */
export function projectState(p: Json | null): { state: ProjectState; detail?: string; percent?: number } {
  if (!p) return { state: 'running' };
  const data = (p.data && typeof p.data === 'object' ? p.data : p) as Json;
  const raw = [pickString(data, ['status']), pickString(data, ['stage']), pickString(data, ['state']), pickString(data, ['curationStatus']), pickString(data, ['renderStatus'])]
    .filter(Boolean)
    .join(' ');
  const percent = pickNumber(data, ['progress', 'percent', 'percentage']);
  if (/fail|error|cancel|abort|refund/i.test(raw)) return { state: 'failed', detail: pickString(data, ['errorMessage', 'failReason', 'reason', 'error']) ?? raw };
  if (/complete|done|finish|success|ready|exported|rendered/i.test(raw)) return { state: 'done', detail: raw, percent: 100 };
  return { state: 'running', detail: raw || undefined, percent };
}

export const getProject = (id: string, signal?: AbortSignal) => call<Json>(`/api/clip-projects/${encodeURIComponent(id)}`, { signal });

export interface OpusClip {
  id: string;
  url: string;
  durationSec: number | null;
  startSec: number | null;
  endSec: number | null;
  title: string | null;
  description: string | null;
  hashtags: string | null;
  score: number | null;
}

/** A clip from /exportable-clips, normalised. timeRanges are in milliseconds. */
export function normaliseClip(c: Json): OpusClip | null {
  const url = pickString(c, ['uriForExport', 'uriForPreview', 'url']);
  const id = pickString(c, ['id', 'curationId']);
  if (!url || !id) return null;
  const ranges = Array.isArray(c.timeRanges) ? (c.timeRanges as unknown[]).filter((r): r is [number, number] => Array.isArray(r) && r.length === 2) : [];
  const ms = pickNumber(c, ['durationMs']);
  const toSec = (v: number) => (v > 36_000 ? v / 1000 : v); // ms (documented), tolerate seconds
  let score = pickNumber(c, ['viralityScore', 'virality_score', 'score', 'rating']);
  if (score !== undefined && score <= 10) score *= 10; // 0–10 → 0–100
  const hashtags = Array.isArray(c.hashtags) ? (c.hashtags as string[]).join(' ') : pickString(c, ['hashtags']);
  return {
    id,
    url,
    durationSec: ms !== undefined ? ms / 1000 : null,
    startSec: ranges[0] ? toSec(ranges[0][0]) : null,
    endSec: ranges.length ? toSec(ranges[ranges.length - 1]![1]) : null,
    title: pickString(c, ['title']) ?? null,
    description: pickString(c, ['description']) ?? null,
    hashtags: hashtags ?? null,
    score: score !== undefined ? Math.max(0, Math.min(100, score)) : null,
  };
}

export async function listClips(projectId: string, signal?: AbortSignal): Promise<OpusClip[]> {
  const out: OpusClip[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await call<unknown>(`/api/exportable-clips?q=findByProjectId&projectId=${encodeURIComponent(projectId)}&pageNum=${page}&pageSize=50`, { signal });
    const list = (Array.isArray(r) ? r : Array.isArray((r as Json)?.data) ? (r as Json).data : Array.isArray((r as Json)?.list) ? (r as Json).list : []) as Json[];
    for (const c of list) {
      const n = normaliseClip(c);
      if (n && !out.some((x) => x.id === n.id)) out.push(n);
    }
    if (list.length < 50) break;
  }
  return out;
}

export async function listTemplates(signal?: AbortSignal) {
  const r = await call<unknown>('/api/brand-templates?q=mine', { signal });
  const list = (Array.isArray(r) ? r : ((r as Json)?.data as unknown[]) ?? []) as Json[];
  return list.map((t) => ({
    id: pickString(t, ['templateId', 'id']) ?? '',
    name: pickString(t, ['name']) ?? 'Template',
    isDefault: t.isDefault === true,
  }));
}

/** Download one rendered clip from OpusClip's CDN. */
export async function downloadClip(url: string, to: string, signal?: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new OpusError(`Could not download a clip from OpusClip (${res.status})`);
  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), fs.createWriteStream(to));
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    });
  });

/**
 * Wait until the project has finished and return its clips. Polls about every 20 s (well under the
 * rate limit). Finished means: the project says so, or clips have appeared and stopped changing.
 */
export async function waitForClips(projectId: string, onTick: (info: { elapsedMin: number; percent?: number; detail?: string }) => void, signal?: AbortSignal) {
  const started = Date.now();
  let lastCount = -1;
  let stable = 0;
  for (let i = 0; ; i++) {
    if (Date.now() - started > env.OPUSCLIP_TIMEOUT_MINUTES * 60_000) throw new OpusError(`OpusClip did not finish within ${env.OPUSCLIP_TIMEOUT_MINUTES} minutes`);
    const p = await getProject(projectId, signal).catch((e) => {
      if (signal?.aborted || (e instanceof OpusError && e.status === 401)) throw e;
      return null; // transient: try again next round
    });
    const st = projectState(p);
    if (st.state === 'failed') throw new OpusError(`OpusClip could not clip this video${st.detail ? `: ${st.detail}` : ''}`);
    onTick({ elapsedMin: (Date.now() - started) / 60_000, percent: st.percent, detail: st.detail });
    // Clips are checked every round once the project is done, else every third round
    if (st.state === 'done' || i % 3 === 2) {
      const clips = await listClips(projectId, signal).catch((e) => {
        if (signal?.aborted) throw e;
        return [] as OpusClip[];
      });
      if (clips.length && st.state === 'done') return clips;
      if (clips.length && clips.length === lastCount) stable++;
      else stable = 0;
      lastCount = clips.length;
      if (stable >= 2 && !st.detail) return clips;
      if (st.state === 'done' && !clips.length && i > 3) throw new OpusError('OpusClip finished but found no clips in this video');
    }
    await sleep(20_000, signal);
  }
}
