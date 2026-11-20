import { memo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, gradients, radius, space } from '../theme';
import { mediaUrl } from '../api/client';
import type { Clip } from '../api/types';
import { bytes, clock } from '../utils/format';
import { Text } from './Text';
import { ScoreRing } from './ui';

/** The video, only created once someone presses play (a page of 20 players would be heavy). */
function Player({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls allowsPictureInPicture />;
}

interface Props {
  clip: Clip;
  width: number;
  onDownload: () => void;
  onDelete?: () => void;
  onOpen?: () => void;
  /** Rank shown on AI clips ("#1" is the best). */
  rank?: number;
}

/** One clip: thumbnail at its true shape, virality ring, hover actions, AI headline under it. */
export const ClipCard = memo(function ClipCard({ clip, onDownload, onDelete, onOpen, width, rank }: Props) {
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState(false);
  const ratio = clip.width / clip.height;
  // Tall clips are capped in height so a grid stays tidy
  const height = Math.min(width / ratio, width * 1.78);
  return (
    <View style={[styles.card, { width }]} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <View style={[styles.media, { height }]}>
        {playing ? (
          <Player uri={mediaUrl(clip.videoUrl)} />
        ) : (
          <Pressable onPress={() => setPlaying(true)} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={`Play clip ${clip.index}`}>
            {clip.thumbUrl ? <Image source={{ uri: mediaUrl(clip.thumbUrl) }} style={[StyleSheet.absoluteFill, hover && { transform: [{ scale: 1.04 }] }]} resizeMode="cover" /> : null}
            <LinearGradient colors={gradients.scrim} start={{ x: 0, y: 0.45 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={[styles.play, hover && styles.playHover]}>
              <Ionicons name="play" size={22} color={hover ? colors.onHighlight : '#FFFFFF'} style={{ marginLeft: 3 }} />
            </View>
            {rank ? (
              <View style={styles.rank}>
                <Text variant="label" color="#FFFFFF" style={{ fontFamily: fonts.bold }}>
                  #{rank}
                </Text>
              </View>
            ) : null}
            {clip.score !== null ? (
              <View style={styles.score}>
                <ScoreRing score={clip.score} size={46} />
              </View>
            ) : null}
            <View style={styles.bottom}>
              <View style={styles.dur}>
                <Ionicons name="time-outline" size={11} color="#FFFFFF" />
                <Text variant="label" color="#FFFFFF" style={{ fontFamily: fonts.semibold, fontSize: 11.5 }}>
                  {clock(clip.duration)}
                </Text>
              </View>
            </View>
          </Pressable>
        )}
      </View>
      <View style={styles.meta}>
        <Pressable style={{ gap: 3 }} onPress={onOpen} disabled={!onOpen} accessibilityRole={onOpen ? 'link' : undefined}>
          <Text variant="title" numberOfLines={2}>
            {clip.title || `Clip ${clip.index}`}
          </Text>
          {clip.hashtags ? (
            <Text variant="label" color={colors.brand} numberOfLines={1}>
              {clip.hashtags}
            </Text>
          ) : null}
        </Pressable>
        <View style={styles.metaRow}>
          <Text variant="label" color={colors.textMuted} numberOfLines={1} style={{ flex: 1, fontFamily: fonts.regular }}>
            {clock(clip.startSec)}–{clock(clip.endSec)} · {bytes(clip.sizeBytes)}
          </Text>
          {onOpen ? (
            <Pressable onPress={onOpen} hitSlop={6} accessibilityLabel={`Open clip ${clip.index}`} style={styles.iconBtn}>
              <Ionicons name="expand-outline" size={15} color={colors.text} />
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable onPress={onDelete} hitSlop={6} accessibilityLabel={`Delete clip ${clip.index}`} style={styles.iconBtn}>
              <Ionicons name="trash-outline" size={15} color={colors.textMuted} />
            </Pressable>
          ) : null}
          <Pressable onPress={onDownload} hitSlop={6} accessibilityLabel={`Download clip ${clip.index}`} style={[styles.iconBtn, { backgroundColor: colors.highlight, borderColor: colors.highlight }]}>
            <Ionicons name="arrow-down" size={16} color={colors.onHighlight} />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  media: { backgroundColor: '#000', width: '100%', overflow: 'hidden' },
  play: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -25,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playHover: { backgroundColor: colors.highlight, borderColor: colors.highlight, transform: [{ scale: 1.08 }] },
  rank: { position: 'absolute', left: 10, top: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  score: { position: 'absolute', right: 8, top: 8 },
  bottom: { position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center' },
  dur: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  meta: { gap: space.sm, padding: space.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border },
});
