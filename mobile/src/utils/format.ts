/** 75 → "1:15", 3723 → "1:02:03" */
export function clock(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '–';
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "1:15" / "75" / "1:02:03" → seconds (undefined when empty or unreadable) */
export function parseClock(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const parts = t.split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p)) || parts.length > 3) return undefined;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function compact(n: number | null | undefined) {
  if (n === null || n === undefined) return '';
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function ago(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 7 * 86400) return `${Math.floor(d / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

/** How many clips the settings will make from a video of `total` seconds (mirrors the server's planner). */
export function estimateClips(total: number | null | undefined, o: { mode: string; segmentSeconds: number; maxClips: number; startAt?: number; endAt?: number; ranges?: unknown[] }) {
  if (o.mode === 'custom') return Math.min(o.ranges?.length ?? 0, o.maxClips);
  if (!total) return null;
  const from = Math.min(o.startAt ?? 0, total);
  const to = Math.min(Math.max(from, o.endAt ?? total), total);
  const span = to - from;
  if (span <= 0) return 0;
  if (o.mode === 'highlights') return Math.max(1, Math.min(o.maxClips, Math.floor(span / Math.min(o.segmentSeconds, span))));
  const full = Math.floor(span / o.segmentSeconds);
  const tail = span - full * o.segmentSeconds;
  const n = full + (tail >= Math.max(3, o.segmentSeconds / 3) || full === 0 ? 1 : 0);
  return Math.min(o.maxClips, n);
}
