import { memo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { mediaUrl } from '../api/client';
import { ACTIVE, type Job } from '../api/types';
import { colors, fonts, gradients, radius, space } from '../theme';
import { ago, clock } from '../utils/format';
import { Text } from './Text';
import { Badge, ProgressBar, StatusPill } from './ui';

const VIEW: Record<string, string> = { phone: '9:16', desktop: '16:9', square: '1:1', portrait: '4:5', original: 'Original' };
const MODE: Record<string, string> = { split: 'Split', highlights: 'Best moments', custom: 'Custom', ai: 'AI clips' };

/** A project (one source video) in a grid: cover, status, progress while it runs. */
export const ProjectCard = memo(function ProjectCard({ job }: { job: Job }) {
  const [hover, setHover] = useState(false);
  const cover = job.cover ? mediaUrl(job.cover) : null;
  const running = ACTIVE.includes(job.status);
  const ai = job.options.mode === 'ai';
  return (
    <Pressable
      onPress={() => router.push(`/job/${job.id}`)}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={(s) => [styles.card, hover && styles.hover, s.pressed && { transform: [{ scale: 0.99 }] }]}
      accessibilityRole="link"
      accessibilityLabel={job.title}
    >
      <View style={styles.cover}>
        {cover ? <Image source={{ uri: cover }} style={[StyleSheet.absoluteFill, hover && { transform: [{ scale: 1.05 }] }]} resizeMode="cover" /> : <Ionicons name="film-outline" size={30} color={colors.textDim} />}
        <LinearGradient colors={gradients.scrim} start={{ x: 0, y: 0.35 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.topRow}>
          {ai ? <Badge tone="ai" icon="sparkles">AI</Badge> : <Badge tone="dark">{MODE[job.options.mode]}</Badge>}
          <Badge tone="dark">{VIEW[job.options.aspect]}</Badge>
        </View>
        <View style={styles.bottomRow}>
          {job.status === 'DONE' ? (
            <View style={styles.count}>
              <Ionicons name="film" size={12} color={colors.onHighlight} />
              <Text variant="label" color={colors.onHighlight} style={{ fontFamily: fonts.bold }}>
                {job.clipCount} clips
              </Text>
            </View>
          ) : (
            <StatusPill status={job.status} />
          )}
          {job.sourceDuration ? (
            <Text variant="label" color="rgba(255,255,255,0.85)" style={{ marginLeft: 'auto', fontFamily: fonts.semibold }}>
              {clock(job.sourceDuration)}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ gap: 6, padding: space.md }}>
        <Text variant="title" numberOfLines={2} style={{ minHeight: 40 }}>
          {job.title}
        </Text>
        {running ? (
          <View style={{ gap: 6 }}>
            <ProgressBar value={job.progress} tone={ai ? 'ai' : 'lime'} height={5} />
            <Text variant="label" color={colors.textMuted} numberOfLines={1} style={{ fontFamily: fonts.regular }}>
              {job.stage ?? 'Waiting'} · {job.progress}%
            </Text>
          </View>
        ) : job.status === 'FAILED' && job.error ? (
          <Text variant="label" color={colors.danger} numberOfLines={2} style={{ fontFamily: fonts.regular }}>
            {job.error}
          </Text>
        ) : (
          <Text variant="label" color={colors.textMuted} style={{ fontFamily: fonts.regular }}>
            {[job.uploader, ago(job.createdAt)].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flexGrow: 1, flexBasis: 260, maxWidth: 420, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  hover: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceAlt },
  cover: { aspectRatio: 16 / 9, backgroundColor: colors.surfaceHigh, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  topRow: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', gap: 6 },
  bottomRow: { position: 'absolute', bottom: 10, left: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.highlight, paddingHorizontal: 8, height: 24, borderRadius: 12 },
});
