import { useId } from 'react';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/** The mark: a lime play triangle cut by a violet → pink slash, on ink. */
export function Logo({ size = 32 }: { size?: number }) {
  const id = `l${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Cliper Agent">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#9B6BFF" />
          <Stop offset="1" stopColor="#FF4FA3" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="64" height="64" rx="18" fill="#111118" />
      <Rect x="0.75" y="0.75" width="62.5" height="62.5" rx="17.25" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
      <Path d="M24 18 L48 32 L24 46 Z" fill="#C8FF2E" />
      <Path d="M14 44 L44 14 L50 20 L20 50 Z" fill={`url(#${id})`} opacity={0.95} />
    </Svg>
  );
}
