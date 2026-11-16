import type Ionicons from '@expo/vector-icons/Ionicons';
import type { Platform } from '../api/types';

type Icon = keyof typeof Ionicons.glyphMap;

/** How each platform is drawn: its logo, its own colour, and what a post there is called. */
export const PLATFORM: Record<Platform, { label: string; icon: Icon; color: string; soft: string; post: string }> = {
  YOUTUBE: { label: 'YouTube', icon: 'logo-youtube', color: '#FF0033', soft: 'rgba(255,0,51,0.10)', post: 'Shorts and videos' },
  TIKTOK: { label: 'TikTok', icon: 'logo-tiktok', color: '#111111', soft: 'rgba(17,17,17,0.08)', post: 'Videos' },
  INSTAGRAM: { label: 'Instagram', icon: 'logo-instagram', color: '#D6249F', soft: 'rgba(214,36,159,0.10)', post: 'Reels' },
  FACEBOOK: { label: 'Facebook', icon: 'logo-facebook', color: '#1877F2', soft: 'rgba(24,119,242,0.10)', post: 'Page videos' },
  X: { label: 'X', icon: 'logo-x', color: '#111111', soft: 'rgba(17,17,17,0.08)', post: 'Posts with video' },
  LINKEDIN: { label: 'LinkedIn', icon: 'logo-linkedin', color: '#0A66C2', soft: 'rgba(10,102,194,0.10)', post: 'Profile posts' },
};

export const span = (s: number) => (s < 60 ? `${s} s` : s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : s >= 3600 ? `${s / 3600} h` : `${s / 60} min`);
