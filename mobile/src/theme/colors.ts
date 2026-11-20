/**
 * Cliper Agent "Neon Studio": near-black canvas, layered graphite surfaces with hairline edges, an
 * electric-lime action colour and a violet → pink glow for AI. Modelled on the best short-form
 * clipping studios: content first, dark so video pops, one loud colour for the thing to press.
 * Dark by default; Light can be chosen in Settings (web).
 */
const dark = {
  bg: '#07070A',
  bgTop: '#07070A',
  bgBottom: '#07070A',
  surface: '#0F0F14',
  surfaceAlt: '#16161D',
  surfaceHigh: '#20202A',
  glass: 'rgba(22,22,29,0.72)',
  glassStrong: 'rgba(18,18,24,0.92)',
  glassBorder: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',

  /** The one action colour: electric lime with ink text. */
  highlight: '#C8FF2E',
  highlightPressed: '#B4EB1A',
  onHighlight: '#0A0B05',

  primary: '#FFFFFF',
  onPrimary: '#07070A',

  /** AI / brand: violet into pink. */
  brand: '#9B6BFF',
  brandSoft: 'rgba(155,107,255,0.16)',
  onBrand: '#FFFFFF',
  accent: '#FF4FA3',
  accentSoft: 'rgba(255,79,163,0.16)',
  cyan: '#38E1FF',

  text: '#F5F5F7',
  textMuted: 'rgba(245,245,247,0.66)',
  textDim: 'rgba(245,245,247,0.40)',

  success: '#3EE08F',
  successSoft: 'rgba(62,224,143,0.14)',
  warning: '#FFB547',
  warningSoft: 'rgba(255,181,71,0.15)',
  danger: '#FF5A6A',
  dangerSoft: 'rgba(255,90,106,0.15)',
  info: '#5AB8FF',
  infoSoft: 'rgba(90,184,255,0.15)',

  hero: '#121219',
  onHero: '#FFFFFF',
  onHeroMuted: 'rgba(255,255,255,0.72)',
  overlay: 'rgba(0,0,0,0.72)',
  white: '#FFFFFF',
  black: '#000000',
};

const light: typeof dark = {
  ...dark,
  bg: '#F6F6F9',
  bgTop: '#F6F6F9',
  bgBottom: '#F6F6F9',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F0F5',
  surfaceHigh: '#E5E5EE',
  glass: 'rgba(255,255,255,0.86)',
  glassStrong: '#FFFFFF',
  glassBorder: 'rgba(12,12,30,0.08)',
  border: 'rgba(12,12,30,0.08)',
  borderStrong: 'rgba(12,12,30,0.16)',
  highlight: '#0A0A0F',
  highlightPressed: '#000000',
  onHighlight: '#C8FF2E',
  primary: '#0A0A0F',
  onPrimary: '#FFFFFF',
  brand: '#7C4DFF',
  brandSoft: 'rgba(124,77,255,0.10)',
  accentSoft: 'rgba(255,79,163,0.10)',
  text: '#0B0B12',
  textMuted: 'rgba(11,11,18,0.62)',
  textDim: 'rgba(11,11,18,0.40)',
  success: '#12A15E',
  successSoft: 'rgba(18,161,94,0.10)',
  warning: '#C77700',
  danger: '#E5334B',
  dangerSoft: 'rgba(229,51,75,0.10)',
  info: '#1F7FD1',
  hero: '#0E0E14',
};

export type ThemeMode = 'light' | 'dark';
const THEME_KEY = 'cliper.theme';

/** The look chosen on this device (dark unless Light was chosen). Read once, before any screen draws. */
export const themeMode: ThemeMode = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
})();
export const isDark = themeMode === 'dark';

/** Switches light/dark. Styles are built from these colours when the app loads, so the web app reloads. */
export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* private mode */
  }
  if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') window.location.reload();
}

export const colors: typeof dark = isDark ? dark : light;

export const gradients = {
  /** AI / brand glow. */
  brand: ['#9B6BFF', '#FF4FA3'] as const,
  brand3: ['#38E1FF', '#9B6BFF', '#FF4FA3'] as const,
  lime: ['#E4FF7A', '#C8FF2E'] as const,
  hero: (isDark ? ['#16121F', '#0B0B10'] : ['#1A1526', '#0E0E14']) as readonly [string, string],
  /** Over thumbnails, so white text stays readable. */
  scrim: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.82)'] as const,
};
