import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../src/components/Button';
import { Text } from '../src/components/Text';
import { Backdrop, Glow } from '../src/components/ui';
import { colors } from '../src/theme';

/** Any address the app does not know. */
export default function NotFound() {
  return (
    <View style={styles.page}>
      <Backdrop />
      <Glow color="#C8FF2E" size={420} opacity={0.12} style={{ alignSelf: 'center', top: '20%' }} />
      <Text variant="hero" color={colors.text} align="center" style={{ fontSize: 96, lineHeight: 100 }}>
        404
      </Text>
      <Text variant="h1" align="center">
        This scene was cut.
      </Text>
      <Text variant="body" color={colors.textMuted} align="center" style={{ maxWidth: 380 }}>
        The page you are looking for does not exist, or it moved.
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <Button label="Go home" icon="home" onPress={() => router.replace('/')} />
        <Button label="New project" variant="secondary" icon="add" onPress={() => router.replace('/create')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: colors.bg, overflow: 'hidden' },
});
