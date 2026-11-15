import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, radius, space } from '../theme';
import { mediaUrl } from '../api/client';
import type { Clip } from '../api/types';
import { bytes, clock } from '../utils/format';
import { Text } from './Text';

/** The video, only created once someone presses play (a page of 20 players would be heavy). */
function Player({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls allowsPictureInPicture />;
}

/** One clip: thumbnail at its true shape (phone clips are tall, desktop clips wide), play, download. */
export function ClipCard({ clip, onDownload, onDelete, width }: { clip: Clip; onDownload: () => void; onDelete?: () => void; width: number }) {
  const [playing, setPlaying] = useState(false);
  const ratio = clip.width / clip.height;
  // Tall clips are capped in height so a grid stays tidy
  const height = Math.min(width / ratio, width * 1.78);
  return (
    <View style={[styles.card, { width }]}>
      <View style={[styles.media, { height }]}>
        {playing ? (
          <Player uri={mediaUrl(clip.videoUrl)} />
        ) : (
          <Pressable onPress={() => setPlaying(true)} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={`Play clip ${clip.index}`}>
            {clip.thumbUrl ? <Image source={{ uri: mediaUrl(clip.thumbUrl) }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
            <View style={styles.play}>
              <Ionicons name="play" size={26} color="#FFFFFF" style={{ marginLeft: 3 }} />
            </View>
            <View style={styles.badge}>
              <Text variant="label" color="#FFFFFF" fixedColor style={{ fontFamily: fonts.semibold }}>
                {clock(clip.duration)}
              </Text>
            </View>
            {clip.score !== null ? (
              <View style={[styles.badge, styles.score]}>
                <Ionicons name="flame" size={12} color="#FFFFFF" />
                <Text variant="label" color="#FFFFFF" fixedColor style={{ fontFamily: fonts.semibold }}>
                  {Math.round(clip.score)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        )}
      </View>
      <View style={styles.meta}>
        <View style={{ flex: 1 }}>
          <Text variant="title" style={{ fontFamily: fonts.semibold }}>
            Clip {clip.index}
          </Text>
          <Text variant="label" color={colors.textMuted}>
            {clock(clip.startSec)}–{clock(clip.endSec)} · {clip.width}×{clip.height} · {bytes(clip.sizeBytes)}
          </Text>
        </View>
        {onDelete ? (
          <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel={`Delete clip ${clip.index}`} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
        <Pressable onPress={onDownload} hitSlop={8} accessibilityLabel={`Download clip ${clip.index}`} style={[styles.iconBtn, { backgroundColor: colors.brand }]}>
          <Ionicons name="download-outline" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, overflow: 'hidden' },
  media: { backgroundColor: '#000', width: '100%' },
  play: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -26,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  score: { right: undefined, left: 8, backgroundColor: 'rgba(255,77,94,0.9)' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
});
