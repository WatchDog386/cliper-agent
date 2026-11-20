export type Role = 'USER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export type Mode = 'split' | 'highlights' | 'custom' | 'ai';
export type AiDuration = 'auto' | 'short' | 'medium' | 'long' | 'xl';
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
  /** AI clips (OpusClip) */
  aiModel?: 'ClipBasic' | 'ClipAnything';
  aiDuration?: AiDuration;
  aiPrompt?: string;
  aiTemplateId?: string;
  aiHook?: boolean;
  aiLanguage?: string;
  /** Brand kit whose logo is stamped on the clips (local modes). */
  brandKitId?: string;
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
  /** AI clips: headline, post caption and hashtags. */
  title?: string | null;
  description?: string | null;
  hashtags?: string | null;
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
  engine?: 'local' | 'opusclip';
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
  /** AI clips (OpusClip) are set up on the server. */
  ai?: boolean;
}

export interface AiStatus {
  enabled: boolean;
  ok: boolean;
  provider: string;
  templates: { id: string; name: string; isDefault: boolean }[];
  message?: string;
}

export interface AdminUser extends User {
  active: boolean;
  jobs: number;
  clips: number;
}

export const ACTIVE: JobStatus[] = ['QUEUED', 'FETCHING', 'ANALYZING', 'RENDERING'];

export type LogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface BrandKit {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  logoPosition: LogoPosition;
  logoSize: number;
  logoOpacity: number;
  isDefault: boolean;
  createdAt: string;
}

export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'x' | 'facebook' | 'linkedin';
export type PostStatus = 'PLANNED' | 'POSTED' | 'SKIPPED';

export interface ScheduledPost {
  id: string;
  platform: Platform;
  caption: string;
  scheduledAt: string;
  status: PostStatus;
  clip: { id: string; jobId: string; index: number; title: string; duration: number; width: number; height: number; thumbUrl: string | null; downloadUrl: string };
}
