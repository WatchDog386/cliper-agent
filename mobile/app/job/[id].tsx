import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Linking, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, IconButton } from '../../src/components/Button';
import { Text } from '../../src/components/Text';
import { ClipCard } from '../../src/components/ClipCard';
import { Badge, Card, Empty, Glow, Notice, ProgressBar, Screen, Skeleton, StatusPill } from '../../src/components/ui';
import { api, mediaUrl } from '../../src/api/client';
import { ACTIVE, type Aspect, type Job } from '../../src/api/types';
import { colors, fonts, radius, space } from '../../src/theme';
import { useDesktop } from '../../src/theme/desktop';
import { bytes, clock } from '../../src/utils/format';
import { saveFile } from '../../src/utils/download';
import { confirm, slugOf } from '../../src/utils/confirm';

const ORDER = ['QUEUED', 'FETCHING', 'ANALYZING', 'RENDERING', 'DONE'];
const TAG: Record<Aspect, string> = { phone: '9x16', desktop: '16x9', square: '1x1', portrait: '4x5', original: 'original' };

export default function JobPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const { width } = useWindowDimensions();
  const desktop = useDesktop();

  /** Loads the job; keeps polling while it runs, and backs off (but keeps trying) when the network drops. */
  const poll = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    let failures = 0;
    const tick = async () => {
      let again = false;
      try {
        const r = await api<{ job: Job }>(`/jobs/${id}`);
        if (!alive.current) return;
        setJob(r.job);
        setError('');
        failures = 0;
        again = ACTIVE.includes(r.job.status);
      } catch (e) {
        if (!alive.current) return;
        setError(e instanceof Error ? e.message : 'Could not load this project');
        failures++;
        // A missing job will not come back; anything else (network, server restart) might
        again = !(e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 404) && failures < 20;
      }
      if (again && alive.current) timer.current = setTimeout(tick, failures ? Math.min(15000, 1500 * 2 ** failures) : 1500);
    };
    void tick();
  }, [id]);

  useEffect(() => {
    alive.current = true;
    poll();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

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

  if (!job) {
    return (
      <Screen title="Project" right={<BackButton />} wide>
        {error ? (
          <Notice tone="danger">{error}</Notice>
        ) : (
          <View style={{ gap: space.lg }}>
            <Skeleton style={{ height: 180, borderRadius: radius.xl }} />
            <View style={{ flexDirection: 'row', gap: space.md }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} style={{ flex: 1, height: 320, borderRadius: radius.lg }} />
              ))}
            </View>
          </View>
        )}
      </Screen>
    );
  }

  const running = ACTIVE.includes(job.status);
  const ai = job.options.mode === 'ai';
  const step = ORDER.indexOf(job.status);
  const aspect = job.options.aspect;
  const steps = ai
    ? ['Send to AI', 'Find viral moments', 'Save clips', 'Ready']
    : job.options.mode === 'highlights'
      ? ['Download', 'Find best moments', 'Render', 'Ready']
      : ['Download', 'Read video', 'Render', 'Ready'];
  // Grid: tall phone clips sit several to a row; wide desktop clips get more room
  // This page has no side rail; the page pads 40 px a side on desktop
  const content = Math.min(desktop ? width - 80 : width - space.lg * 2, 1320 - 80);
  const tall = ai || aspect === 'phone' || aspect === 'portrait';
  const target = tall ? 250 : aspect === 'desktop' ? 400 : 320;
  const cols = Math.max(desktop ? 2 : 1, Math.floor((content + space.lg) / (target + space.lg)));
  const cardW = Math.floor((content - space.lg * (cols - 1)) / cols);
  const slug = slugOf(job.title);
  const clips = ai ? [...job.clips].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) : job.clips;
  const cover = job.cover ? mediaUrl(job.cover) : null;

  const reclip = (to: Aspect) =>
    act('reclip', async () => {
      const r = await api<{ job: Job }>(`/jobs/${job.id}/reclip`, { body: { options: { ...job.options, mode: ai ? 'highlights' : job.options.mode, aspect: to } } });
      router.replace(`/job/${r.job.id}`);
    });

  return (
    <Screen hideHeader wide>
      <View style={styles.topBar}>
        <BackButton />
        <Text variant="label" color={colors.textMuted}>
          Projects / <Text variant="label">{job.title.slice(0, 48)}</Text>
        </Text>
      </View>

      {/* ── Header ── */}
      <View style={[styles.header, !desktop && { flexDirection: 'column' }]}>
        <Glow color={ai ? colors.brand : '#C8FF2E'} size={520} opacity={0.18} style={{ top: -260, left: -120 }} />
        <View style={[styles.cover, !desktop && { width: '100%' }]}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Ionicons name="film-outline" size={30} color={colors.textDim} />}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={StyleSheet.absoluteFill} />
          {job.sourceDuration ? (
            <View style={styles.coverDur}>
              <Text variant="label" color="#FFFFFF" style={{ fontFamily: fonts.semibold }}>
                {clock(job.sourceDuration)}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: space.md, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusPill status={job.status} />
            {ai ? <Badge tone="ai" icon="sparkles">AI · OpusClip</Badge> : <Badge>{{ split: 'Split evenly', highlights: 'Best moments', custom: 'Exact ranges', ai: 'AI' }[job.options.mode]}</Badge>}
            {!ai ? <Badge>{{ phone: '9:16', desktop: '16:9', square: '1:1', portrait: '4:5', original: 'Original' }[aspect]}</Badge> : null}
          </View>
          <Text variant="display" numberOfLines={2} style={{ fontSize: desktop ? 28 : 22, lineHeight: desktop ? 34 : 28 }}>
            {job.title}
          </Text>
          <Text variant="bodySm" color={colors.textMuted}>
            {[job.uploader, job.sourceKind === 'UPLOAD' ? 'Uploaded file' : null, job.status === 'DONE' ? `${job.clips.length} clips · ${bytes(job.totalBytes)}` : job.stage].filter(Boolean).join(' · ')}
          </Text>

          {running ? (
            <View style={{ gap: 10 }}>
              <ProgressBar value={job.progress} tone={ai ? 'ai' : 'lime'} height={10} />
              <View style={styles.steps}>
                {steps.map((label, i) => {
                  const done = step > i + 1;
                  const now = step === i + 1 || (i === 0 && step === 0);
                  return (
                    <View key={label} style={styles.step}>
                      <View style={[styles.stepDot, done && { backgroundColor: colors.success, borderColor: colors.success }, now && { borderColor: ai ? colors.brand : colors.text }]}>
                        {done ? <Ionicons name="checkmark" size={11} color="#06120B" /> : now ? <View style={[styles.stepNow, { backgroundColor: ai ? colors.brand : colors.text }]} /> : null}
                      </View>
                      <Text variant="label" color={now ? colors.text : colors.textMuted} style={now ? { fontFamily: fonts.semibold } : undefined}>
                        {label}
                      </Text>
                    </View>
                  );
                })}
                <Text variant="mono" color={colors.textMuted} style={{ marginLeft: 'auto' }}>
                  {job.progress}%
                </Text>
              </View>
              {ai ? (
                <Text variant="label" color={colors.textMuted} style={{ fontFamily: fonts.regular }}>
                  OpusClip usually needs a few minutes per 10 minutes of video. You can leave this page; the project keeps going.
                </Text>
              ) : null}
            </View>
          ) : null}
          {job.status === 'FAILED' && job.error ? <Notice tone="danger">{job.error}</Notice> : null}
          {error ? <Notice tone="warning">{error}</Notice> : null}

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
                    poll();
                  })
                }
              />
            ) : null}
            {job.status === 'DONE' && !ai && aspect !== 'desktop' ? <Button label="Desktop version" variant="secondary" icon="desktop-outline" loading={busy === 'reclip'} onPress={() => void reclip('desktop')} /> : null}
            {job.status === 'DONE' && !ai && aspect !== 'phone' ? <Button label="Phone version" variant="secondary" icon="phone-portrait-outline" loading={busy === 'reclip'} onPress={() => void reclip('phone')} /> : null}
            {job.sourceUrl ? <IconButton icon="open-outline" label="Open the original video" onPress={() => void Linking.openURL(job.sourceUrl!)} /> : null}
            <IconButton
              icon="trash-outline"
              tone="danger"
              label="Delete project"
              onPress={() =>
                void act('delete', async () => {
                  if (!(await confirm('Delete this project and all its clips?'))) return;
                  await api(`/jobs/${job.id}`, { method: 'DELETE' });
                  router.replace('/library');
                })
              }
            />
          </View>
        </View>
      </View>

      {/* ── Clips ── */}
      {clips.length ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text variant="h1">{ai ? 'Ranked by virality' : 'Clips'}</Text>
            <Badge>{clips.length}</Badge>
          </View>
          <View style={styles.grid}>
            {clips.map((c, i) => (
              <ClipCard
                key={c.id}
                clip={c}
                width={cardW}
                rank={ai ? i + 1 : undefined}
                onOpen={() => router.push(`/clip/${job.id}/${c.id}`)}
                onDownload={() => void act(`dl${c.id}`, () => saveFile(c.downloadUrl, `${slug}-clip-${String(c.index).padStart(2, '0')}-${ai ? 'ai' : TAG[aspect]}.mp4`))}
                onDelete={() =>
                  void act(`del${c.id}`, async () => {
                    if (!(await confirm(`Delete clip ${c.index}?`))) return;
                    setJob((await api<{ job: Job }>(`/jobs/${job.id}/clips/${c.id}`, { method: 'DELETE' })).job);
                  })
                }
              />
            ))}
          </View>
        </>
      ) : running ? (
        <View style={styles.grid}>
          {Array.from({ length: Math.min(cols, 4) }, (_, i) => (
            <Skeleton key={i} style={{ width: cardW, height: tall ? cardW * 1.6 : cardW * 0.7, borderRadius: radius.lg }} />
          ))}
        </View>
      ) : job.status === 'DONE' ? (
        <Empty icon="film-outline" title="No clips left" hint="All clips of this project were deleted." />
      ) : null}
    </Screen>
  );
}

function BackButton() {
  return <IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))} />;
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  header: { flexDirection: 'row', gap: space.xl, padding: space.xl, borderRadius: radius.xxl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cover: { width: 320, aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  coverDur: { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  steps: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap', alignItems: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  stepNow: { width: 8, height: 8, borderRadius: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, alignItems: 'flex-start' },
});
