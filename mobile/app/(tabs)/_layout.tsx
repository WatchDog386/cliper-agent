import { Pressable, StyleSheet, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';

/** The part of React Navigation's tab-bar props this bar uses. */
interface BottomTabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean }; navigate: (name: string) => void };
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../../src/components/Text';
import { colors, fonts, gradients, shadow } from '../../src/theme';
import { desk } from '../../src/theme/desk';
import { useDesktop } from '../../src/theme/desktop';
import { useAuth } from '../../src/store/auth';

type Icon = keyof typeof Ionicons.glyphMap;
const TABS: Record<string, { label: string; icon: Icon; iconOn: Icon }> = {
  create: { label: 'Create', icon: 'add-circle-outline', iconOn: 'add-circle' },
  library: { label: 'My clips', icon: 'film-outline', iconOn: 'film' },
  discover: { label: 'Trending', icon: 'flame-outline', iconOn: 'flame' },
  settings: { label: 'Settings', icon: 'settings-outline', iconOn: 'settings' },
};

/** Phones: the template's floating pill bar. Desktop browsers: a side rail. */
function TabBar({ state, navigation, desktop }: BottomTabBarProps & { desktop: boolean }) {
  const insets = useSafeAreaInsets();
  const go = (name: string, key: string, focused: boolean) => {
    const e = navigation.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!focused && !e.defaultPrevented) navigation.navigate(name);
  };

  if (desktop) {
    return (
      <View style={styles.rail}>
        <View style={styles.brandRow}>
          <LinearGradient colors={gradients.brand} style={styles.logo}>
            <Ionicons name="cut" size={18} color="#FFFFFF" />
          </LinearGradient>
          <Text variant="h2" color={desk.navText} fixedColor style={{ fontFamily: fonts.bold }}>
            Cliper Agent
          </Text>
        </View>
        {state.routes.map((r, i) => {
          const t = TABS[r.name];
          if (!t) return null;
          const on = state.index === i;
          return (
            <Pressable key={r.key} onPress={() => go(r.name, r.key, on)} style={(s) => [styles.railItem, on && styles.railOn, (s as { hovered?: boolean }).hovered && !on && { backgroundColor: desk.navHover }]}>
              <Ionicons name={on ? t.iconOn : t.icon} size={20} color={on ? desk.navActive : desk.navMuted} />
              <Text variant="body" color={on ? '#FFFFFF' : desk.navText} fixedColor style={{ fontFamily: on ? fonts.semibold : fonts.medium }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={[styles.floatWrap, { bottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.float}>
        {state.routes.map((r, i) => {
          const t = TABS[r.name];
          if (!t) return null;
          const on = state.index === i;
          return (
            <Pressable key={r.key} onPress={() => go(r.name, r.key, on)} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: on }} style={[styles.tab, on && styles.tabOn]}>
              <Ionicons name={on ? t.iconOn : t.icon} size={21} color={on ? colors.onHighlight : 'rgba(255,255,255,0.75)'} />
              {on ? (
                <Text variant="label" color={colors.onHighlight} fixedColor style={{ fontFamily: fonts.semibold }}>
                  {t.label}
                </Text>
              ) : null}
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
      screenOptions={{ headerShown: false, tabBarPosition: desktop ? 'left' : 'bottom', sceneStyle: { backgroundColor: colors.bgTop } }}
    >
      <Tabs.Screen name="create" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  floatWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  float: { flexDirection: 'row', gap: 4, padding: 6, borderRadius: 999, backgroundColor: '#15161A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', ...shadow.bar },
  tab: { height: 48, minWidth: 48, paddingHorizontal: 14, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabOn: { backgroundColor: colors.highlight },
  rail: { width: 236, backgroundColor: desk.nav, paddingVertical: 24, paddingHorizontal: 14, gap: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, marginBottom: 24 },
  logo: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  railItem: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 44, paddingHorizontal: 12, borderRadius: 10 },
  railOn: { backgroundColor: 'rgba(255,77,94,0.14)' },
});
