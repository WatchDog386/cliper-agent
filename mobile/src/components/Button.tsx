import { memo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, gradients, isDark, radius, shadow } from '../theme';
import { Text } from './Text';
import { NATIVE, haptic, prefersReducedMotion, spring } from '../utils/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'ai' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Icon = keyof typeof Ionicons.glyphMap;

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: Icon;
  trailingIcon?: Icon;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  /** Kept for older call sites. */
  caps?: boolean;
  textColor?: string;
}

const PAL: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.highlight, fg: colors.onHighlight, border: colors.highlight },
  ai: { bg: colors.brand, fg: '#FFFFFF', border: 'transparent' },
  secondary: { bg: colors.surfaceHigh, fg: colors.text, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.text, border: 'transparent' },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: 'transparent' },
  outline: { bg: 'transparent', fg: colors.text, border: colors.borderStrong },
};

const H = { sm: 34, md: 44, lg: 54 } as const;

/** Lime "do it" pill, violet→pink AI pill, and quiet graphite secondaries. Springs on press. */
export const Button = memo(function Button({ label, onPress, variant = 'primary', icon, trailingIcon, loading, disabled, size = 'md', style, textColor }: Props) {
  const p = PAL[variant];
  const fg = textColor ?? p.fg;
  const inactive = disabled || loading;
  const scale = useRef(new Animated.Value(1)).current;
  // Animated components ignore Pressable's style-function, so hover is tracked in state
  const [hovered, setHovered] = useState(false);
  const to = (v: number) => {
    if (!prefersReducedMotion()) Animated.spring(scale, { toValue: v, ...spring.press, useNativeDriver: NATIVE }).start();
  };
  const iconSize = size === 'lg' ? 20 : size === 'sm' ? 15 : 18;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => to(0.96)}
      onPressOut={() => to(1)}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      style={[
        styles.base,
        { height: H[size], paddingHorizontal: size === 'lg' ? 26 : size === 'sm' ? 12 : 18, backgroundColor: p.bg, borderColor: p.border },
        variant === 'primary' && isDark && !inactive && shadow.glow,
        variant === 'ai' && !inactive && shadow.violet,
        hovered && !inactive && (variant === 'primary' ? { backgroundColor: colors.highlightPressed } : variant === 'ghost' ? { backgroundColor: colors.surfaceAlt } : { opacity: 0.9 }),
        inactive && { opacity: 0.45 },
        style,
        { transform: [{ scale }] },
      ]}
    >
      {variant === 'ai' ? <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={iconSize} color={fg} /> : null}
          <Text variant="title" color={fg} style={{ fontFamily: fonts.semibold, fontSize: size === 'lg' ? 16 : size === 'sm' ? 13 : 14.5 }} numberOfLines={1}>
            {label}
          </Text>
          {trailingIcon ? <Ionicons name={trailingIcon} size={iconSize} color={fg} /> : null}
        </View>
      )}
    </AnimatedPressable>
  );
});

/** Round icon-only button (back, share, more…). */
export function IconButton({ icon, onPress, label, size = 40, tone = 'default' }: { icon: Icon; onPress?: () => void; label: string; size?: number; tone?: 'default' | 'primary' | 'danger' }) {
  const bg = tone === 'primary' ? colors.highlight : tone === 'danger' ? colors.dangerSoft : colors.surfaceHigh;
  const fg = tone === 'primary' ? colors.onHighlight : tone === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={(s) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderWidth: 1, borderColor: colors.border },
        ((s as { hovered?: boolean }).hovered || s.pressed) && { opacity: 0.82 },
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.45)} color={fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
