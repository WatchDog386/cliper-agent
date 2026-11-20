import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, IconButton } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Text } from '../../src/components/Text';
import { Badge, Chips, Empty, Notice, Screen, Skeleton } from '../../src/components/ui';
import { api } from '../../src/api/client';
import type { DiscoverItem } from '../../src/api/types';
import { useDraft } from '../../src/store/draft';
import { colors, fonts, gradients, radius, space } from '../../src/theme';
import { ago, clock, compact } from '../../src/utils/format';

function VideoCard({ it, rank, onClip }: { it: DiscoverItem; rank: number; onClip: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <View style={[styles.card, hover && { borderColor: colors.borderStrong }]} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <Pressable onPress={onClip} style={styles.thumbBox} accessibilityLabel={`Clip ${it.title}`}>
        {it.thumbnail ? <Image source={{ uri: it.thumbnail }} style={[StyleSheet.absoluteFill, hover && { transform: [{ scale: 1.05 }] }]} resizeMode="cover" /> : null}
        <LinearGradient colors={gradients.scrim} start={{ x: 0, y: 0.4 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.rank}>
          <Ionicons name="trending-up" size={12} color={colors.onHighlight} />
          <Text variant="label" color={colors.onHighlight} style={{ fontFamily: fonts.bold }}>
            #{rank}
          </Text>
        </View>
        {it.duration ? (
          <View style={styles.dur}>
            <Text variant="label" color="#FFFFFF" style={{ fontFamily: fonts.semibold }}>
              {clock(it.duration)}
            </Text>
          </View>
        ) : null}
        {hover ? (
          <View style={styles.hoverCta}>
            <Badge tone="lime" icon="cut">
              Clip this
            </Badge>
          </View>
        ) : null}
      </Pressable>
      <View style={{ gap: 4, flex: 1 }}>
        <Text variant="title" numberOfLines={2}>
          {it.title}
        </Text>
        <Text variant="label" color={colors.textMuted} numberOfLines={1} style={{ fontFamily: fonts.regular }}>
          {[it.channel, it.views ? `${compact(it.views)} views` : null, it.publishedAt ? ago(it.publishedAt) : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button label="Clip this" icon="cut" size="sm" onPress={onClip} style={{ flex: 1 }} />
        <IconButton icon="open-outline" size={34} label="Watch the original" onPress={() => void Linking.openURL(it.url)} />
      </View>
    </View>
  );
}

export default function Discover() {
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

  return (
    <Screen
      eyebrow={mode === 'youtube-trending' ? `Live chart · ${region}` : 'Discover'}
      title="Trending now"
      subtitle={mode === 'youtube-trending' && !query ? 'What is blowing up on YouTube right now. One tap sends it to the studio.' : 'Find a video worth clipping.'}
      wide
      right={<Button label="Refresh" variant="secondary" icon="refresh" onPress={() => void load()} />}
    >
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
        ) : (
          <Button label="Search" variant="secondary" icon="search" onPress={() => setQuery(q.trim())} />
        )}
      </View>
      {!query && categories.length ? <Chips size="sm" value={category} onChange={setCategory} options={categories.map((c) => ({ value: c.id, label: c.label }))} /> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {items === null ? (
        <View style={styles.grid}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} style={{ flexGrow: 1, flexBasis: 260, height: 260, borderRadius: radius.lg }} />
          ))}
        </View>
      ) : items.length === 0 ? (
        !error ? <Empty icon="flame-outline" title="Nothing found" hint="Try another category or search." /> : null
      ) : (
        <View style={styles.grid}>
          {items.map((it, i) => (
            <VideoCard key={it.id} it={it} rank={i + 1} onClip={() => clip(it)} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  card: { flexGrow: 1, flexBasis: 260, maxWidth: 400, padding: space.sm, paddingBottom: space.md, gap: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  thumbBox: { aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' },
  rank: { position: 'absolute', left: 8, top: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.highlight, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 },
  dur: { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  hoverCta: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  actions: { flexDirection: 'row', gap: space.sm, alignItems: 'center', paddingHorizontal: 4 },
});
