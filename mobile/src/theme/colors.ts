/**
 * Cliper Agent — the template's "glass" look: soft page, frosted cards with hairline edges, ink actions,
 * a bright highlight for active states. Rebranded with a coral "record" accent. Dark by default (video
 * looks best on dark); Light can be chosen in Settings.
 */
const light = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F1F5',
  surfaceHigh: '#E6E8EF',
  border: '#E6E8EF',
  borderStrong: '#CDD1DC',

  primary: '#15161A',
  primaryPressed: '#000000',
  onPrimary: '#FFFFFF',
  primarySoft: 'rgba(21,22,26,0.06)',

  highlight: '#ECF23A',
  onHighlight: '#15161A',

  glass: '#FFFFFF',
  glassStrong: '#FFFFFF',
  glassBorder: 'rgba(15,23,42,0.07)',
  hatch: 'rgba(21,22,26,0.13)',
  bgTop: '#F6F7FB',
  bgBottom: '#F6F7FB',

  /** Coral "record" accent */
  brand: '#FF4D5E',
  onBrand: '#FFFFFF',
  brandSoft: '#FFE8EB',
  accent: '#6D5BFF',
  accentSoft: '#ECE9FF',

  text: '#15161A',
  textMuted: '#5D6170',
  textDim: '#8D92A1',

  success: '#16A34A',
  successSoft: '#DCFCE7',
  warning: '#D97706',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#0284C7',
  infoSoft: '#E0F2FE',

  hero: '#16171C',
  onHero: '#FFFFFF',
  onHeroMuted: 'rgba(255,255,255,0.72)',
  onHeroDim: 'rgba(255,255,255,0.5)',
  heroInset: 'rgba(255,255,255,0.14)',
  heroBorder: 'rgba(255,255,255,0.12)',

  overlay: 'rgba(8,9,12,0.7)',
  scrim: 'rgba(0,0,0,0.45)',
  white: '#FFFFFF',
  black: '#000000',
};

const dark: typeof light = {
  ...light,
  bg: '#0E0F12',
  surface: '#17181D',
  surfaceAlt: '#22242B',
  surfaceHigh: '#2C2F37',
  border: 'rgba(255,255,255,0.10)',
  borderStrong: 'rgba(255,255,255,0.22)',

  primary: '#FFFFFF',
  primaryPressed: '#E5E5E5',
  onPrimary: '#0E0F12',
  primarySoft: 'rgba(255,255,255,0.08)',

  highlight: '#E6F03A',
  onHighlight: '#0E0F12',

  glass: '#17181D',
  glassStrong: '#1B1D23',
  glassBorder: 'rgba(255,255,255,0.07)',
  hatch: 'rgba(255,255,255,0.12)',
  bgTop: '#0E0F12',
  bgBottom: '#0E0F12',

  brandSoft: 'rgba(255,77,94,0.16)',
  accentSoft: 'rgba(109,91,255,0.2)',

  text: '#F4F5F7',
  textMuted: 'rgba(244,245,247,0.7)',
  textDim: 'rgba(244,245,247,0.45)',

  successSoft: 'rgba(22,163,74,0.2)',
  warningSoft: 'rgba(217,119,6,0.22)',
  dangerSoft: 'rgba(220,38,38,0.22)',
  infoSoft: 'rgba(2,132,199,0.22)',

  hero: '#1D1F26',
  overlay: 'rgba(0,0,0,0.75)',
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

export const colors: typeof light = isDark ? dark : light;

export const gradients = {
  hero: (isDark ? ['#2A1C3F', '#14151A'] : ['#2C2D33', '#15161A']) as readonly [string, string],
  brand: ['#FF6B5E', '#FF3D7F'] as const,
  accent: ['#8B7BFF', '#5B47F5'] as const,
};
