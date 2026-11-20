import type { AdminUser, AiStatus, AppConfig, BrandKit, Clip, ClipOptions, DiscoverItem, Job, JobStatus, ScheduledPost, SourceMeta, User } from './types';
import { ApiError } from './client';

/*
 * An in-memory stand-in for the API, for hosted previews of the app (EXPO_PUBLIC_DEMO=1). Projects
 * created here "run" on a timer and finish with sample clips; nothing leaves the browser.
 */

const PALETTES: [string, string, string][] = [
  ['#2B1055', '#7597DE', '#FF4FA3'],
  ['#0F2027', '#2C5364', '#C8FF2E'],
  ['#1A0B2E', '#9B6BFF', '#38E1FF'],
  ['#200122', '#6F0000', '#FFB547'],
  ['#0B132B', '#3A506B', '#5BC0BE'],
  ['#141E30', '#243B55', '#FF5A6A'],
];

/** A gradient "frame" with a speaker silhouette and caption bar, as an SVG data URI. */
function thumb(i: number, w: number, h: number, caption = '') {
  const [a, b, c] = PALETTES[i % PALETTES.length]!;
  const r = Math.min(w, h);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<radialGradient id="l" cx="70%" cy="20%" r="60%"><stop offset="0" stop-color="${c}" stop-opacity="0.55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#l)"/>
<circle cx="${w / 2}" cy="${h * 0.42}" r="${r * 0.16}" fill="rgba(0,0,0,0.35)"/>
<path d="M ${w / 2 - r * 0.32} ${h * 0.8} Q ${w / 2} ${h * 0.5} ${w / 2 + r * 0.32} ${h * 0.8} Z" fill="rgba(0,0,0,0.35)"/>
${caption ? `<rect x="${w * 0.12}" y="${h * 0.66}" rx="${r * 0.03}" width="${w * 0.76}" height="${r * 0.11}" fill="rgba(0,0,0,0.55)"/><text x="${w / 2}" y="${h * 0.66 + r * 0.075}" font-family="Arial Black,Arial" font-weight="900" font-size="${r * 0.06}" fill="${c}" text-anchor="middle">${caption}</text>` : ''}
</svg>`;
  // base64: a utf8 data URI breaks inside CSS url() (react-native-web draws images as backgrounds)
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const user: User = { id: 'demo', email: 'demo@cliper.app', name: 'Demo Creator', role: 'ADMIN', createdAt: new Date().toISOString() };

const AI_CLIPS = [
  ['The one habit that changed my life', 'Why most people quit too early, and the 2-minute rule that fixes it.', '#productivity #mindset #habits', 96],
  ['Nobody tells you this about startups', 'The brutal truth about the first 100 customers.', '#startup #founder #business', 91],
  ['He said WHAT on live TV?!', 'The moment the whole studio went silent.', '#viral #funny #live', 88],
  ['Stop doing this at the gym', 'A coach breaks down the most common mistake.', '#fitness #gym #tips', 83],
  ['The $1 trick that saves hours', 'Small change, massive results.', '#lifehack #money', 79],
  ['Best answer to a tough question', 'Calm, clear and brilliant.', '#interview #podcast', 74],
] as const;

function makeClips(jobId: string, o: ClipOptions, n: number): Clip[] {
  const ai = o.mode === 'ai';
  const dims = ai || o.aspect === 'phone' ? [1080, 1920] : o.aspect === 'square' ? [1080, 1080] : o.aspect === 'portrait' ? [1080, 1350] : [1920, 1080];
  return Array.from({ length: n }, (_, i) => {
    const meta = AI_CLIPS[i % AI_CLIPS.length]!;
    const start = 30 + i * 47;
    const dur = ai ? 28 + ((i * 13) % 31) : o.segmentSeconds;
    const t = thumb(i + jobId.length, dims[0]! / 6, dims[1]! / 6, ai ? meta[0].split(' ').slice(0, 3).join(' ').toUpperCase() : '');
    return {
      id: `${jobId}-c${i + 1}`,
      index: i + 1,
      startSec: start,
      endSec: start + dur,
      duration: dur,
      width: dims[0]!,
      height: dims[1]!,
      sizeBytes: 4_200_000 + i * 380_000,
      score: ai ? meta[3] : o.mode === 'highlights' ? 95 - i * 9 : null,
      title: ai ? meta[0] : null,
      description: ai ? meta[1] : null,
      hashtags: ai ? meta[2] : null,
      videoUrl: '',
      thumbUrl: t,
      downloadUrl: '',
    };
  });
}

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const base = (id: string, title: string, o: Partial<ClipOptions>, extra: Partial<Job>): Job => {
  const options: ClipOptions = { mode: 'split', segmentSeconds: 30, maxClips: 10, aspect: 'phone', fit: 'blur', focus: 'center', quality: '1080', fade: false, mute: false, speed: 1, ...o };
  return {
    id,
    sourceKind: 'URL',
    sourceUrl: 'https://www.youtube.com/watch?v=demo',
    sourceName: null,
    title,
    uploader: 'Creator Studio',
    thumbnailUrl: thumb(id.length * 3, 320, 180),
    cover: thumb(id.length * 3, 320, 180),
    sourceDuration: 1834,
    sourceWidth: 1920,
    sourceHeight: 1080,
    options,
    status: 'DONE',
    progress: 100,
    stage: 'Ready',
    error: null,
    engine: options.mode === 'ai' ? 'opusclip' : 'local',
    createdAt: iso(3600_000),
    startedAt: iso(3500_000),
    finishedAt: iso(3000_000),
    clipCount: 0,
    totalBytes: 0,
    zipUrl: '',
    clips: [],
    ...extra,
  };
};

function finish(j: Job, n: number): Job {
  j.clips = makeClips(j.id, j.options, n);
  j.clipCount = j.clips.length;
  j.totalBytes = j.clips.reduce((s, c) => s + c.sizeBytes, 0);
  j.cover = j.thumbnailUrl ?? j.clips[0]?.thumbUrl ?? null;
  return j;
}

let jobs: Job[] = [
  finish(base('dj1', 'How I built a $10M company from my bedroom | Full Podcast', { mode: 'ai', maxClips: 6 }, { createdAt: iso(2 * 3600_000) }), 6),
  finish(base('dj2', 'Champions League Final — Extended Highlights', { mode: 'highlights', segmentSeconds: 30 }, { createdAt: iso(26 * 3600_000) }), 5),
  finish(base('dj3', 'Product launch keynote 2026', { mode: 'split', aspect: 'desktop', segmentSeconds: 60 }, { createdAt: iso(3 * 86400_000) }), 4),
  base('dj4', 'Late night show — best interview moments', { mode: 'ai' }, { status: 'FAILED', error: 'OpusClip: not enough credits for this video.', progress: 12, createdAt: iso(5 * 86400_000) }),
];

/** Jobs started in the demo progress on a 25-second timer. */
const running = new Map<string, number>();
function advance(j: Job): Job {
  const started = running.get(j.id);
  if (started === undefined) return j;
  const t = (Date.now() - started) / 25_000;
  const steps: [number, JobStatus, string][] = [
    [0.02, 'QUEUED', 'Waiting in line'],
    [0.3, 'FETCHING', 'Downloading the video'],
    [0.6, 'ANALYZING', j.options.mode === 'ai' ? 'AI is finding viral moments' : 'Finding the best moments'],
    [1, 'RENDERING', 'Rendering clips'],
  ];
  if (t >= 1) {
    running.delete(j.id);
    j.status = 'DONE';
    j.progress = 100;
    j.stage = 'Ready';
    j.finishedAt = new Date().toISOString();
    return finish(j, Math.min(j.options.maxClips, j.options.mode === 'custom' ? (j.options.ranges?.length ?? 1) : 6));
  }
  const step = steps.find((s) => t < s[0]) ?? steps[3]!;
  j.status = step[1];
  j.stage = `${step[2]} · ${Math.round(t * 100)}%`;
  j.progress = Math.round(t * 100);
  return j;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stats = () => ({
  total: jobs.length,
  active: jobs.filter((j) => !['DONE', 'FAILED', 'CANCELLED'].includes(j.status)).length,
  done: jobs.filter((j) => j.status === 'DONE').length,
  clips: jobs.reduce((s, j) => s + j.clips.length, 0),
});

const TRENDING: DiscoverItem[] = [
  'The most insane final 5 minutes ever',
  'I tried every AI video tool so you don’t have to',
  'Inside the world’s biggest startup accelerator',
  'Chef reacts to viral food hacks',
  'The interview that broke the internet',
  'Why everyone is moving to this city',
  'Learn this skill before 2027',
  'Unboxing the phone nobody expected',
].map((title, i) => ({ id: `t${i}`, title, channel: ['ESPN', 'MKBHD', 'Y Combinator', 'Gordon', 'Hot Ones', 'Vox', 'Ali Abdaal', 'Linus'][i]!, thumbnail: thumb(i * 7 + 1, 320, 180), duration: 300 + i * 211, views: 380_000 * (i + 1) * (9 - i), publishedAt: iso((i + 1) * 5 * 3600_000), url: `https://www.youtube.com/watch?v=demo${i}` }));

const LOGO = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" rx="18" fill="#0A0A0F"/><text x="120" y="52" font-family="Arial Black,Arial" font-weight="900" font-size="30" fill="#C8FF2E" text-anchor="middle">NOVA</text></svg>')}`;
let kits: BrandKit[] = [
  { id: 'k1', name: 'Nova Podcast', primaryColor: '#C8FF2E', secondaryColor: '#0A0A0F', logoUrl: LOGO, logoPosition: 'top-right', logoSize: 22, logoOpacity: 0.95, isDefault: true, createdAt: iso(9 * 86400_000) },
  { id: 'k2', name: 'Sports desk', primaryColor: '#FF4FA3', secondaryColor: '#38E1FF', logoUrl: null, logoPosition: 'bottom-left', logoSize: 14, logoOpacity: 0.8, isDefault: false, createdAt: iso(4 * 86400_000) },
];
const day = (d: number, h: number) => {
  const t = new Date();
  t.setDate(t.getDate() + d);
  t.setHours(h, 0, 0, 0);
  return t.toISOString();
};
let posts: ScheduledPost[] = [];
function seedPosts() {
  if (posts.length) return;
  const src = jobs[0]!;
  const plan: [number, number, ScheduledPost['platform'], ScheduledPost['status']][] = [
    [-3, 18, 'tiktok', 'POSTED'], [-1, 12, 'instagram', 'POSTED'], [0, 19, 'tiktok', 'PLANNED'], [1, 9, 'youtube', 'PLANNED'],
    [2, 17, 'x', 'PLANNED'], [4, 20, 'instagram', 'PLANNED'], [6, 13, 'linkedin', 'PLANNED'], [9, 18, 'tiktok', 'PLANNED'], [12, 11, 'youtube', 'PLANNED'],
  ];
  posts = plan.map(([d, h, platform, status], i) => {
    const c = src.clips[i % src.clips.length]!;
    return { id: `p${i}`, platform, status, scheduledAt: day(d, h), caption: `${c.description ?? ''} ${c.hashtags ?? ''}`.trim(), clip: { id: c.id, jobId: src.id, index: c.index, title: c.title ?? `Clip ${c.index}`, duration: c.duration, width: c.width, height: c.height, thumbUrl: c.thumbUrl, downloadUrl: '' } };
  });
}

export async function demoApi<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  await sleep(180);
  const method = options.method ?? (options.body ? 'POST' : 'GET');
  const body = (options.body ?? {}) as Record<string, unknown>;
  const [route, query = ''] = path.split('?');
  const q = new URLSearchParams(query);
  const out = (v: unknown) => v as T;

  if (route === '/config') return out({ appName: 'Cliper Agent', allowSignup: true, limits: { maxSourceMinutes: 180, maxClipsPerJob: 50, maxUploadMb: 2048 }, discover: 'youtube-trending', ai: true } satisfies AppConfig);
  if (route === '/auth/login' || route === '/auth/register') return out({ token: 'demo-token', user });
  if (route === '/auth/me') return out({ user: { ...user, name: (body.name as string) ?? user.name } });
  if (route === '/auth/change-password') return out({ token: 'demo-token', user });
  if (route === '/system') return out({ tools: { 'yt-dlp': { ok: true, version: '2026.11.01' }, ffmpeg: { ok: true, version: '7.1' }, ffprobe: { ok: true, version: '7.1' } }, queue: { running: running.size, concurrency: 2 }, ai: { enabled: true } });
  if (route === '/ai/status') return out({ enabled: true, ok: true, provider: 'OpusClip', templates: [{ id: 'preset-1', name: 'Karaoke pop', isDefault: true }, { id: 'preset-2', name: 'Clean minimal', isDefault: false }] } satisfies AiStatus);
  if (route === '/discover/categories') return out({ categories: [{ id: 'all', label: 'All' }, { id: 'music', label: 'Music' }, { id: 'gaming', label: 'Gaming' }, { id: 'sports', label: 'Sports' }, { id: 'news', label: 'News' }, { id: 'tech', label: 'Tech' }], mode: 'youtube-trending', region: 'US' });
  if (route === '/discover') return out({ items: q.get('q') ? TRENDING.slice(2, 6) : TRENDING });
  if (route === '/source/inspect') {
    const url = String(body.url ?? '');
    if (!/^https?:\/\//.test(url)) throw new ApiError(422, 'That does not look like a video link');
    return out({ source: { title: 'How I built a $10M company from my bedroom | Full Podcast', uploader: 'Creator Studio', duration: 1834, thumbnail: thumb(4, 320, 180), webpageUrl: url, site: 'YouTube', isLive: false, viewCount: 1_840_000, url } satisfies SourceMeta, warnings: [], canClip: true });
  }
  if (route === '/admin/users') return out({ users: [{ ...user, active: true, jobs: jobs.length, clips: stats().clips }, { id: 'u2', email: 'editor@cliper.app', name: 'Sam Editor', role: 'USER', createdAt: iso(4 * 86400_000), active: true, jobs: 12, clips: 87 }, { id: 'u3', email: 'intern@cliper.app', name: 'Alex Intern', role: 'USER', createdAt: iso(9 * 86400_000), active: false, jobs: 2, clips: 9 }] satisfies AdminUser[] });
  if (route === '/admin/stats') return out({ users: 3, jobs: jobs.length + 14, clips: stats().clips + 96, bytes: 7.4e9, failed: 1, running: running.size });
  if (route?.startsWith('/admin/users/')) return out({ user: { ...user, ...body } });

  if (route === '/jobs' && method === 'GET') {
    jobs.forEach(advance);
    const f = q.get('status') ?? 'all';
    const list = jobs.filter((j) => f === 'all' || (f === 'done' ? j.status === 'DONE' : f === 'failed' ? ['FAILED', 'CANCELLED'].includes(j.status) : !['DONE', 'FAILED', 'CANCELLED'].includes(j.status)));
    return out({ jobs: list, stats: stats() });
  }
  if (route === '/jobs' && method === 'POST') {
    const o = body.options as ClipOptions;
    const j = base(`d${Date.now()}`, (body.title as string) || 'New video', o, { status: 'QUEUED', progress: 0, stage: 'Waiting in line', createdAt: new Date().toISOString(), finishedAt: null });
    jobs = [j, ...jobs];
    running.set(j.id, Date.now());
    return out({ job: j });
  }
  if (route === '/brand-kits' && method === 'GET') return out({ kits });
  if (route === '/brand-kits' && method === 'POST') {
    const k: BrandKit = { id: `k${Date.now()}`, primaryColor: '#C8FF2E', secondaryColor: '#9B6BFF', logoUrl: null, logoPosition: 'top-right', logoSize: 14, logoOpacity: 0.9, createdAt: new Date().toISOString(), ...(body as Partial<BrandKit>), name: String(body.name ?? 'Brand kit'), isDefault: !kits.length || !!body.isDefault };
    if (k.isDefault) kits = kits.map((x) => ({ ...x, isDefault: false }));
    kits = [...kits, k];
    return out({ kit: k });
  }
  const km = route?.match(/^\/brand-kits\/([^/]+)(\/logo)?$/);
  if (km) {
    const k = kits.find((x) => x.id === km[1]);
    if (!k) throw new ApiError(404, 'Brand kit not found');
    if (km[2]) Object.assign(k, { logoUrl: method === 'DELETE' ? null : LOGO });
    else if (method === 'DELETE') return (kits = kits.filter((x) => x !== k)), out({});
    else {
      if (body.isDefault) kits.forEach((x) => (x.isDefault = false));
      Object.assign(k, body);
    }
    return out({ kit: k });
  }
  if (route === '/posts' && method === 'GET') {
    seedPosts();
    const from = q.get('from') ? new Date(q.get('from')!).getTime() : -Infinity;
    const to = q.get('to') ? new Date(q.get('to')!).getTime() : Infinity;
    return out({ posts: posts.filter((p) => +new Date(p.scheduledAt) >= from && +new Date(p.scheduledAt) < to).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)) });
  }
  if (route === '/posts' && method === 'POST') {
    seedPosts();
    const j = jobs.find((x) => x.clips.some((c) => c.id === body.clipId));
    const c = j?.clips.find((x) => x.id === body.clipId);
    if (!j || !c) throw new ApiError(404, 'Clip not found');
    const p: ScheduledPost = { id: `p${Date.now()}`, platform: body.platform as ScheduledPost['platform'], caption: String(body.caption ?? ''), scheduledAt: String(body.scheduledAt), status: 'PLANNED', clip: { id: c.id, jobId: j.id, index: c.index, title: c.title ?? `Clip ${c.index}`, duration: c.duration, width: c.width, height: c.height, thumbUrl: c.thumbUrl, downloadUrl: '' } };
    posts = [...posts, p];
    return out({ post: p });
  }
  const pm = route?.match(/^\/posts\/([^/]+)$/);
  if (pm) {
    const p = posts.find((x) => x.id === pm[1]);
    if (!p) throw new ApiError(404, 'Post not found');
    if (method === 'DELETE') return (posts = posts.filter((x) => x !== p)), out({});
    Object.assign(p, body);
    return out({ post: p });
  }

  const m = route?.match(/^\/jobs\/([^/]+)(?:\/(cancel|retry|reclip|clips\/(.+)))?$/);
  if (m) {
    const j = jobs.find((x) => x.id === m[1]);
    if (!j) throw new ApiError(404, 'Job not found');
    if (m[2] === 'cancel') Object.assign(j, { status: 'CANCELLED', stage: 'Cancelled' }) && running.delete(j.id);
    else if (m[2] === 'retry') Object.assign(j, { status: 'QUEUED', error: null, progress: 0 }) && running.set(j.id, Date.now());
    else if (m[2] === 'reclip') {
      const n = base(`d${Date.now()}`, j.title, (body.options as ClipOptions) ?? j.options, { status: 'QUEUED', progress: 0, createdAt: new Date().toISOString() });
      jobs = [n, ...jobs];
      running.set(n.id, Date.now());
      return out({ job: n });
    } else if (m[3] && method === 'DELETE') {
      j.clips = j.clips.filter((c) => c.id !== m[3]);
      j.clipCount = j.clips.length;
    } else if (method === 'DELETE') {
      jobs = jobs.filter((x) => x.id !== j.id);
      return out({});
    }
    return out({ job: advance(j) });
  }
  throw new ApiError(404, 'Not available in the demo');
}

export async function demoUpload<T>(onProgress: (f: number) => void): Promise<T> {
  for (let i = 1; i <= 10; i++) {
    await sleep(120);
    onProgress(i / 10);
  }
  const j = base(`d${Date.now()}`, 'My upload', { mode: 'split' }, { sourceKind: 'UPLOAD', sourceUrl: null, status: 'QUEUED', progress: 0, createdAt: new Date().toISOString() });
  jobs = [j, ...jobs];
  running.set(j.id, Date.now());
  return { job: j } as T;
}
