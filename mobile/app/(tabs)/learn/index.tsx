import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Input } from '../../../src/components/Input';
import { Text } from '../../../src/components/Text';
import { Badge, Chips, Empty, Glow, Screen } from '../../../src/components/ui';
import { ARTICLES, CATEGORIES, type Article } from '../../../src/content/learn';
import { colors, fonts, gradients, radius, space } from '../../../src/theme';
import { useDesktop } from '../../../src/theme/desktop';

function ArticleCard({ a }: { a: Article }) {
  return (
    <Pressable onPress={() => router.push(`/learn/${a.slug}`)} style={(s) => [styles.card, (s as { hovered?: boolean }).hovered && styles.hover]}>
      <View style={styles.icon}>
        <Ionicons name={a.icon} size={20} color={colors.text} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <Badge>{a.category}</Badge>
        <Text variant="label" color={colors.textMuted}>
          {a.minutes} min read
        </Text>
      </View>
      <Text variant="h2">{a.title}</Text>
      <Text variant="bodySm" color={colors.textMuted}>
        {a.summary}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
        <Text variant="label" style={{ fontFamily: fonts.semibold }}>
          Read guide
        </Text>
        <Ionicons name="arrow-forward" size={14} color={colors.text} />
      </View>
    </Pressable>
  );
}

/** Learning center: practical guides for making clips that perform. */
export default function Learn() {
  const desktop = useDesktop();
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('All');
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return ARTICLES.filter((a) => (cat === 'All' || a.category === cat) && (!term || `${a.title} ${a.summary}`.toLowerCase().includes(term)));
  }, [cat, q]);
  const featured = ARTICLES[2]!;

  return (
    <Screen eyebrow="Resources" title="Learning center" subtitle="Short guides on hooks, formats and workflows that turn long videos into posts that travel." wide>
      <Pressable onPress={() => router.push(`/learn/${featured.slug}`)} style={[styles.feature, desktop && { flexDirection: 'row', alignItems: 'center' }]}>
        <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Glow color="#9B6BFF" size={520} opacity={0.4} style={{ top: -260, left: -140 }} />
        <Glow color="#C8FF2E" size={360} opacity={0.14} style={{ bottom: -200, right: -60 }} />
        <View style={{ flex: 1, gap: 10 }}>
          <Badge tone="ai" icon="sparkles">
            Featured guide
          </Badge>
          <Text variant="display" color="#FFFFFF">
            {featured.title}
          </Text>
          <Text variant="body" color="rgba(255,255,255,0.75)" style={{ maxWidth: 520 }}>
            {featured.summary}
          </Text>
        </View>
        <View style={styles.featureCta}>
          <Text variant="title" color={colors.onHighlight}>
            Read now · {featured.minutes} min
          </Text>
          <Ionicons name="arrow-forward" size={16} color={colors.onHighlight} />
        </View>
      </Pressable>

      <View style={styles.filters}>
        <Chips size="sm" value={cat} onChange={setCat} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
        <View style={{ flexGrow: 1, flexBasis: 220, maxWidth: 340 }}>
          <Input icon="search" value={q} onChangeText={setQ} placeholder="Search guides…" />
        </View>
      </View>

      {list.length ? (
        <View style={styles.grid}>
          {list.map((a) => (
            <ArticleCard key={a.slug} a={a} />
          ))}
        </View>
      ) : (
        <Empty icon="book-outline" title="No guides match" hint="Try another word or category." />
      )}

      <Pressable onPress={() => router.navigate('/help')} style={(s) => [styles.help, (s as { hovered?: boolean }).hovered && styles.hover]}>
        <Ionicons name="help-buoy-outline" size={22} color={colors.text} />
        <View style={{ flex: 1 }}>
          <Text variant="title">Stuck on something specific?</Text>
          <Text variant="bodySm" color={colors.textMuted}>
            The Help center covers errors, limits and how every feature works.
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={18} color={colors.textMuted} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  feature: { borderRadius: radius.xxl, padding: space.xxl, gap: space.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  featureCta: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.highlight === '#0A0A0F' ? '#C8FF2E' : colors.highlight, paddingHorizontal: 18, height: 44, borderRadius: 22, alignSelf: 'flex-start' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  card: { flexGrow: 1, flexBasis: 280, maxWidth: 440, minHeight: 230, gap: 10, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  hover: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceAlt },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh, marginBottom: 4 },
  help: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
