export type Role = 'USER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export type Mode = 'split' | 'highlights' | 'custom';
export type Aspect = 'phone' | 'desktop' | 'square' | 'portrait' | 'original';
export type Fit = 'crop' | 'blur' | 'pad';
export type Focus = 'start' | 'center' | 'end';
export type Quality = '480' | '720' | '1080';

export interface ClipOptions {
  mode: Mode;
  segmentSeconds: number;
  maxClips: number;
  startAt?: number;
  endAt?: number;
  ranges?: { start: number; end: number }[];
  aspect: Aspect;
  fit: Fit;
  focus: Focus;
  quality: Quality;
  fade: boolean;
  mute: boolean;
  speed: number;
}

export type JobStatus = 'QUEUED' | 'FETCHING' | 'ANALYZING' | 'RENDERING' | 'DONE' | 'FAILED' | 'CANCELLED';

export interface Clip {
  id: string;
  index: number;
  startSec: number;
  endSec: number;
  duration: number;
  width: number;
  height: number;
  sizeBytes: number;
  score: number | null;
  videoUrl: string;
  thumbUrl: string | null;
  downloadUrl: string;
}

export interface Job {
  id: string;
  sourceKind: 'URL' | 'UPLOAD';
  sourceUrl: string | null;
  sourceName: string | null;
  title: string;
  uploader: string | null;
  thumbnailUrl: string | null;
  cover: string | null;
  sourceDuration: number | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  options: ClipOptions;
  autoPublish: AutoPublish | null;
  status: JobStatus;
  progress: number;
  stage: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  clipCount: number;
  totalBytes: number;
  zipUrl: string;
  clips: Clip[];
}

export interface SourceMeta {
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  webpageUrl: string;
  site: string;
  isLive: boolean;
  viewCount: number | null;
  url: string;
}

export interface DiscoverItem {
  id: string;
  title: string;
  channel: string | null;
  thumbnail: string | null;
  duration: number | null;
  views: number | null;
  publishedAt: string | null;
  url: string;
}

export interface AppConfig {
  appName: string;
  allowSignup: boolean;
  limits: { maxSourceMinutes: number; maxClipsPerJob: number; maxUploadMb: number };
  discover: 'youtube-trending' | 'search';
  social: Platform[];
}

/* ── Social accounts and posts ── */

export type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK' | 'X' | 'LINKEDIN';
export type Privacy = 'public' | 'unlisted' | 'private';

export interface SocialProvider {
  platform: Platform;
  label: string;
  /** "channel", "page", "account"… */
  noun: string;
  /** The server has this platform's developer-app credentials. */
  configured: boolean;
  envNames: [string, string];
  privacy: Privacy[];
  limits: { title?: number; caption: number; maxSeconds: number };
  /** The address to register in the platform's developer console. */
  redirectUri: string;
}

export interface SocialAccount {
  id: string;
  platform: Platform;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  needsReconnect: boolean;
  connectedAt: string;
}

export type PublicationStatus = 'QUEUED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED';

export interface Publication {
  id: string;
  status: PublicationStatus;
  scheduled: boolean;
  runAt: string;
  title: string;
  caption: string;
  privacy: Privacy;
  progress: number;
  attempts: number;
  error: string | null;
  externalUrl: string | null;
  createdAt: string;
  publishedAt: string | null;
  account: SocialAccount;
  clip: { id: string; index: number; jobId: string; jobTitle: string | null; duration: number; thumbUrl: string | null } | null;
}

/** Post every clip of a job when it finishes. */
export interface AutoPublish {
  accountIds: string[];
  caption: string;
  title?: string;
  privacy: Privacy;
  everyMinutes: number;
}

export const ACTIVE: JobStatus[] = ['QUEUED', 'FETCHING', 'ANALYZING', 'RENDERING'];
