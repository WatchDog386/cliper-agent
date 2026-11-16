import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../api/client';
import type { ScoutCreator, ScoutResult, ScoutVideo } from '../api/types';
import { useDraft } from '../store/draft';
import { colors, fonts, radius, space } from '../theme';
import { ago, clock, compact } from '../utils/format';
import { Button } from './Button';
import { Input } from './Input';
import { Text } from './Text';
import { Card, Chips, Empty, Notice, SectionTitle, Spinner } from './ui';

const ICON = { youtube: 'logo-youtube', twitch: 'logo-twitch' } as const;
const TINT = { youtube: '#FF0033', twitch: '#9146FF' } as const;

/** A 0–100 score as a small coloured badge. */
function Score({ value }: { value: number }) {
  const hot = value >= 70;
  return (
    <View style={[styles.score, { backgroundColor: hot ? colors.brand : colors.surfaceHigh }]}>
      {hot ? <Ionicons name="flame" size={11} color="#FFFFFF" /> : null}
      <Text variant="label" color={hot ? '#FFFFFF' : colors.text} fixedColor style={{ fontFamily: fonts.bold, fontSize: 12 }}>
        {Math.round(value)}
      </Text>
    </View>
  );
}

/**
 * Scout: type a topic (a game, a person, an event) and see which videos and creators are most worth
 * clipping right now, ranked by momentum, views and audience.
 */
export function ScoutPane({ onAutopilot }: { onAutopilot: (topic: string) => void }) {
  const [topic, setTopic] = useState('GTA 6');
  const [asked, setAsked] = useState('GTA 6');
  const [days, setDays] = useState(7);
  const [minViews, setMinViews] = useState(0);
  const [result, setResult] = useState<ScoutResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (asked.trim().length < 2) return;
    setLoading(true);
    setError('');
    try {
      setResult(await api<ScoutResult>(`/scout?${new URLSearchParams({ topic: asked.trim(), days: String(days), minViews: String(minViews) })}`));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : 'Could not look that up');
    } finally {
      setLoading(false);
    }
  }, [asked, days, minViews]);

  useEffect(() => {
    void load();
  }, [load]);

  const clip = (v: ScoutVideo) => {
    const d = useDraft.getState();
    d.setUrl(v.url, { title: v.title, thumbnail: v.thumbnail ?? undefined });
    d.setOptions({ topic: result?.topic ?? asked });
    router.navigate('/create');
  };

  return (
    <>
      <Card>
        <View style={styles.searchRow}>
          <View style={{ flex: 1 }}>
            <Input icon="search" value={topic} onChangeText={setTopic} placeholder="A game, a streamer, an event…" onSubmitEditing={() => setAsked(topic)} returnKeyType="search" />
          </View>
          <Button label="Scout" icon="telescope-outline" loading={loading} onPress={() => (topic === asked ? void load() : setAsked(topic))} />
        </View>
        <View style={styles.filters}>
          <Chips
            value={days}
            onChange={setDays}
            options={[
              { value: 1, label: 'Last 24 h' },
              { value: 3, label: '3 days' },
              { value: 7, label: 'Week' },
              { value: 30, label: 'Month' },
            ]}
          />
          <Chips
            value={minViews}
            onChange={setMinViews}
            options={[
              { value: 0, label: 'Any views' },
              { value: 10_000, label: '10K+' },
              { value: 100_000, label: '100K+' },
              { value: 1_000_000, label: '1M+' },
            ]}
          />
        </View>
        {result?.notes.length ? (
          <Text variant="label" color={colors.textMuted}>
            {result.notes.join(' · ')}
          </Text>
        ) : null}
      </Card>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {loading && !result ? <Spinner /> : null}

      {result && result.creators.length ? (
        <Card>
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <SectionTitle hint="Ranked by how fast their videos are being watched, total views and audience">Top creators for “{result.topic}”</SectionTitle>
            </View>
            <Button label="Autopilot this topic" variant="secondary" icon="rocket-outline" onPress={() => onAutopilot(result.topic)} />
          </View>
          <View style={styles.creators}>
            {result.creators.slice(0, 8).map((c: ScoutCreator, i) => (
              <Pressable key={c.key} onPress={() => c.url && void Linking.openURL(c.url)} style={styles.creator} accessibilityLabel={`${c.name} on ${c.platform}`}>
                <Text variant="label" color={colors.textDim} style={{ fontFamily: fonts.bold, width: 18 }}>
                  {i + 1}
                </Text>
                <Ionicons name={ICON[c.platform]} size={18} color={TINT[c.platform]} />
                <View style={{ flex: 1 }}>
                  <Text variant="title" numberOfLines={1} style={{ fontFamily: fonts.semibold }}>
                    {c.name}
                  </Text>
                  <Text variant="label" color={colors.textMuted} numberOfLines={1}>
                    {[c.subscribers ? `${compact(c.subscribers)} ${c.platform === 'twitch' ? 'followers' : 'subs'}` : null, `${compact(c.views)} views`, `${c.videos} video${c.videos === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Score value={c.score} />
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}

      {result && !result.videos.length && !loading ? <Empty icon="telescope-outline" title="Nothing found" hint="Try a longer period, fewer minimum views, or another way of writing the topic." /> : null}

      {result?.videos.length ? (
        <View style={styles.grid}>
          {result.videos.map((v) => (
            <Card key={v.id} style={styles.card}>
              <Pressable onPress={() => clip(v)} style={styles.thumbBox} accessibilityLabel={`Clip ${v.title}`}>
                {v.thumbnail ? <Image source={{ uri: v.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                <View style={styles.badgeLeft}>
                  <Score value={v.score} />
                </View>
                {v.duration ? (
                  <View style={styles.dur}>
                    <Text variant="label" color="#FFFFFF" fixedColor style={{ fontFamily: fonts.semibold }}>
                      {clock(v.duration)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
              <View style={{ gap: 3, flex: 1 }}>
                <Text variant="title" numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
                  {v.title}
                </Text>
                <View style={styles.by}>
                  <Ionicons name={ICON[v.platform]} size={14} color={TINT[v.platform]} />
                  <Text variant="label" color={colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
                    {[v.creator, v.subscribers ? `${compact(v.subscribers)} ${v.platform === 'twitch' ? 'followers' : 'subs'}` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text variant="label" color={colors.textMuted} numberOfLines={1}>
                  {[`${compact(v.views)} views`, v.publishedAt ? ago(v.publishedAt) : null, v.kind === 'clip' ? 'Twitch clip' : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={styles.actions}>
                <Button label="Clip this" icon="cut" onPress={() => clip(v)} style={{ flex: 1 }} />
                <Pressable onPress={() => void Linking.openURL(v.url)} style={styles.open} accessibilityLabel="Open the original">
                  <Ionicons name="open-outline" size={18} color={colors.text} />
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  filters: { gap: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, flexWrap: 'wrap' },
  creators: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  creator: { flexGrow: 1, flexBasis: 280, flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  score: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, height: 24, borderRadius: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  card: { flexGrow: 1, flexBasis: 260, maxWidth: 400, padding: space.md },
  thumbBox: { aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' },
  badgeLeft: { position: 'absolute', left: 6, top: 6 },
  dur: { position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  by: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actions: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  open: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
});
