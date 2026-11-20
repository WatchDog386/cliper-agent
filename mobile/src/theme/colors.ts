/**
 * Cliper Agent - Business SME Mobile Theme
 * Precision-focused layout optimized for touch and smaller screens
 */

const light = {
  bg: '#f8fafc',
  surface: '#ffffff',
  surfaceAlt: '#f1f5f9',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',

  primary: '#1e293b',
  primarySoft: 'rgba(30, 41, 59, 0.08)',
  primaryHover: '#2d3a50',

  secondary: '#3b82f6',
  secondarySoft: 'rgba(59, 130, 246, 0.1)',
  secondaryHover: '#2563eb',

  /* Action colors - precise and touch-friendly */
  success: '#10b981',
  successSoft: 'rgba(16, 185, 129, 0.1)',
  successHover: '#059669',

  warning: '#f59e0b',
  warningSoft: 'rgba(245, 158, 11, 0.1)',
  warningHover: '#d97706',

  error: '#ef4444',
  errorSoft: 'rgba(239, 68, 68, 0.1)',
  errorHover: '#dc2626',

  /* Neutral grays - 1000 to 50 scale */
  gray100: '#f8fafc',
  gray200: '#f1f5f9',
  gray300: '#e2e8f0',
  gray400: '#cbd5e1',
  gray500: '#94a3b8',
  gray600: '#64748b',
  gray700: '#475569',
  gray800: '#1e293b',
  gray900: '#0f172a',

  /* Backgrounds */
  bg: '#f8fafc',
  surface: '#ffffff',
  surfaceAlt: '#f1f5f9',
  card: '#ffffff',
  cardAlt: '#f8fafc',

  /* Borders */
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  inputBorder: '#94a3b8',

  /* Text colors */
  text: '#0f172a',
  textMuted: '#64748b',
  textDim: '#94a3b8',
  textInverted: '#ffffff',

  /* Status colors */
  successBg: '#d1fae5',
  successText: '#065f46',
  warningBg: '#fef3c7',
  warningText: '#92400e',
  errorBg: '#fee2e2',
  errorText: '#991b1b',

  /* Brand */
  brand: '#10b981',
  brandSoft: 'rgba(16, 185, 129, 0.1)',
  brandHover: '#059669',

  /* Highlight */
  highlight: '#fbbf24',
  highlightSoft: 'rgba(251, 191, 36, 0.1)',

  /* White and black */
  white: '#ffffff',
  black: '#0f172a',
} as const;

const dark: typeof light = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceAlt: '#1e293b',
  border: '#475569',
  borderStrong: '#64748b',

  primary: '#f8fafc',
  primarySoft: 'rgba(248, 250, 252, 0.1)',
  primaryHover: '#cbd5e1',

  secondary: '#60a5fa',
  secondarySoft: 'rgba(96, 165, 250, 0.1)',
  secondaryHover: '#93c5fd',

  /* Action colors */
  success: '#34d399',
  successSoft: 'rgba(52, 211, 153, 0.1)',
  successHover: '#10b981',

  warning: '#f87171',
  warningSoft: 'rgba(248, 113, 113, 0.1)',
  warningHover: '#f87171',

  error: '#f87171',
  errorSoft: 'rgba(248, 113, 113, 0.1)',
  errorHover: '#f87171',

  /* Neutral grays */
  gray100: '#f8fafc',
  gray200: '#f1f5f9',
  gray300: '#e2e8f0',
  gray400: '#cbd5e1',
  gray500: '#94a3b8',
  gray600: '#64748b',
  gray700: '#475569',
  gray800: '#1e293b',
  gray900: '#0f172a',

  /* Backgrounds */
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceAlt: '#1e293b',
  card: '#1e293b',
  cardAlt: '#3b4a5c',

  /* Borders */
  border: '#475569',
  borderStrong: '#64748b',
  inputBorder: '#94a3b8',

  /* Text colors */
  text: '#f8fafc',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  textInverted: '#1e293b',

  /* Status colors */
  successBg: '#16a34a1a',
  successText: '#34d399',
  warningBg: '#f973161a',
  warningText: '#f97316',
  errorBg: '#ef44441a',
  errorText: '#f87171',

  /* Brand */
  brand: '#3b82f6',
  brandSoft: 'rgba(59, 130, 246, 0.1)',
  brandHover: '#60a5fa',

  /* Highlight */
  highlight: '#fbbf24',
  highlightSoft: 'rgba(251, 191, 36, 0.1)',

  /* White and black */
  white: '#ffffff',
  black: '#0f172a',
} as const;

export type ThemeMode = 'light' | 'dark';
const THEME_KEY = 'cliper.theme';

/** The look chosen on this device (light unless Dark was chosen). Read once, before any screen draws. */
export const themeMode: ThemeMode = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
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

/* ============= Spacing System (Tight for Mobile) ============= */
export const spacing = {
  /* Tiny - for inner element padding */
  tiny: '0.25rem',
  /* Small - for component margins */
  small: '0.5rem',
  /* Medium - compact card spacing for mobile */
  medium: '0.75rem',
  /* Large - section spacing */
  large: '1rem',
  /* XL - page margins */
  xlarge: '1.5rem',
} as const;

/* ============= Border Radii ============= */
export const radius = {
  none: '0',
  sm: '6px',
  md: '8px',
  lg: '12px',
  full: '9999px',
} as const;

/* ============= Z-Index ============= */
export const zIndex = {
  base: '0',
  card: '1',
  overlay: '10',
  modal: '100',
} as const;

/* ============= Gradients ============= */
export const gradients = {
  hero: (isDark ? ['#0f172b', '#1e293b'] : ['#f8fafc', '#f1f5f9']) as readonly [string, string],
  brand: (isDark ? ['#3b82f6', '#60a5fa'] : ['#10b981', '#059669']) as const,
  accent: (isDark ? ['#93c5fd', '#60a5fa'] : ['#8b5cf6', '#a78bfa']) as const,
};