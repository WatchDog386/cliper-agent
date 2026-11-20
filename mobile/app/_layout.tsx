import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '../src/components/Button';
import { Text } from '../src/components/Text';
import { colors, isDark } from '../src/theme';
import { useAuth } from '../src/store/auth';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Shown instead of a blank screen if a page crashes. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14, backgroundColor: colors.bg }}>
      <Ionicons name="warning-outline" size={44} color={colors.text} />
      <Text variant="h2" align="center">
        Something went wrong on this screen
      </Text>
      <Text variant="bodySm" color={colors.textMuted} align="center">
        {error.message}
      </Text>
      <Button label="Try again" icon="refresh" onPress={() => void retry()} />
      <Button label="Go home" variant="ghost" onPress={() => router.replace('/')} />
    </View>
  );
}

// Inter everywhere. The web uses small woff2 files bundled with the app (no font CDN round trip).
const WEB_FONTS = {
  AppSans_400Regular: require('@fontsource/inter/files/inter-latin-400-normal.woff2'),
  AppSans_500Medium: require('@fontsource/inter/files/inter-latin-500-normal.woff2'),
  AppSans_600SemiBold: require('@fontsource/inter/files/inter-latin-600-normal.woff2'),
  AppSans_700Bold: require('@fontsource/inter/files/inter-latin-700-normal.woff2'),
  AppSans_800ExtraBold: require('@fontsource/inter/files/inter-latin-800-normal.woff2'),
};

function nativeFonts() {
  const f = require('@expo-google-fonts/figtree');
  return {
    AppSans_400Regular: f.Figtree_400Regular,
    AppSans_500Medium: f.Figtree_500Medium,
    AppSans_600SemiBold: f.Figtree_600SemiBold,
    AppSans_700Bold: f.Figtree_700Bold,
    AppSans_800ExtraBold: f.Figtree_800ExtraBold,
  };
}

/** Fonts never keep the app from opening: after a moment it opens with the system font. */
function useAppFonts() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        setReady(true);
      }
    };
    // Never hold the first paint for long: after 1.5 s the app opens and the fonts swap in
    const giveUp = setTimeout(finish, 1500);
    Font.loadAsync(Platform.OS === 'web' ? WEB_FONTS : nativeFonts())
      .catch(() => undefined)
      .finally(finish);
    return () => clearTimeout(giveUp);
  }, []);
  return ready;
}

export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  const hydrated = useAuth((s) => s.hydrated);
  const ready = fontsLoaded && hydrated;

  useEffect(() => {
    void useAuth.getState().hydrate();
  }, []);

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => undefined);
    // The instant HTML splash (public/index.html) fades once the app is ready
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const boot = document.getElementById('boot-splash');
      if (boot) {
        boot.style.opacity = '0';
        setTimeout(() => boot.remove(), 300);
      }
    }
  }, [ready]);

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {ready ? <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade_from_bottom' }} /> : null}
    </SafeAreaProvider>
  );
}
