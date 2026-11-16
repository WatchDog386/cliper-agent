import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { SocialAccount } from '../api/types';
import { colors, fonts, radius, space } from '../theme';
import { PLATFORM } from '../social/platforms';
import { AccountAvatar } from './PlatformBadge';
import { Text } from './Text';

/** Tick the accounts to post to. Accounts that have to be connected again cannot be chosen. */
export function AccountPicker({ accounts, value, onChange }: { accounts: SocialAccount[]; value: string[]; onChange: (ids: string[]) => void }) {
  return (
    <View style={styles.grid}>
      {accounts.map((a) => {
        const on = value.includes(a.id);
        const off = a.needsReconnect;
        return (
          <Pressable
            key={a.id}
            disabled={off}
            onPress={() => onChange(on ? value.filter((id) => id !== a.id) : [...value, a.id])}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: off }}
            accessibilityLabel={`${PLATFORM[a.platform].label}: ${a.name}`}
            style={[styles.item, on && styles.on, off && { opacity: 0.5 }]}
          >
            <AccountAvatar account={a} size={34} />
            <View style={{ flex: 1 }}>
              <Text variant="title" numberOfLines={1} style={{ fontFamily: fonts.semibold }}>
                {a.name}
              </Text>
              <Text variant="label" color={off ? colors.danger : colors.textMuted} numberOfLines={1}>
                {off ? 'Connect again first' : PLATFORM[a.platform].label}
              </Text>
            </View>
            <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? colors.brand : colors.textDim} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  item: {
    flexGrow: 1,
    flexBasis: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  on: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
});
