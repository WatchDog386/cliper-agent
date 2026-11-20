import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, radius } from '../theme';
import { Text } from './Text';

interface Props<T extends string> {
  options: { value: T; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
  value: T;
  onChange: (v: T) => void;
}

/** A pill track with the chosen option raised. */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.seg, on && styles.on]}>
            {o.icon ? <Ionicons name={o.icon} size={15} color={on ? colors.text : colors.textMuted} /> : null}
            <Text variant="label" color={on ? colors.text : colors.textMuted} style={{ fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 13.5 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start' },
  seg: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 16, borderRadius: radius.pill },
  on: { backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.borderStrong },
});
