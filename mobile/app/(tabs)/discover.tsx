import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AutopilotPane } from '../../src/components/AutopilotPane';
import { Button } from '../../src/components/Button';
import { ScoutPane } from '../../src/components/ScoutPane';
import { Segmented } from '../../src/components/Segmented';
import { Input } from '../../src/components/Input';
import { Text } from '../../src/components/Text';
import { Card, Chips, Empty, Notice, Screen, Spinner } from '../../src/components/ui';
import { api } from '../../src/api/client';
import type { DiscoverItem } from '../../src/api/types';
import { useDraft } from '../../src/store/draft';
import { colors, fonts, radius, space } from '../../src/theme';
import { ago, clock, compact } from '../../src/utils/format';

type Pane = 'scout' | 'autopilot' | 'trending';
const PANES: { value: Pane; label: string }[] = [
  { value: 'scout', label: 'Scout' },
  { value: 'autopilot', label: 'Autopilot' },
  { value: 'trending', label: 'Trending' },
];

export default function Discover() {
  const [pane, setPane] = useState<Pane>('scout');
  const [campaignTopic, setCampaignTopic] = useState('');
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [mode, setMode] = useState<'youtube-trending' | 'search'>('search');
  const [region, setRegion] = useState('US');
  const [category, setCategory] = useState('all');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<DiscoverItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ categories: { id: string; label: string }[]; mode: 'youtube-trending' | 'search'; region: string }>('/discover/categories').then(
      (r) => {
        setCategories(r.categories);
        setMode(r.mode);
        setRegion(r.region);
      },
      () => undefined,
    );
  }, []);

  const load = useCallback(async () => {
    setItems(null);
    setError('');
    try {
      const params = new URLSearchParams({ category });
      if (query) params.set('q', query);
      const r = await api<{ items: DiscoverItem[] }>(`/discover?${params}`);
      setItems(r.items);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : 'Could not load videos');
    }
  }, [category, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const clip = (it: DiscoverItem) => {
    useDraft.getState().setUrl(it.url, { title: it.title, thumbnail: it.thumbnail ?? undefined });
    router.navigate('/create');
  };

  if (pane !== 'trending') {
    return (
      <Screen title={pane === 'scout' ? 'Scout' : 'Autopilot'} subtitle={pane === 'scout' ? 'Find the creators and videos most worth clipping right now' : 'Let the agent find, clip and post on a schedule'} wide>
        <Segmented options={PANES} value={pane} onChange={setPane} />
        {pane === 'scout' ? (
          <ScoutPane
            onAutopilot={(t) => {
              setCampaignTopic(t);
              setPane('autopilot');
            }}
          />
        ) : (
          <AutopilotPane topic={campaignTopic} />
        )}
      </Screen>
    );
  }

  return (
    <Screen
      title="Trending"
      subtitle={mode === 'youtube-trending' && !query ? `What's popular on YouTube right now (${region})` : 'Find a video to clip'}
      wide
      right={<Button label="Refresh" variant="secondary" icon="refresh" onPress={() => void load()} />}
    >
      <Segmented options={PANES} value={pane} onChange={setPane} />
      <View style={styles.searchRow}>
        <View style={{ flex: 1 }}>
          <Input icon="search" value={q} onChangeText={setQ} placeholder="Search videos, creators, topics…" onSubmitEditing={() => setQuery(q.trim())} returnKeyType="search" />
        </View>
        {query ? (
          <Button
            label="Clear"
            variant="ghost"
            onPress={() => {
              setQ('');
              setQuery('');
            }}
          />
        ) : null}
      </View>
      {!query && categories.length ? <Chips value={category} onChange={setCategory} options={categories.map((c) => ({ value: c.id, label: c.label }))} /> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        !error ? <Empty icon="flame-outline" title="Nothing found" hint="Try another category or search." /> : null
      ) : (
        <View style={styles.grid}>
          {items.map((it) => (
            <Card key={it.id} style={styles.card}>
              <Pressable onPress={() => clip(it)} style={styles.thumbBox} accessibilityLabel={`Clip ${it.title}`}>
                {it.thumbnail ? <Image source={{ uri: it.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                {it.duration ? (
                  <View style={styles.dur}>
                    <Text variant="label" color="#FFFFFF" fixedColor style={{ fontFamily: fonts.semibold }}>
                      {clock(it.duration)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
              <View style={{ gap: 3, flex: 1 }}>
                <Text variant="title" numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
                  {it.title}
                </Text>
                <Text variant="label" color={colors.textMuted} numberOfLines={1}>
                  {[it.channel, it.views ? `${compact(it.views)} views` : null, it.publishedAt ? ago(it.publishedAt) : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={styles.actions}>
                <Button label="Clip this" icon="cut" onPress={() => clip(it)} style={{ flex: 1 }} />
                <Pressable onPress={() => void Linking.openURL(it.url)} style={styles.open} accessibilityLabel="Watch on YouTube">
                  <Ionicons name="open-outline" size={18} color={colors.text} />
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  card: { flexGrow: 1, flexBasis: 260, maxWidth: 400, padding: space.md },
  thumbBox: { aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' },
  dur: { position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  actions: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  open: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
});
