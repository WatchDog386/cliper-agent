import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop, LinearGradient as SvgLinear } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, gradients, isDark, radius, space } from '../theme';
import { useDesktop } from '../theme/desktop';
import { NATIVE, prefersReducedMotion } from '../utils/motion';
import type { Aspect, JobStatus } from '../api/types';
import { Text } from './Text';

type Icon = keyof typeof Ionicons.glyphMap;

/* ─────────────────────────── Ambient glow ─────────────────────────── */

/** A soft radial light (drawn with SVG, so it costs nothing while scrolling). */
export function Glow({ color = colors.brand, size = 520, opacity = 0.22, style }: { color?: string; size?: number; opacity?: number; style?: StyleProp<ViewStyle> }) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={isDark ? opacity : opacity * 0.6} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Two glows behind the top of a page. */
export function Backdrop() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Glow color={colors.brand} size={720} opacity={0.2} style={{ top: -360, left: -200 }} />
      <Glow color={colors.accent} size={560} opacity={0.12} style={{ top: -300, right: -180 }} />
    </View>
  );
}

/* ─────────────────────────── Page ─────────────────────────── */

/** A scrolling page: eyebrow, big title, optional actions; content centred at a readable width. */
export function Screen({
  title,
  subtitle,
  eyebrow,
  right,
  children,
  refreshing,
  onRefresh,
  wide,
  hideHeader,
}: {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  right?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  wide?: boolean;
  hideHeader?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const desktop = useDesktop();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.page,
          { paddingTop: insets.top + (desktop ? 36 : 18), paddingBottom: insets.bottom + (desktop ? 56 : 120), paddingHorizontal: desktop ? 40 : space.lg },
          { maxWidth: wide ? 1320 : 960 },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.text} /> : undefined}
      >
        {!hideHeader && title ? (
          <View style={[styles.head, !desktop && { alignItems: 'flex-start' }]}>
            <View style={{ flex: 1, gap: 6 }}>
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <Text variant="display" style={{ fontSize: desktop ? 34 : 26, lineHeight: desktop ? 40 : 32 }} numberOfLines={3}>
                {title}
              </Text>
              {subtitle ? (
                <Text variant="body" color={colors.textMuted}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {right ? <View style={styles.headRight}>{right}</View> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </View>
  );
}

/** Small uppercase label with a sparkle, above headings. */
export function Eyebrow({ children, icon = 'sparkles', color = colors.brand }: { children: ReactNode; icon?: Icon; color?: string }) {
  return (
    <View style={styles.eyebrow}>
      <Ionicons name={icon} size={12} color={color} />
      <Text variant="overline" color={color}>
        {children}
      </Text>
    </View>
  );
}

/* ─────────────────────────── Surfaces ─────────────────────────── */

export function Card({ children, style, onPress, glow, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; glow?: boolean; padded?: boolean }) {
  const inner = (
    <>
      {glow ? <LinearGradient colors={[colors.brandSoft, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.8 }} style={StyleSheet.absoluteFill} /> : null}
      {children}
    </>
  );
  if (!onPress) return <View style={[styles.card, padded && styles.cardPad, glow && styles.cardGlow, style]}>{inner}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={(s) => [
        styles.card,
        padded && styles.cardPad,
        glow && styles.cardGlow,
        (s as { hovered?: boolean }).hovered && styles.cardHover,
        s.pressed && { transform: [{ scale: 0.99 }] },
        style,
      ]}
    >
      {inner}
    </Pressable>
  );
}

export function SectionTitle({ children, hint, right, step }: { children: ReactNode; hint?: string; right?: ReactNode; step?: number }) {
  return (
    <View style={styles.sectionRow}>
      {step ? (
        <View style={styles.step}>
          <Text variant="label" color={colors.text} style={{ fontFamily: fonts.bold }}>
            {step}
          </Text>
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="h2">{children}</Text>
        {hint ? (
          <Text variant="bodySm" color={colors.textMuted}>
            {hint}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginVertical: space.xs }} />;
}

/* ─────────────────────────── Choices ─────────────────────────── */

/** A row of pill choices. */
export function Chips<T extends string | number>({ options, value, onChange, size = 'md' }: { options: { value: T; label: string; icon?: Icon }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={(s) => [styles.chip, size === 'sm' && { height: 32, paddingHorizontal: 12 }, on && styles.chipOn, !on && (s as { hovered?: boolean }).hovered && { borderColor: colors.borderStrong }]}
          >
            {o.icon ? <Ionicons name={o.icon} size={14} color={on ? colors.onHighlight : colors.textMuted} /> : null}
            <Text variant="label" color={on ? colors.onHighlight : colors.text} style={{ fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 13.5 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Big tappable cards (mode, fit…) with an icon, title, help line and an optional badge. */
export function OptionCards<T extends string>({
  options,
  value,
  onChange,
  min = 160,
}: {
  options: { value: T; label: string; hint: string; icon: Icon; badge?: string; ai?: boolean; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  min?: number;
}) {
  return (
    <View style={styles.optionGrid}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => !o.disabled && onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: o.disabled }}
            style={(s) => [styles.option, { flexBasis: min }, on && (o.ai ? styles.optionAi : styles.optionOn), !on && (s as { hovered?: boolean }).hovered && { borderColor: colors.borderStrong }, o.disabled && { opacity: 0.45 }]}
          >
            {on && o.ai ? <LinearGradient colors={['rgba(155,107,255,0.22)', 'rgba(255,79,163,0.08)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
            <View style={styles.optionTop}>
              {o.ai ? (
                <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.optionIcon}>
                  <Ionicons name={o.icon} size={17} color="#FFFFFF" />
                </LinearGradient>
              ) : (
                <View style={[styles.optionIcon, on && { backgroundColor: colors.highlight }]}>
                  <Ionicons name={o.icon} size={17} color={on ? colors.onHighlight : colors.text} />
                </View>
              )}
              {o.badge ? <Badge tone={o.ai ? 'ai' : 'neutral'}>{o.badge}</Badge> : null}
              <View style={{ flex: 1 }} />
              <View style={[styles.radio, on && { borderColor: o.ai ? colors.brand : colors.highlight }]}>{on ? <View style={[styles.radioDot, { backgroundColor: o.ai ? colors.brand : colors.highlight }]} /> : null}</View>
            </View>
            <Text variant="title">{o.label}</Text>
            <Text variant="label" color={colors.textMuted} style={{ fontFamily: fonts.regular, lineHeight: 17 }}>
              {o.hint}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const FRAME: Record<Aspect, { w: number; h: number; label: string; hint: string }> = {
  phone: { w: 24, h: 42, label: '9:16', hint: 'TikTok · Reels · Shorts' },
  desktop: { w: 50, h: 28, label: '16:9', hint: 'YouTube · web' },
  square: { w: 36, h: 36, label: '1:1', hint: 'Feeds' },
  portrait: { w: 32, h: 40, label: '4:5', hint: 'Instagram feed' },
  original: { w: 42, h: 32, label: 'Original', hint: 'Source shape' },
};

/** Phone / desktop / square … with a drawn frame of each shape. */
export function AspectPicker({ value, onChange }: { value: Aspect; onChange: (a: Aspect) => void }) {
  return (
    <View style={styles.optionGrid}>
      {(Object.keys(FRAME) as Aspect[]).map((a) => {
        const f = FRAME[a];
        const on = a === value;
        return (
          <Pressable
            key={a}
            onPress={() => onChange(a)}
            accessibilityRole="radio"
            accessibilityLabel={`${f.label} view`}
            accessibilityState={{ selected: on }}
            style={(s) => [styles.option, styles.aspect, on && styles.optionOn, !on && (s as { hovered?: boolean }).hovered && { borderColor: colors.borderStrong }]}
          >
            <View style={styles.frameBox}>
              <View style={[styles.frame, { width: f.w, height: f.h }, on && { borderColor: colors.highlight, backgroundColor: 'rgba(200,255,46,0.12)' }, a === 'original' && { borderStyle: 'dashed' }]} />
            </View>
            <Text variant="title">{f.label}</Text>
            <Text variant="label" color={colors.textMuted} align="center" style={{ fontFamily: fonts.regular }}>
              {f.hint}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A row with a custom switch (looks the same on web, iOS and Android). */
export function ToggleRow({ icon, label, hint, value, onChange }: { icon: Icon; label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.toggle} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }}>
      <View style={styles.optionIcon}>
        <Ionicons name={icon} size={17} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="title">{label}</Text>
        {hint ? (
          <Text variant="label" color={colors.textMuted} style={{ fontFamily: fonts.regular }}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch value={value} />
    </Pressable>
  );
}

export function Switch({ value }: { value: boolean }) {
  const x = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: value ? 1 : 0, duration: prefersReducedMotion() ? 0 : 160, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, [value, x]);
  return (
    <View style={[styles.switch, value && { backgroundColor: colors.highlight, borderColor: colors.highlight }]}>
      <Animated.View style={[styles.knob, value && { backgroundColor: colors.onHighlight }, { transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }] }]} />
    </View>
  );
}

/* ─────────────────────────── Status ─────────────────────────── */

/** Gradient progress bar; the fill eases to its new width. */
export function ProgressBar({ value, tone = 'lime', height = 8 }: { value: number; tone?: 'lime' | 'ai'; height?: number }) {
  const w = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: Math.max(2, Math.min(100, value)), duration: prefersReducedMotion() ? 0 : 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, w]);
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <Animated.View style={{ height: '100%', width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }), borderRadius: height / 2, overflow: 'hidden' }}>
        <LinearGradient colors={tone === 'ai' ? gradients.brand3 : gradients.lime} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

const STATUS: Record<JobStatus, { label: string; color: string; bg: string; icon: Icon; live?: boolean }> = {
  QUEUED: { label: 'Queued', color: colors.textMuted, bg: colors.surfaceHigh, icon: 'time-outline', live: true },
  FETCHING: { label: 'Downloading', color: colors.info, bg: colors.infoSoft, icon: 'cloud-download-outline', live: true },
  ANALYZING: { label: 'Analysing', color: colors.brand, bg: colors.brandSoft, icon: 'sparkles', live: true },
  RENDERING: { label: 'Rendering', color: colors.highlight === '#0A0A0F' ? colors.text : colors.highlight, bg: 'rgba(200,255,46,0.12)', icon: 'film-outline', live: true },
  DONE: { label: 'Ready', color: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' },
  FAILED: { label: 'Failed', color: colors.danger, bg: colors.dangerSoft, icon: 'alert-circle' },
  CANCELLED: { label: 'Cancelled', color: colors.textMuted, bg: colors.surfaceHigh, icon: 'close-circle-outline' },
};

function Pulse({ color }: { color: string }) {
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const loop = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 0.25, duration: 700, useNativeDriver: NATIVE }), Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: NATIVE })]));
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, opacity: o }} />;
}

export function StatusPill({ status }: { status: JobStatus }) {
  const s = STATUS[status];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      {s.live ? <Pulse color={s.color} /> : <Ionicons name={s.icon} size={13} color={s.color} />}
      <Text variant="label" color={s.color} style={{ fontFamily: fonts.semibold, fontSize: 12 }}>
        {s.label}
      </Text>
    </View>
  );
}

export function Badge({ children, tone = 'neutral', icon }: { children: ReactNode; tone?: 'neutral' | 'ai' | 'lime' | 'dark'; icon?: Icon }) {
  if (tone === 'ai')
    return (
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.badge}>
        {icon ? <Ionicons name={icon} size={11} color="#FFFFFF" /> : null}
        <Text variant="label" color="#FFFFFF" style={styles.badgeText}>
          {children}
        </Text>
      </LinearGradient>
    );
  const bg = tone === 'lime' ? colors.highlight : tone === 'dark' ? 'rgba(0,0,0,0.62)' : colors.surfaceHigh;
  const fg = tone === 'lime' ? colors.onHighlight : tone === 'dark' ? '#FFFFFF' : colors.textMuted;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={11} color={fg} /> : null}
      <Text variant="label" color={fg} style={styles.badgeText}>
        {children}
      </Text>
    </View>
  );
}

