import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '../../src/components/Button';
import { Text } from '../../src/components/Text';
import { ClipCard } from '../../src/components/ClipCard';
import { Card, Empty, Notice, ProgressBar, Screen, Spinner, StatusPill } from '../../src/components/ui';
import { api } from '../../src/api/client';
import { ACTIVE, type Aspect, type Job } from '../../src/api/types';
import { colors, fonts, space } from '../../src/theme';
import { useDesktop } from '../../src/theme/desktop';
import { bytes, clock } from '../../src/utils/format';
import { saveFile } from '../../src/utils/download';

const STEPS = [
  { key: 'FETCHING', label: 'Download' },
  { key: 'ANALYZING', label: 'Analyse' },
  { key: 'RENDERING', label: 'Clip' },
  { key: 'DONE', label: 'Ready' },
] as const;
const ORDER = ['QUEUED', 'FETCHING', 'ANALYZING', 'RENDERING', 'DONE'];
const TAG: Record<Aspect, string> = { phone: '9x16', desktop: '16x9', square: '1x1', portrait: '4x5', original: 'original' };

function confirm(message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert('Are you sure?', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Yes', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export default function JobPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width } = useWindowDimensions();
  const desktop = useDesktop();

  const load = useCallback(async () => {
    try {
      const r = await api<{ job: Job }>(`/jobs/${id}`);
      setJob(r.job);
      setError('');
      return ACTIVE.includes(r.job.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this job');
      return false;
    }
  }, [id]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const running = await load();
      if (alive && running) timer.current = setTimeout(tick, 1500);
    };
    void tick();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const act = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy('');
    }
  };

  const restartPolling = () => {
    if (timer.current) clearTimeout(timer.current);
    const tick = async () => {
      if (await load()) timer.current = setTimeout(tick, 1500);
    };
    void tick();
  };

  if (!job) {
    return (
      <Screen title="Clips" right={<BackButton />}>
        {error ? <Notice tone="danger">{error}</Notice> : <Spinner />}
      </Screen>
    );
  }

  const running = ACTIVE.includes(job.status);
  const step = ORDER.indexOf(job.status);
  const aspect = job.options.aspect;
  // Grid: tall phone clips sit several to a row; wide desktop clips get more room
  const content = Math.min(desktop ? width - 236 : width, 1240) - space.lg * 2;
  const target = aspect === 'desktop' ? 420 : aspect === 'original' ? 360 : 260;
  const cols = Math.max(1, Math.floor((content + space.md) / (target + space.md)));
  const cardW = Math.floor((content - space.md * (cols - 1)) / cols);
  const slug = job.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60).toLowerCase() || 'video';

  const reclip = (to: Aspect) =>
    act('reclip', async () => {
      const r = await api<{ job: Job }>(`/jobs/${job.id}/reclip`, { body: { options: { ...job.options, aspect: to } } });
      router.replace(`/job/${r.job.id}`);
    });

  return (
    <Screen title={job.title} subtitle={[job.uploader, job.sourceDuration ? clock(job.sourceDuration) : null, job.sourceKind === 'UPLOAD' ? 'Uploaded file' : null].filter(Boolean).join(' · ')} right={<BackButton />} wide>
      <Card>
        <View style={styles.statusRow}>
          <StatusPill status={job.status} />
          <Text variant="bodySm" color={colors.textMuted} style={{ flex: 1 }}>
            {job.status === 'DONE' ? `${job.clips.length} clips · ${bytes(job.totalBytes)}` : (job.stage ?? 'Waiting in line')}
          </Text>
          {job.sourceUrl ? (
            <Pressable onPress={() => void Linking.openURL(job.sourceUrl!)} hitSlop={8} accessibilityLabel="Open the original video">
              <Ionicons name="open-outline" size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        {running ? (
          <>
            <ProgressBar value={job.progress} />
            <View style={styles.steps}>
              {STEPS.map((s, i) => {
                const done = step > i + 1 || job.status === 'DONE';
                const now = step === i + 1;
                return (
                  <View key={s.key} style={styles.step}>
                    <Ionicons name={done ? 'checkmark-circle' : now ? 'ellipse' : 'ellipse-outline'} size={16} color={done ? colors.success : now ? colors.brand : colors.textDim} />
                    <Text variant="label" color={now ? colors.text : colors.textMuted} style={now ? { fontFamily: fonts.semibold } : undefined}>
                      {s.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
        {job.status === 'FAILED' && job.error ? <Notice tone="danger">{job.error}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}

        <View style={styles.actions}>
          {job.status === 'DONE' && job.clips.length > 1 ? (
            <Button label="Download all (.zip)" icon="archive-outline" loading={busy === 'zip'} onPress={() => void act('zip', () => saveFile(job.zipUrl, `${slug}-clips.zip`))} />
          ) : null}
          {running ? (
            <Button
              label="Cancel"
              variant="secondary"
              icon="stop-circle-outline"
              loading={busy === 'cancel'}
              onPress={() => void act('cancel', async () => setJob((await api<{ job: Job }>(`/jobs/${job.id}/cancel`, { method: 'POST' })).job))}
            />
          ) : null}
          {job.status === 'FAILED' || job.status === 'CANCELLED' ? (
            <Button
              label="Try again"
              icon="refresh"
              loading={busy === 'retry'}
              onPress={() =>
                void act('retry', async () => {
                  setJob((await api<{ job: Job }>(`/jobs/${job.id}/retry`, { method: 'POST' })).job);
                  restartPolling();
                })
              }
            />
          ) : null}
          {job.status === 'DONE' && aspect !== 'desktop' ? <Button label="Make desktop version" variant="secondary" icon="desktop-outline" loading={busy === 'reclip'} onPress={() => void reclip('desktop')} /> : null}
          {job.status === 'DONE' && aspect !== 'phone' ? <Button label="Make phone version" variant="secondary" icon="phone-portrait-outline" loading={busy === 'reclip'} onPress={() => void reclip('phone')} /> : null}
          <Button
            label="Delete"
            variant="danger"
            icon="trash-outline"
            loading={busy === 'delete'}
            onPress={() =>
              void act('delete', async () => {
                if (!(await confirm('Delete this video and all its clips?'))) return;
                await api(`/jobs/${job.id}`, { method: 'DELETE' });
                router.replace('/library');
              })
            }
          />
        </View>
      </Card>

      {job.clips.length ? (
        <View style={styles.grid}>
          {job.clips.map((c) => (
            <ClipCard
              key={c.id}
              clip={c}
              width={cardW}
              onDownload={() => void act(`dl${c.id}`, () => saveFile(c.downloadUrl, `${slug}-clip-${String(c.index).padStart(2, '0')}-${TAG[aspect]}.mp4`))}
              onDelete={() =>
                void act(`del${c.id}`, async () => {
                  if (!(await confirm(`Delete clip ${c.index}?`))) return;
                  setJob((await api<{ job: Job }>(`/jobs/${job.id}/clips/${c.id}`, { method: 'DELETE' })).job);
                })
              }
            />
          ))}
        </View>
      ) : !running && job.status === 'DONE' ? (
        <Empty icon="film-outline" title="No clips left" hint="All clips of this video were deleted." />
      ) : null}
    </Screen>
  );
}

function BackButton() {
  return (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))} style={styles.back} accessibilityLabel="Back">
      <Ionicons name="arrow-back" size={20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  steps: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'flex-start' },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
});
