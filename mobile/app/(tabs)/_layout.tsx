import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Redirect, router, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../../src/components/Text';
import { Logo } from '../../src/components/Logo';
import { colors, fonts, gradients, radius, shadow } from '../../src/theme';
import { RAIL_WIDTH, useDesktop } from '../../src/theme/desktop';
import { useAuth } from '../../src/store/auth';
import { api, DEMO } from '../../src/api/client';
import type { AppConfig } from '../../src/api/types';

/** The part of React Navigation's tab-bar props this bar uses. */
interface BottomTabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean }; navigate: (name: string) => void };
}

type Icon = keyof typeof Ionicons.glyphMap;
const TABS: Record<string, { label: string; icon: Icon; iconOn: Icon }> = {
  home: { label: 'Home', icon: 'home-outline', iconOn: 'home' },
  create: { label: 'Create', icon: 'add-circle-outline', iconOn: 'add-circle' },
  library: { label: 'Projects', icon: 'albums-outline', iconOn: 'albums' },
  discover: { label: 'Trending', icon: 'flame-outline', iconOn: 'flame' },
  settings: { label: 'Settings', icon: 'settings-outline', iconOn: 'settings' },
};

function AiCard() {
  const [ai, setAi] = useState<boolean | null>(null);
  useEffect(() => {
    api<AppConfig>('/config').then((c) => setAi(!!c.ai), () => setAi(false));
  }, []);
  return (
    <Pressable onPress={() => router.navigate('/create?mode=ai')} style={styles.aiCard}>
      <LinearGradient colors={['rgba(155,107,255,0.28)', 'rgba(255,79,163,0.12)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="sparkles" size={15} color="#FFFFFF" />
        <Text variant="title" color="#FFFFFF">
          AI clips
        </Text>
        <View style={[styles.dot, { backgroundColor: ai ? colors.success : ai === false ? colors.textDim : colors.warning }]} />
      </View>
      <Text variant="label" color="rgba(255,255,255,0.72)" style={{ fontFamily: fonts.regular, lineHeight: 17 }}>
        {ai ? 'OpusClip engine connected: viral moments, captions & hashtags.' : ai === false ? 'Add an OpusClip key on the server to switch on AI clips.' : 'Checking the AI engine…'}
      </Text>
    </Pressable>
  );
}

/** Phones: a floating glass pill bar. Desktop browsers: a side rail with the brand and AI status. */
function TabBar({ state, navigation, desktop }: BottomTabBarProps & { desktop: boolean }) {
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const go = (name: string, key: string, focused: boolean) => {
    const e = navigation.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!focused && !e.defaultPrevented) navigation.navigate(name);
  };

  if (desktop) {
    return (
      <View style={styles.rail}>
        <View style={styles.brandRow}>
          <Logo size={34} />
          <Text variant="h2" style={{ fontFamily: fonts.extrabold, letterSpacing: -0.4 }}>
            Cliper<Text variant="h2" color={colors.highlight} style={{ fontFamily: fonts.extrabold }}>.</Text>
          </Text>
          {DEMO ? (
            <View style={styles.demo}>
              <Text variant="label" color={colors.onHighlight} style={{ fontFamily: fonts.bold, fontSize: 10 }}>
                DEMO
              </Text>
            </View>
          ) : null}
        </View>
        <Pressable onPress={() => router.navigate('/create')} style={(s) => [styles.newBtn, (s as { hovered?: boolean }).hovered && { backgroundColor: colors.highlightPressed }]}>
          <Ionicons name="add" size={18} color={colors.onHighlight} />
          <Text variant="title" color={colors.onHighlight}>
            New project
          </Text>
        </Pressable>
        <Text variant="overline" color={colors.textDim} style={{ marginTop: 18, marginBottom: 6, marginLeft: 12 }}>
          Workspace
        </Text>
        {state.routes.map((r, i) => {
          const t = TABS[r.name];
          if (!t) return null;
          const on = state.index === i;
          return (
            <Pressable key={r.key} onPress={() => go(r.name, r.key, on)} style={(s) => [styles.railItem, on && styles.railOn, (s as { hovered?: boolean }).hovered && !on && { backgroundColor: colors.surfaceAlt }]}>
              {on ? <View style={styles.railMark} /> : null}
              <Ionicons name={on ? t.iconOn : t.icon} size={19} color={on ? colors.text : colors.textMuted} />
              <Text variant="body" color={on ? colors.text : colors.textMuted} style={{ fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 14.5 }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
        {user?.role === 'ADMIN' ? (
          <Pressable onPress={() => router.push('/admin')} style={(s) => [styles.railItem, (s as { hovered?: boolean }).hovered && { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="shield-checkmark-outline" size={19} color={colors.textMuted} />
            <Text variant="body" color={colors.textMuted} style={{ fontFamily: fonts.medium, fontSize: 14.5 }}>
              Admin
            </Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        <AiCard />
        {user ? (
          <View style={styles.user}>
            <LinearGradient colors={gradients.brand} style={styles.avatar}>
              <Text variant="title" color="#FFFFFF">
                {user.name.slice(0, 1).toUpperCase()}
              </Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text variant="title" numberOfLines={1}>
                {user.name}
              </Text>
              <Text variant="label" color={colors.textMuted} numberOfLines={1} style={{ fontFamily: fonts.regular }}>
                {user.email}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={[styles.floatWrap, { bottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.float}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        {state.routes.map((r, i) => {
          const t = TABS[r.name];
          if (!t) return null;
          const on = state.index === i;
          if (r.name === 'create')
            return (
              <Pressable key={r.key} onPress={() => go(r.name, r.key, on)} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: on }} style={styles.fab}>
                <Ionicons name="add" size={26} color={colors.onHighlight} />
              </Pressable>
            );
          return (
            <Pressable key={r.key} onPress={() => go(r.name, r.key, on)} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: on }} style={styles.tab}>
              <Ionicons name={on ? t.iconOn : t.icon} size={21} color={on ? '#FFFFFF' : 'rgba(255,255,255,0.5)'} />
              <Text variant="label" color={on ? '#FFFFFF' : 'rgba(255,255,255,0.5)'} style={{ fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 10.5 }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const token = useAuth((s) => s.token);
  const desktop = useDesktop();
  if (!token) return <Redirect href="/login" />;
  return (
    <Tabs
      tabBar={(p) => <TabBar {...(p as unknown as BottomTabBarProps)} desktop={desktop} />}
      screenOptions={{ headerShown: false, tabBarPosition: desktop ? 'left' : 'bottom', sceneStyle: { backgroundColor: colors.bg }, lazy: true }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  floatWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  float: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 6, borderRadius: 999, backgroundColor: 'rgba(16,16,22,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', overflow: 'hidden', ...shadow.bar },
  tab: { height: 52, width: 62, borderRadius: 26, alignItems: 'center', justifyContent: 'center', gap: 2 },
  fab: { height: 50, width: 50, borderRadius: 25, marginHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.highlight, ...shadow.glow },
  rail: { width: RAIL_WIDTH, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border, paddingVertical: 22, paddingHorizontal: 14, gap: 2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, marginBottom: 18 },
  demo: { backgroundColor: colors.highlight, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  newBtn: { height: 42, borderRadius: radius.md, backgroundColor: colors.highlight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, ...shadow.glow },
  railItem: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 42, paddingHorizontal: 12, borderRadius: radius.md },
  railOn: { backgroundColor: colors.surfaceHigh },
  railMark: { position: 'absolute', left: -14, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: colors.highlight },
  aiCard: { borderRadius: radius.lg, padding: 14, gap: 6, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(155,107,255,0.35)', marginBottom: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, marginLeft: 'auto' },
  user: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
