import type { TextStyle } from 'react-native';

/** Inter everywhere (loaded in app/_layout.tsx under these names). Tight, heavy display type. */
export const fonts = {
  regular: 'AppSans_400Regular',
  medium: 'AppSans_500Medium',
  semibold: 'AppSans_600SemiBold',
  bold: 'AppSans_700Bold',
  extrabold: 'AppSans_800ExtraBold',
} as const;

export const type = {
  hero: { fontFamily: fonts.extrabold, fontSize: 52, lineHeight: 56, letterSpacing: -2 },
  display: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 36, letterSpacing: -0.9 },
  h1: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  h2: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23, letterSpacing: -0.2 },
  title: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodySm: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19 },
  label: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 16 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase' },
  stat: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 32, letterSpacing: -1 },
  mono: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 16, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;
