import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, isDark, radius, shadow, space } from '../theme';
import { useDesktop } from '../theme/desktop';
import type { Aspect, JobStatus } from '../api/types';
import { Text } from './Text';

type Icon = keyof typeof Ionicons.glyphMap;

/** A scrolling page: big title, optional actions, content centred at a readable width on desktop. */
export function Screen({
  title,
  subtitle,
  right,
  children,
  refreshing,
  onRefresh,
  wide,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  wide?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const desktop = useDesktop();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgTop }}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + (desktop ? 32 : 16), paddingBottom: insets.bottom + (desktop ? 48 : 120) },
        { maxWidth: wide ? 1240 : 880 },
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.text} /> : undefined}
    >
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="display" style={{ fontSize: desktop ? 30 : 28, fontFamily: fonts.bold }}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" color={colors.textMuted}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const body = <View style={[styles.card, style]}>{children}</View>;
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85, transform: [{ scale: 0.995 }] }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <View style={{ gap: 2, marginBottom: space.sm }}>
      <Text variant="h2" style={{ fontFamily: fonts.bold }}>
        {children}
      </Text>
      {hint ? (
        <Text variant="bodySm" color={colors.textMuted}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** A row of pill choices. */
export function Chips<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string; icon?: Icon }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
            {o.icon ? <Ionicons name={o.icon} size={15} color={on ? colors.onHighlight : colors.textMuted} /> : null}
            <Text variant="label" color={on ? colors.onHighlight : colors.text} fixedColor style={{ fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 14 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Big tappable cards (mode, fit…) with an icon, title and a line of help. */
export function OptionCards<T extends string>({ options, value, onChange }: { options: { value: T; label: string; hint: string; icon: Icon }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.optionGrid}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.option, on && styles.optionOn]}>
            <View style={[styles.optionIcon, on && { backgroundColor: colors.brand }]}>
              <Ionicons name={o.icon} size={18} color={on ? '#FFFFFF' : colors.text} />
            </View>
            <Text variant="title" style={{ fontFamily: fonts.semibold }}>
              {o.label}
            </Text>
            <Text variant="label" color={colors.textMuted}>
              {o.hint}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const FRAME: Record<Aspect, { w: number; h: number; label: string; hint: string }> = {
  phone: { w: 27, h: 48, label: 'Phone', hint: '9:16 · TikTok, Reels, Shorts' },
  desktop: { w: 56, h: 32, label: 'Desktop', hint: '16:9 · YouTube, web' },
  square: { w: 40, h: 40, label: 'Square', hint: '1:1 · feeds' },
  portrait: { w: 36, h: 45, label: 'Portrait', hint: '4:5 · Instagram feed' },
  original: { w: 44, h: 36, label: 'Original', hint: 'Keep the source shape' },
};

/** Phone / desktop / square … with a drawn frame of each shape. */
export function AspectPicker({ value, onChange }: { value: Aspect; onChange: (a: Aspect) => void }) {
  return (
    <View style={styles.optionGrid}>
      {(Object.keys(FRAME) as Aspect[]).map((a) => {
        const f = FRAME[a];
        const on = a === value;
        return (
          <Pressable key={a} onPress={() => onChange(a)} accessibilityRole="radio" accessibilityLabel={`${f.label} view`} accessibilityState={{ selected: on }} style={[styles.option, styles.aspect, on && styles.optionOn]}>
            <View style={styles.frameBox}>
              <View style={[styles.frame, { width: f.w, height: f.h }, on && { borderColor: colors.brand, backgroundColor: colors.brandSoft }, a === 'original' && { borderStyle: 'dashed' }]} />
            </View>
            <Text variant="title" style={{ fontFamily: fonts.semibold }}>
              {f.label}
            </Text>
            <Text variant="label" color={colors.textMuted} align="center">
              {f.hint}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleRow({ icon, label, hint, value, onChange }: { icon: Icon; label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.toggle} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View style={styles.optionIcon}>
        <Ionicons name={icon} size={18} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="title">{label}</Text>
        {hint ? (
          <Text variant="label" color={colors.textMuted}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.brand, false: colors.surfaceHigh }} thumbColor="#FFFFFF" />
    </Pressable>
  );
}

export function ProgressBar({ value, color = colors.brand }: { value: number; color?: string }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.max(2, Math.min(100, value))}%`, backgroundColor: color }]} />
    </View>
  );
}

const STATUS: Record<JobStatus, { label: string; color: string; bg: string; icon: Icon }> = {
  QUEUED: { label: 'Waiting', color: colors.textMuted, bg: colors.surfaceAlt, icon: 'time-outline' },
  FETCHING: { label: 'Downloading', color: colors.info, bg: colors.infoSoft, icon: 'cloud-download-outline' },
  ANALYZING: { label: 'Analysing', color: colors.accent, bg: colors.accentSoft, icon: 'pulse-outline' },
  RENDERING: { label: 'Clipping', color: colors.brand, bg: colors.brandSoft, icon: 'cut-outline' },
  DONE: { label: 'Ready', color: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' },
  FAILED: { label: 'Failed', color: colors.danger, bg: colors.dangerSoft, icon: 'alert-circle' },
  CANCELLED: { label: 'Cancelled', color: colors.textMuted, bg: colors.surfaceAlt, icon: 'close-circle-outline' },
};

export function StatusPill({ status }: { status: JobStatus }) {
  const s = STATUS[status];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Ionicons name={s.icon} size={13} color={s.color} />
      <Text variant="label" color={s.color} fixedColor style={{ fontFamily: fonts.semibold, fontSize: 12 }}>
        {s.label}
      </Text>
    </View>
  );
}

export function Empty({ icon, title, hint, action }: { icon: Icon; title: string; hint?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={[styles.optionIcon, { width: 56, height: 56, borderRadius: 28 }]}>
        <Ionicons name={icon} size={26} color={colors.textMuted} />
      </View>
      <Text variant="h2" align="center">
        {title}
      </Text>
      {hint ? (
        <Text variant="body" color={colors.textMuted} align="center">
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

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'danger' | 'warning'; children: ReactNode }) {
  const c = tone === 'danger' ? [colors.dangerSoft, colors.danger] : tone === 'warning' ? [colors.warningSoft, colors.warning] : [colors.infoSoft, colors.info];
  return (
    <View style={[styles.notice, { backgroundColor: c[0] }]}>
      <Ionicons name={tone === 'info' ? 'information-circle' : 'alert-circle'} size={18} color={c[1]} />
      <Text variant="bodySm" color={colors.text} style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', alignSelf: 'center', paddingHorizontal: space.lg, gap: space.xl },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  card: { backgroundColor: colors.glass, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.glassBorder, padding: space.lg + 2, gap: space.md, ...(isDark ? {} : shadow.card) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  chipOn: { backgroundColor: colors.highlight, borderColor: colors.highlight },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: {
    flexGrow: 1,
    flexBasis: 150,
    gap: 4,
    padding: space.md + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  optionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh, marginBottom: 4 },
  aspect: { alignItems: 'center', flexBasis: 120 },
  frameBox: { height: 56, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  frame: { borderWidth: 2, borderColor: colors.textDim, borderRadius: 6 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 24, borderRadius: 12, alignSelf: 'flex-start' },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: 48, paddingHorizontal: space.xl },
  notice: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, alignItems: 'flex-start' },
});
