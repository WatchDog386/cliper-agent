/**
 * Cliper Agent desktop — design tokens.
 *
 * Mirrors github.com/WatchDog386/Business-SME (Business SME):
 * Safaricom green accent, ink scale, navy sidebar and Inter on desktop.
 * The UI uses Tailwind classes backed by the CSS variables in index.css;
 * these values are kept for inline styles and one-off calculations.
 */

export const colors = {
  brand50: '#EAF7ED',
  brand100: '#CDEDD4',
  brand200: '#9FDCAB',
  brand300: '#6BC97F',
  brand400: '#45B65C',
  brand500: '#34A94B',
  brand600: '#2DA043',
  brand700: '#248537',
  brand800: '#1D6A2C',
  brand900: '#155021',
  brand950: '#0C3214',

  ink50: '#F7F9F8',
  ink100: '#EEF2F0',
  ink200: '#E3E9E6',
  ink300: '#CBD5D0',
  ink400: '#AAB6B0',
  ink500: '#8A9690',
  ink600: '#5E6B65',
  ink700: '#46514C',
  ink800: '#2B3631',
  ink900: '#17201C',
  ink950: '#10251F',

  /* Semantic — light theme */
  page: '#f7f8fa',
  surface: '#ffffff',
  surface2: '#f7f9f8',
  surface3: '#eef2f0',
  field: '#eef2f0',
  edge: '#e3e9e6',
  edgeStrong: '#cbd5d0',
  foreground: '#17201c',
  foregroundMuted: '#5e6b65',
  foregroundDim: '#8a9690',

  accent: '#2DA043',
  accentStrong: '#248537',
  accentSoft: '#EAF7ED',
  accentText: '#1D6A2C',
  success: '#00B140',
  warning: '#D97706',
  danger: '#DC2626',
  info: '#0284C7',

  /* Desktop navy rail */
  navBg: '#0E2135',
  navText: '#E2E8F0',
  navMuted: '#8A9AAE',
  navActive: '#4DA3FF',
} as const;

export const typography = {
  fontSans:
    "'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontDisplay:
    "'Figtree Variable', 'Figtree', 'Inter Variable', system-ui, -apple-system, sans-serif",
  base: '14px',
  small: '13px',
  large: '16px',
  heading: {
    xl: '28px',
    lg: '24px',
    md: '20px',
    sm: '17px',
    xs: '15px',
  },
} as const;

export const radius = {
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  full: '9999px',
} as const;

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  xxl: '2rem',
} as const;

export const shadow = {
  soft: '0 1px 3px 0 rgb(20 40 30 / 0.04), 0 4px 12px -4px rgb(20 40 30 / 0.06)',
  lift: '0 2px 6px -1px rgb(20 40 30 / 0.06), 0 12px 24px -8px rgb(20 40 30 / 0.12)',
  brandGlow: '0 8px 20px -6px rgb(8 127 91 / 0.4), 0 2px 6px -2px rgb(8 127 91 / 0.3)',
} as const;
