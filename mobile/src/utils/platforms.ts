import type Ionicons from '@expo/vector-icons/Ionicons';
import type { Platform } from '../api/types';

/** Social platforms for the calendar: name, icon, colour, and the best clip shape for each. */
export const PLATFORMS: Record<Platform, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; shape: string }> = {
  tiktok: { label: 'TikTok', icon: 'logo-tiktok', color: '#25F4EE', shape: '9:16' },
  instagram: { label: 'Instagram', icon: 'logo-instagram', color: '#E1306C', shape: '9:16 · 4:5' },
  youtube: { label: 'YouTube', icon: 'logo-youtube', color: '#FF3B30', shape: '9:16 Shorts · 16:9' },
  x: { label: 'X', icon: 'logo-twitter', color: '#E7E9EA', shape: '16:9 · 1:1' },
  facebook: { label: 'Facebook', icon: 'logo-facebook', color: '#1877F2', shape: '9:16 · 1:1' },
  linkedin: { label: 'LinkedIn', icon: 'logo-linkedin', color: '#0A66C2', shape: '1:1 · 16:9' },
};
export const PLATFORM_KEYS = Object.keys(PLATFORMS) as Platform[];
