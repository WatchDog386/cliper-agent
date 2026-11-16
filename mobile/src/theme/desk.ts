import { isDark } from './colors';

/** Desktop (wide browser) colours: side rail, flat panels with hairline borders, coral actions. */
export const desk = {
  nav: isDark ? '#0B0C0F' : '#FFFFFF',
  navText: isDark ? '#E8EAF0' : '#3A3D4A',
  navTextOn: isDark ? '#FFFFFF' : '#15161A',
  navMuted: '#8D92A1',
  navActive: '#FF4D5E',
  navOn: isDark ? 'rgba(255,77,94,0.14)' : '#FFF0F2',
  navHover: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F9',
  navBorder: isDark ? 'rgba(255,255,255,0.06)' : '#E9EBF2',
  page: isDark ? '#0E0F12' : '#F7F8FC',
  bar: isDark ? '#14151A' : '#FFFFFF',
  panel: isDark ? '#17181D' : '#FFFFFF',
  mini: isDark ? '#22242B' : '#F3F4F7',
  row: isDark ? '#22242B' : '#F1F2F6',
  border: isDark ? '#2A2C33' : '#E7E9F2',
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
