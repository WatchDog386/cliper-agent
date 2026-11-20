export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, xxl: 28, pill: 999 } as const;

export const shadow = {
  card: { shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  raised: { shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 30, shadowOffset: { width: 0, height: 16 }, elevation: 8 },
  /** Lime glow under the main action. */
  glow: { shadowColor: '#C8FF2E', shadowOpacity: 0.35, shadowRadius: 22, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  violet: { shadowColor: '#9B6BFF', shadowOpacity: 0.45, shadowRadius: 26, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  bar: { shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 14 },
} as const;
