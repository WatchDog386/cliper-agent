import { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, IconButton } from '../../../src/components/Button';
import { Text } from '../../../src/components/Text';
import { Badge, Card, Notice, Screen, ScoreRing, Skeleton } from '../../../src/components/ui';
import { api, DEMO, mediaUrl } from '../../../src/api/client';
import type { Clip, Job } from '../../../src/api/types';
import { colors, fonts, radius, space } from '../../../src/theme';
import { useDesktop } from '../../../src/theme/desktop';
import { bytes, clock } from '../../../src/utils/format';
import { saveFile, shareLink } from '../../../src/utils/download';
import { confirm, slugOf } from '../../../src/utils/confirm';

function Player({ clip }: { clip: Clip }) {
  const player = useVideoPlayer(mediaUrl(clip.videoUrl), (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls allowsPictureInPicture />;
}

/** One clip, big: player, AI headline / caption / hashtags, virality, download, share, prev / next. */
export default function ClipPage() {
  const { job: jobId, clip: clipId } = useLocalSearchParams<{ job: string; clip: string }>();
  const desktop = useDesktop();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api<{ job: Job }>(`/jobs/${jobId}`).then(
      (r) => setJob(r.job),
      (e) => setError(e instanceof Error ? e.message : 'Could not load this clip'),
    );
  }, [jobId]);

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/job/${jobId}`));

  if (!job) {
    return (
      <Screen title="Clip" right={<IconButton icon="arrow-back" label="Back" onPress={back} />}>
        {error ? <Notice tone="danger">{error}</Notice> : <Skeleton style={{ height: 520, borderRadius: radius.xl }} />}
      </Screen>
    );
  }

  const ai = job.options.mode === 'ai';
  const list = ai ? [...job.clips].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) : job.clips;
  const i = list.findIndex((c) => c.id === clipId);
  const clip = list[i];
  if (!clip) {
    return (
      <Screen title="Clip not found" right={<IconButton icon="arrow-back" label="Back" onPress={back} />}>
        <Notice tone="warning">This clip was deleted, or the link is wrong.</Notice>
        <Button label="Back to the project" icon="arrow-back" onPress={() => router.replace(`/job/${jobId}`)} style={{ alignSelf: 'flex-start' }} />
      </Screen>
    );
  }
  const prev = list[i - 1];
  const next = list[i + 1];
  const tall = clip.height > clip.width;
  const caption = [clip.title, clip.description, clip.hashtags].filter(Boolean).join('\n\n');
  const fileName = `${slugOf(job.title)}-clip-${String(clip.index).padStart(2, '0')}.mp4`;

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setNote('');
    try {
      await fn();
      if (done) setNote(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy('');
    }
  };

  const player = (
    <View style={[styles.stage, tall ? { aspectRatio: clip.width / clip.height, maxHeight: desktop ? 720 : 560 } : { aspectRatio: clip.width / clip.height }]}>
      {DEMO || !clip.videoUrl ? (
        <>
          {clip.thumbUrl ? <Image source={{ uri: mediaUrl(clip.thumbUrl) }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          <View style={styles.demoNote}>
            <Ionicons name="play-circle-outline" size={18} color="#FFFFFF" />
            <Text variant="label" color="#FFFFFF">
              Preview only in the demo
            </Text>
          </View>
        </>
      ) : (
        <Player key={clip.id} clip={clip} />
      )}
    </View>
  );

  const details = (
    <View style={{ flex: 1, gap: space.lg, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {ai ? <Badge tone="ai" icon="sparkles">AI clip · #{i + 1}</Badge> : <Badge>Clip {clip.index}</Badge>}
        <Badge icon="time-outline">{clock(clip.duration)}</Badge>
        <Badge>
          {clip.width}×{clip.height}
        </Badge>
        <Badge>{bytes(clip.sizeBytes)}</Badge>
      </View>
      <Text variant="display" style={{ fontSize: desktop ? 28 : 22, lineHeight: desktop ? 34 : 28 }}>
        {clip.title || `Clip ${clip.index} of ${job.title}`}
      </Text>
      {clip.score !== null ? (
        <Card style={styles.scoreCard}>
          <ScoreRing score={clip.score} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h2">{ai ? 'Virality score' : 'Energy score'}</Text>
            <Text variant="bodySm" color={colors.textMuted}>
              {clip.score >= 85 ? 'Top-tier hook. Post this one first.' : clip.score >= 70 ? 'Strong moment with a good chance to travel.' : 'Solid clip. Pair it with a sharp caption.'}
            </Text>
          </View>
        </Card>
      ) : null}
      {clip.description || clip.hashtags ? (
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="overline" color={colors.textMuted} style={{ flex: 1 }}>
              Post caption
            </Text>
            <Button label="Copy" size="sm" variant="secondary" icon="copy-outline" onPress={() => void run('copy', () => Clipboard.setStringAsync(caption), 'Caption copied')} />
          </View>
          {clip.description ? <Text variant="body">{clip.description}</Text> : null}
          {clip.hashtags ? (
            <Text variant="body" color={colors.brand} style={{ fontFamily: fonts.semibold }}>
              {clip.hashtags}
            </Text>
          ) : null}
        </Card>
      ) : null}
      <Card style={{ gap: space.sm }}>
        <Text variant="overline" color={colors.textMuted}>
          From the source
        </Text>
        <Text variant="body">
          {clock(clip.startSec)} → {clock(clip.endSec)} of “{job.title}”
        </Text>
      </Card>
      {note ? <Notice tone="success">{note}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={styles.actions}>
        <Button label="Download" icon="arrow-down" size="lg" loading={busy === 'dl'} onPress={() => void run('dl', () => saveFile(clip.downloadUrl, fileName))} />
        <Button label={Platform.OS === 'web' ? 'Share link' : 'Share'} variant="secondary" icon="share-outline" size="lg" onPress={() => void run('share', async () => (await shareLink(clip.videoUrl, clip.title || fileName)) === 'copied' && setNote('Link copied'))} />
        <IconButton
          icon="trash-outline"
          tone="danger"
          size={54}
          label="Delete clip"
          onPress={() =>
            void run('del', async () => {
              if (!(await confirm(`Delete clip ${clip.index}?`))) return;
              await api(`/jobs/${job.id}/clips/${clip.id}`, { method: 'DELETE' });
              router.replace(`/job/${job.id}`);
            })
          }
        />
      </View>
    </View>
  );

  return (
    <Screen hideHeader wide>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" label="Back" onPress={back} />
        <Text variant="label" color={colors.textMuted} style={{ flex: 1 }} numberOfLines={1}>
          {job.title}
        </Text>
        <IconButton icon="chevron-back" label="Previous clip" onPress={prev ? () => router.replace(`/clip/${job.id}/${prev.id}`) : undefined} />
        <Text variant="mono" color={colors.textMuted}>
          {i + 1} / {list.length}
        </Text>
        <IconButton icon="chevron-forward" label="Next clip" onPress={next ? () => router.replace(`/clip/${job.id}/${next.id}`) : undefined} />
      </View>
      <View style={[styles.cols, !desktop && { flexDirection: 'column' }]}>
        <View style={[{ alignItems: 'center' }, desktop ? { width: tall ? 420 : '58%' } : { width: '100%' }]}>{player}</View>
        {details}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cols: { flexDirection: 'row', gap: space.xxl, alignItems: 'flex-start' },
  stage: { width: '100%', borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#000', borderWidth: 1, borderColor: colors.border },
  demoNote: { position: 'absolute', bottom: 14, alignSelf: 'center', flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  scoreCard: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg },
  actions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'center' },
});
