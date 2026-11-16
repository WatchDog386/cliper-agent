import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '../../src/components/Button';
import { Text } from '../../src/components/Text';
import { Card, Chips, Empty, Notice, ProgressBar, Screen, Spinner, StatusPill } from '../../src/components/ui';
import { api, mediaUrl } from '../../src/api/client';
import { ACTIVE, type Job } from '../../src/api/types';
import { colors, fonts, radius, space } from '../../src/theme';
import { ago, clock } from '../../src/utils/format';

type Filter = 'all' | 'active' | 'done' | 'failed';
interface Stats {
  total: number;
  active: number;
  done: number;
  clips: number;
}

const VIEW: Record<string, string> = { phone: '9:16', desktop: '16:9', square: '1:1', portrait: '4:5', original: 'Original' };

export default function Library() {
  const [filter, setFilter] = useState<Filter>('all');
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ jobs: Job[]; stats: Stats }>(`/jobs?status=${filter}`);
      setJobs(r.jobs);
      setStats(r.stats);
      setError('');
      return r.jobs.some((j) => ACTIVE.includes(j.status));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your clips');
      return false;
    }
  }, [filter]);

  // Poll while jobs are running and the page is open
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const tick = async () => {
        const busy = await load();
        if (alive) timer.current = setTimeout(tick, busy ? 2000 : 10000);
      };
      void tick();
      return () => {
        alive = false;
        if (timer.current) clearTimeout(timer.current);
      };
    }, [load]),
  );

  useEffect(() => setJobs(null), [filter]);

  return (
    <Screen
      title="My clips"
      subtitle={stats ? `${stats.clips} clip${stats.clips === 1 ? '' : 's'} from ${stats.total} video${stats.total === 1 ? '' : 's'}${stats.active ? ` · ${stats.active} working` : ''}` : undefined}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      right={<Button label="New" icon="add" onPress={() => router.navigate('/create')} />}
      wide
    >
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'active', label: 'In progress' },
          { value: 'done', label: 'Ready' },
          { value: 'failed', label: 'Failed' },
        ]}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {jobs === null ? (
        <Spinner />
      ) : jobs.length === 0 ? (
        <Empty icon="film-outline" title="No clips yet" hint="Paste a video link on the Create tab or pick something from Trending." action={<Button label="Create clips" icon="add" onPress={() => router.navigate('/create')} />} />
      ) : (
        <View style={styles.grid}>
          {jobs.map((j) => {
            const cover = j.cover ? (j.cover.startsWith('/') ? mediaUrl(j.cover) : j.cover) : null;
            const running = ACTIVE.includes(j.status);
            return (
              <Card key={j.id} onPress={() => router.push(`/job/${j.id}`)} style={styles.card}>
                <View style={styles.cover}>
                  {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Ionicons name="film-outline" size={32} color={colors.textDim} />}
                  <View style={styles.coverBadge}>
                    <Text variant="label" color="#FFFFFF" fixedColor style={{ fontFamily: fonts.semibold }}>
                      {VIEW[j.options.aspect]} · {j.options.mode === 'custom' ? 'custom' : `${j.options.segmentSeconds}s`}
                    </Text>
                  </View>
                </View>
                <View style={{ gap: 6 }}>
                  <Text variant="title" numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
                    {j.title}
                  </Text>
                  <View style={styles.metaRow}>
                    <StatusPill status={j.status} />
                    <Text variant="label" color={colors.textMuted}>
                      {j.status === 'DONE' ? `${j.clipCount} clips · ` : ''}
                      {j.sourceDuration ? `${clock(j.sourceDuration)} · ` : ''}
                      {ago(j.createdAt)}
                    </Text>
                  </View>
                  {running ? (
                    <>
                      <ProgressBar value={j.progress} />
                      <Text variant="label" color={colors.textMuted} numberOfLines={1}>
                        {j.stage ?? 'Waiting'} · {j.progress}%
                      </Text>
                    </>
                  ) : null}
                  {j.status === 'FAILED' && j.error ? (
                    <Text variant="label" color={colors.danger} numberOfLines={2}>
                      {j.error}
                    </Text>
                  ) : null}
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  card: { flexGrow: 1, flexBasis: 280, maxWidth: 520, padding: space.md },
  cover: { height: 150, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverBadge: { position: 'absolute', left: 8, top: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
});
