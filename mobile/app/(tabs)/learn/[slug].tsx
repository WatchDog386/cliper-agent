import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, IconButton } from '../../../src/components/Button';
import { Text } from '../../../src/components/Text';
import { Badge, Card, Screen } from '../../../src/components/ui';
import { ARTICLES, type Block } from '../../../src/content/learn';
import { colors, fonts, radius, space } from '../../../src/theme';

function Render({ b }: { b: Block }) {
  if ('h' in b) return <Text variant="h1" style={{ marginTop: space.sm }}>{b.h}</Text>;
  if ('p' in b) return <Text variant="body" color={colors.text} style={{ lineHeight: 25, fontSize: 16 }}>{b.p}</Text>;
  if ('tip' in b)
    return (
      <View style={styles.tip}>
        <Ionicons name="bulb-outline" size={18} color={colors.brand} />
        <Text variant="body" style={{ flex: 1, lineHeight: 23 }}>
          <Text variant="body" style={{ fontFamily: fonts.semibold }}>
            Tip:{' '}
          </Text>
          {b.tip}
        </Text>
      </View>
    );
  const numbered = 'steps' in b;
  const items = numbered ? b.steps : b.list;
  return (
    <View style={{ gap: 10 }}>
      {items.map((t, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          {numbered ? (
            <View style={styles.n}>
              <Text variant="label" color={colors.onHighlight} style={{ fontFamily: fonts.bold }}>
                {i + 1}
              </Text>
            </View>
          ) : (
            <View style={styles.bullet} />
          )}
          <Text variant="body" style={{ flex: 1, lineHeight: 24, fontSize: 15.5 }}>
            {t}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function ArticlePage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const i = ARTICLES.findIndex((a) => a.slug === slug);
  const a = ARTICLES[i];
  const back = <IconButton icon="arrow-back" label="Back to the learning center" onPress={() => router.navigate('/learn')} />;
  if (!a)
    return (
      <Screen title="Guide not found" right={back}>
        <Button label="All guides" icon="book-outline" onPress={() => router.navigate('/learn')} style={{ alignSelf: 'flex-start' }} />
      </Screen>
    );
  const next = ARTICLES[(i + 1) % ARTICLES.length]!;
  return (
    <Screen eyebrow={`${a.category} · ${a.minutes} min read`} title={a.title} subtitle={a.summary} right={back}>
      <View style={{ gap: space.lg, maxWidth: 720 }}>
        {a.body.map((b, j) => (
          <Render key={j} b={b} />
        ))}
      </View>
      <Card onPress={() => router.replace(`/learn/${next.slug}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Badge>Next guide</Badge>
          <Text variant="h2">{next.title}</Text>
        </View>
        <Ionicons name="arrow-forward" size={20} color={colors.text} />
      </Card>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Button label="Try it now" icon="add" onPress={() => router.navigate('/create')} />
        <Button label="All guides" variant="secondary" icon="book-outline" onPress={() => router.navigate('/learn')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tip: { flexDirection: 'row', gap: 10, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: 'rgba(155,107,255,0.3)' },
  n: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.highlight, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand, marginTop: 9, marginLeft: 6 },
});
