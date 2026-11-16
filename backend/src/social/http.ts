import fs from 'node:fs';

/*
 * Small HTTP helpers for the platform APIs (Node's built-in fetch). A failed call becomes a
 * ProviderError carrying the platform's own message, the status, and whether trying again can help.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Tokens were refused: the person has to connect the account again. */
    public authFailed = false,
    /** Worth another attempt later (rate limit, platform hiccup, network). */
    public transient = false,
  ) {
    super(message);
  }
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The human-readable error in a platform's reply (they all nest it differently). */
function reason(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.slice(0, 300) || fallback;
  const b = body as Json | null;
  const e = b?.error;
  const found =
    (typeof e === 'object' && e ? (e.error_user_msg ?? e.message ?? e.error_description) : undefined) ??
    b?.error_description ??
    (typeof e === 'string' ? e : undefined) ??
    b?.errors?.[0]?.message ??
    b?.errors?.[0]?.detail ??
    b?.detail ??
    b?.message ??
    b?.title;
  return typeof found === 'string' && found ? found.slice(0, 300) : fallback;
}

export interface CallOptions {
  method?: string;
  headers?: Record<string, string>;
  /** Sent as JSON. */
  json?: unknown;
  /** Sent as application/x-www-form-urlencoded. */
  form?: Record<string, string>;
  /** Sent as is (bytes, FormData). */
  body?: RequestInit['body'];
  token?: string;
  signal?: AbortSignal;
  /** Statuses that are fine besides 2xx (e.g. 308 for a resumable upload that wants more). */
  okStatuses?: number[];
}

export async function call(url: string, o: CallOptions = {}): Promise<{ status: number; headers: Headers; data: Json }> {
  const headers: Record<string, string> = { Accept: 'application/json', ...o.headers };
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  let body: RequestInit['body'] = o.body;
  if (o.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(o.json);
  } else if (o.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(o.form).toString();
  }
  let res: Response;
  try {
    res = await fetch(url, { method: o.method ?? (body ? 'POST' : 'GET'), headers, body, signal: o.signal, redirect: 'manual' });
  } catch (e) {
    if (o.signal?.aborted) throw new ProviderError('Cancelled', 0);
    throw new ProviderError(`Could not reach ${new URL(url).host}: ${e instanceof Error ? e.message : 'network error'}`, 0, false, true);
  }
  const text = await res.text();
  let data: Json = {};
  try {
    data = text ? (JSON.parse(text) as Json) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok && !o.okStatuses?.includes(res.status)) {
    const msg = reason(data.raw ?? data, `${new URL(url).host} answered ${res.status}`);
    throw new ProviderError(msg, res.status, res.status === 401, res.status === 429 || res.status >= 500);
  }
  return { status: res.status, headers: res.headers, data };
}

/** Read `length` bytes of a file from `start` (uploads go up in pieces, never the whole file in memory). */
export async function readChunk(file: string, start: number, length: number): Promise<Buffer> {
  const fh = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, start);
    return bytesRead === length ? buf : buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** Wait, unless the job is cancelled first. */
export function pause(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new ProviderError('Cancelled', 0));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      resolve();
    }, ms);
    const stop = () => {
      clearTimeout(t);
      reject(new ProviderError('Cancelled', 0));
    };
    signal?.addEventListener('abort', stop, { once: true });
  });
}

/**
 * Ask `check` every `everyMs` until it returns a value (not undefined) or `timeoutMs` passes. Platforms
 * process a video after the upload; this waits for that.
 */
export async function poll<T>(check: () => Promise<T | undefined>, o: { everyMs: number; timeoutMs: number; signal?: AbortSignal; what: string }): Promise<T> {
  const until = Date.now() + o.timeoutMs;
  for (;;) {
    const v = await check();
    if (v !== undefined) return v;
    if (Date.now() > until) throw new ProviderError(`${o.what} is taking too long. Check the account in a few minutes before trying again.`, 0);
    await pause(o.everyMs, o.signal);
  }
}

export const inSeconds = (s: unknown) => (typeof s === 'number' && s > 0 ? new Date(Date.now() + s * 1000) : null);
export const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
/** Title and caption as one text, for platforms with a single text field. */
export const oneText = (title: string, caption: string, max: number) => clip(caption.trim() || title.trim(), max);