/** A 0–100 score as a gradient ring (the virality score on AI clips). */
export function ScoreRing({ score, size = 54, label = true }: { score: number; size?: number; label?: boolean }) {
  const id = `s${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const stroke = Math.max(3, size / 11);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, score));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`Virality score ${Math.round(v)} out of 100`}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinear id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#C8FF2E" />
            <Stop offset="1" stopColor="#38E1FF" />
          </SvgLinear>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} fill="rgba(0,0,0,0.55)" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#${id})`} strokeWidth={stroke} fill="none" strokeDasharray={`${(c * v) / 100} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      {label ? (
        <Text variant="title" color="#FFFFFF" style={{ fontFamily: fonts.bold, fontSize: size * 0.3, lineHeight: size * 0.36 }}>
          {Math.round(v)}
        </Text>
      ) : null}
    </View>
  );
}

export function Stat({ label, value, icon, tone = 'neutral' }: { label: string; value: string | number; icon: Icon; tone?: 'neutral' | 'lime' | 'ai' }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, tone === 'lime' && { backgroundColor: 'rgba(200,255,46,0.14)' }, tone === 'ai' && { backgroundColor: colors.brandSoft }]}>
        <Ionicons name={icon} size={17} color={tone === 'lime' ? colors.highlight : tone === 'ai' ? colors.brand : colors.text} />
      </View>
      <Text variant="stat">{value}</Text>
      <Text variant="label" color={colors.textMuted}>
        {label}
      </Text>
    </View>
  );
}

export function Empty({ icon, title, hint, action }: { icon: Icon; title: string; hint?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Glow color={colors.brand} size={180} opacity={0.35} style={{ top: -62, left: -62 }} />
        <Ionicons name={icon} size={26} color={colors.text} />
      </View>
      <Text variant="h1" align="center">
        {title}
      </Text>
      {hint ? (
        <Text variant="body" color={colors.textMuted} align="center" style={{ maxWidth: 420 }}>
          {hint}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function Spinner() {
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <ActivityIndicator color={colors.text} />
    </View>
  );
}

/** A shimmering placeholder block while content loads. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const o = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const loop = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 1, duration: 800, useNativeDriver: NATIVE }), Animated.timing(o, { toValue: 0.5, duration: 800, useNativeDriver: NATIVE })]));
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={[{ backgroundColor: colors.surfaceHigh, borderRadius: radius.md, opacity: o }, style]} />;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'danger' | 'warning' | 'success'; children: ReactNode }) {
  const c = tone === 'danger' ? [colors.dangerSoft, colors.danger] : tone === 'warning' ? [colors.warningSoft, colors.warning] : tone === 'success' ? [colors.successSoft, colors.success] : [colors.infoSoft, colors.info];
  return (
    <View style={[styles.notice, { backgroundColor: c[0], borderColor: c[1] + '33' }]}>
      <Ionicons name={tone === 'success' ? 'checkmark-circle' : tone === 'info' ? 'information-circle' : 'alert-circle'} size={18} color={c[1]} />
      <Text variant="bodySm" color={colors.text} style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', alignSelf: 'center', gap: space.xl },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, flexWrap: 'wrap', marginBottom: space.xs },
  headRight: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, gap: space.lg, overflow: 'hidden' },
  cardPad: { padding: space.xl },
  cardGlow: { borderColor: 'rgba(155,107,255,0.30)' },
  cardHover: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceAlt },
  sectionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  step: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.borderStrong },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 15, height: 38, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.highlight, borderColor: colors.highlight },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  option: { flexGrow: 1, gap: 6, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: colors.border, overflow: 'hidden' },
  optionOn: { borderColor: colors.highlight, backgroundColor: isDark ? 'rgba(200,255,46,0.06)' : colors.surface },
  optionAi: { borderColor: colors.brand },
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  optionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  aspect: { alignItems: 'center', flexBasis: 110, gap: 2 },
  frameBox: { height: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  frame: { borderWidth: 2, borderColor: colors.textDim, borderRadius: 5 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 4 },
  switch: { width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.borderStrong },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' },
  track: { backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 24, borderRadius: 12, alignSelf: 'flex-start' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 22, borderRadius: 11, alignSelf: 'flex-start' },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11.5 },
  stat: { flexGrow: 1, flexBasis: 150, gap: 6, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh, marginBottom: 6 },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: 56, paddingHorizontal: space.xl },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.borderStrong, marginBottom: space.sm },
  notice: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, alignItems: 'flex-start', borderWidth: 1 },
});
