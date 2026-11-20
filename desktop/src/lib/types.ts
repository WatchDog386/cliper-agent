export type Mode = 'split' | 'highlights' | 'custom';
export type Aspect = 'phone' | 'desktop' | 'square' | 'portrait' | 'original';
export type Fit = 'crop' | 'blur' | 'pad';
export type Focus = 'start' | 'center' | 'end';
export type Quality = '480' | '720' | '1080';
export type JobStatus =
  | 'QUEUED'
  | 'FETCHING'
  | 'ANALYZING'
  | 'RENDERING'
  | 'DONE'
  | 'FAILED'
  | 'CANCELLED';

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
  layoutTemplate?: 'full' | 'split-screen';
  removeSilence?: boolean;
  aiDetectContent?: string;
  safeZone?: 'none' | 'basic' | 'tight';
  captions?: boolean;
  captionStyle?: 'bold' | 'karaoke' | 'minimal';
  hook?: 'none' | 'custom' | 'auto';
  hookText?: string;
  credit?: boolean;
  normalizeAudio?: boolean;
  aiPick?: boolean;
  topic?: string;
}

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

export interface JobStats {
  total: number;
  active: number;
  done: number;
  clips: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  createdAt?: string;
}

export interface SourceMeta {
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  webpageUrl?: string;
  site: string;
  isLive: boolean;
  viewCount: number | null;
  url: string;
}

export interface AppConfig {
  appName: string;
  allowSignup: boolean;
  limits: { maxSourceMinutes: number; maxClipsPerJob: number; maxUploadMb: number };
  discover: 'youtube-trending' | 'search';
  social?: string[];
  features?: { captions: boolean; ai: boolean; twitch: boolean; youtubeApi: boolean };
}

export interface SocialAccount {
  id: string;
  platform: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  needsReconnect: boolean;
  connectedAt: string;
}

export interface SocialProvider {
  platform: string;
  label: string;
  noun: string;
  configured: boolean;
  envNames?: string[];
  privacy?: string;
  limits?: { title?: number; caption: number; maxSeconds?: number };
  redirectUri?: string;
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

export interface DiscoverCategory {
  id: string;
  label: string;
}

export interface SystemInfo {
  tools: Record<string, { ok: boolean; version: string | null; path: string | null }>;
  queue: { running: number; concurrency: number };
  encoder: { wanted: string; active: string; hardware: boolean; note: string; parallel: number };
  publisher: { running: number; concurrency: number };
}

export interface AuthResult {
  token: string;
  user: User;
}
