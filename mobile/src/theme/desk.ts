import { isDark } from './colors';

/** Desktop (wide browser) colours: side rail, flat panels with hairline borders, coral actions. */
export const desk = {
  nav: isDark ? '#0B0C0F' : '#14151A',
  navText: '#E8EAF0',
  navMuted: '#8D92A1',
  navActive: '#FF4D5E',
  navHover: 'rgba(255,255,255,0.06)',
  page: isDark ? '#0E0F12' : '#F6F7FB',
  bar: isDark ? '#14151A' : '#FFFFFF',
  panel: isDark ? '#17181D' : '#FFFFFF',
  mini: isDark ? '#22242B' : '#F3F4F7',
  row: isDark ? '#22242B' : '#F1F2F6',
  border: isDark ? '#2A2C33' : '#E5E7EB',
  ink: isDark ? '#F4F5F7' : '#15161A',
  strong: isDark ? '#FFFFFF' : '#0B0C0F',
  muted: isDark ? '#A0A4B0' : '#6B7280',
  /** The main action (buttons). */
  green: '#FF4D5E',
  greenHover: '#E83E50',
  /** Links, tabs and highlights. */
  teal: '#FF4D5E',
  tealSoft: isDark ? 'rgba(255,77,94,0.14)' : '#FFE8EB',
  red: '#DC2626',
};
