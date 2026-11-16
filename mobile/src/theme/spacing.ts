export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 16, xxl: 24, xxxl: 36 } as const;
export const radius = { sm: 10, md: 14, lg: 18, xl: 26, pill: 999 } as const;

/** Soft, cool-tinted shadows: cards float a little above the light page. */
export const shadow = {
  card: { shadowColor: '#1B2559', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  raised: { shadowColor: '#14281E', shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  glow: { shadowColor: '#087F5B', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  bar: { shadowColor: '#1B2559', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 14 },
} as const;
