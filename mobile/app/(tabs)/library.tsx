import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Segmented } from '../../src/components/Segmented';
import { ProjectCard } from '../../src/components/ProjectCard';
import { Empty, Notice, Screen, Skeleton } from '../../src/components/ui';
import { api } from '../../src/api/client';
import { ACTIVE, type Job } from '../../src/api/types';
import { radius, space } from '../../src/theme';

type Filter = 'all' | 'active' | 'done' | 'failed';
interface Stats {
  total: number;
  active: number;
  done: number;
  clips: number;
}

export default function Library() {
  const [filter, setFilter] = useState<Filter>('all');
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
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
      setError(e instanceof Error ? e.message : 'Could not load your projects');
      // Keep trying: a dropped connection should not freeze the list
      return true;
    }
  }, [filter]);

  // Poll while jobs are running and the page is open
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const tick = async () => {
        const busy = await load();
        if (alive) timer.current = setTimeout(tick, busy ? 2500 : 12000);
      };
      void tick();
      return () => {
        alive = false;
        if (timer.current) clearTimeout(timer.current);
      };
    }, [load]),
  );

  useEffect(() => setJobs(null), [filter]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!jobs || !term) return jobs;
    return jobs.filter((j) => `${j.title} ${j.uploader ?? ''}`.toLowerCase().includes(term));
  }, [jobs, q]);

  return (
    <Screen
      eyebrow="Library"
      title="Projects"
      subtitle={stats ? `${stats.clips} clips from ${stats.total} videos${stats.active ? ` · ${stats.active} working` : ''}` : 'Everything you have clipped'}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      right={<Button label="New project" icon="add" onPress={() => router.navigate('/create')} />}
      wide
    >
      <View style={styles.bar}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'In progress' },
            { value: 'done', label: 'Ready' },
            { value: 'failed', label: 'Failed' },
          ]}
        />
        <View style={{ flexGrow: 1, flexBasis: 240, maxWidth: 380 }}>
          <Input icon="search" value={q} onChangeText={setQ} placeholder="Search projects…" returnKeyType="search" />
        </View>
      </View>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {shown === null ? (
        <View style={styles.grid}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} style={{ flexGrow: 1, flexBasis: 260, height: 240, borderRadius: radius.lg }} />
          ))}
        </View>
      ) : shown.length === 0 ? (
        <Empty
          icon={q ? 'search-outline' : 'film-outline'}
          title={q ? 'No matches' : filter === 'all' ? 'No projects yet' : 'Nothing here'}
          hint={q ? `Nothing called “${q}”.` : 'Paste a video link on the Create tab or pick something from Trending.'}
          action={q ? undefined : <Button label="Create clips" icon="add" onPress={() => router.navigate('/create')} />}
        />
      ) : (
        <View style={styles.grid}>
          {shown.map((j) => (
            <ProjectCard key={j.id} job={j} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
});
