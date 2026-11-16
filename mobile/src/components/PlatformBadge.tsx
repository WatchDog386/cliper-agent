import { Image, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Platform, SocialAccount } from '../api/types';
import { colors, isDark } from '../theme';
import { PLATFORM } from '../social/platforms';

/** A platform's logo on its own tinted disc. */
export function PlatformIcon({ platform, size = 36 }: { platform: Platform; size?: number }) {
  const p = PLATFORM[platform];
  // Black logos (TikTok, X) would vanish on the dark theme
  const tint = isDark && p.color === '#111111' ? '#FFFFFF' : p.color;
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: isDark && p.color === '#111111' ? 'rgba(255,255,255,0.12)' : p.soft }]}>
      <Ionicons name={p.icon} size={size * 0.5} color={tint} />
    </View>
  );
}

/** The account's picture with the platform's logo in the corner. */
export function AccountAvatar({ account, size = 40 }: { account: Pick<SocialAccount, 'platform' | 'avatarUrl'>; size?: number }) {
  if (!account.avatarUrl) return <PlatformIcon platform={account.platform} size={size} />;
  const p = PLATFORM[account.platform];
  const dot = Math.round(size * 0.46);
  return (
    <View style={{ width: size, height: size }}>
      <Image source={{ uri: account.avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt }} />
      <View style={[styles.corner, { width: dot, height: dot, borderRadius: dot / 2 }]}>
        <Ionicons name={p.icon} size={dot * 0.62} color={p.color} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', right: -3, bottom: -3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.glassBorder },
});
