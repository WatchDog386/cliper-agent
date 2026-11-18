export interface Clip {
  id: string;
  status: 'pending' | 'processing' | 'ready' | 'error';
  createdAt: string;
  videoId?: string;
  source?: string;
  clips?: { url: string; thumbnail: string; duration: number; shape: 'phone' | 'desktop' | 'square' | 'portrait' | 'original' }[];
  hooks?: string[];
  title?: string;
  caption?: string;
}

export interface Job {
  id: string;
  url: string;
  options: {
    mode: 'split' | 'best' | 'range';
    clipLength: number;
    quality: '480p' | '720p' | '1080p';
    shapes: ('phone' | 'desktop' | 'square' | 'portrait' | 'original')[];
    caption: boolean;
    transcribe: boolean;
    removeSound: boolean;
    speed: number;
  };
  status: 'queued' | 'downloading' | 'analyzing' | 'rendering' | 'ready' | 'error';
  progress: number;
  createdAt: string;
  finishedAt?: string;
  clips?: Clip[];
}

export interface User {
  id: string;
  email: string;
  name?: string;
  isAdmin: boolean;
}