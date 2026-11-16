import type { Platform } from '@prisma/client';
import type { Provider } from '../types';
import { facebook } from './facebook';
import { instagram } from './instagram';
import { linkedin } from './linkedin';
import { tiktok } from './tiktok';
import { x } from './x';
import { youtube } from './youtube';

/** Every platform clips can be posted to, in the order the app shows them. */
export const providers: Record<Platform, Provider> = {
  YOUTUBE: youtube,
  TIKTOK: tiktok,
  INSTAGRAM: instagram,
  FACEBOOK: facebook,
  X: x,
  LINKEDIN: linkedin,
};

export const PLATFORMS = Object.keys(providers) as Platform[];

export function providerFor(slug: string): Provider | null {
  const key = slug.toUpperCase() as Platform;
  return Object.hasOwn(providers, key) ? providers[key] : null;
}
