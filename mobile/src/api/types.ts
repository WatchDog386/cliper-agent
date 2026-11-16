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
  captions: boolean;
  captionStyle: 'bold' | 'karaoke' | 'minimal';
  hook: 'none' | 'custom' | 'auto';
  hookText?: string;
  credit: boolean;
  normalizeAudio: boolean;
  aiPick: boolean;
  topic?: string;
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
  /** Ready-to-post text written for this clip. */
  title: string | null;
  caption: string | null;
  transcript: string | null;
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
  features: { captions: boolean; ai: boolean; twitch: boolean; youtubeApi: boolean };
}

/* ── Scout and Autopilot ── */

export interface ScoutVideo {
  id: string;
  platform: 'youtube' | 'twitch';
  kind: 'video' | 'clip';
  url: string;
  title: string;
  creator: string;
  creatorUrl: string | null;
  subscribers: number | null;
  views: number;
  publishedAt: string | null;
  duration: number | null;
  thumbnail: string | null;
  score: number;
}

export interface ScoutCreator {
  key: string;
  platform: 'youtube' | 'twitch';
  name: string;
  url: string | null;
  subscribers: number | null;
  views: number;
  videos: number;
  score: number;
}

export interface ScoutResult {
  topic: string;
  videos: ScoutVideo[];
  creators: ScoutCreator[];
  notes: string[];
}

export interface Campaign {
  id: string;
  name: string;
  topic: string;
  sources: ('youtube' | 'twitch')[];
  days: number;
  minViews: number;
  minSubscribers: number;
  maxMinutes: number;
  videosPerRun: number;
  everyHours: number;
  options: ClipOptions;
  autoPublish: AutoPublish | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  lastNote: string | null;
  videosTaken: number;
  recent: { id: string; title: string; creator: string | null; platform: string; views: number | null; score: number | null; url: string; jobId: string | null; at: string }[];
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
