import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { mediaUrl } from '../api/client';
import type { Publication, PublicationStatus } from '../api/types';
import { colors, fonts, radius, space } from '../theme';
import { PLATFORM } from '../social/platforms';
import { ago } from '../utils/format';
import { AccountAvatar } from './PlatformBadge';
import { Text } from './Text';
import { ProgressBar } from './ui';

type Icon = keyof typeof Ionicons.glyphMap;
const STATUS: Record<PublicationStatus | 'SCHEDULED', { label: string; color: string; bg: string; icon: Icon }> = {
  SCHEDULED: { label: 'Scheduled', color: colors.accent, bg: colors.accentSoft, icon: 'calendar-outline' },
  QUEUED: { label: 'Waiting', color: colors.textMuted, bg: colors.surfaceAlt, icon: 'time-outline' },
  PUBLISHING: { label: 'Posting', color: colors.info, bg: colors.infoSoft, icon: 'cloud-upload-outline' },
  PUBLISHED: { label: 'Posted', color: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' },
  FAILED: { label: 'Failed', color: colors.danger, bg: colors.dangerSoft, icon: 'alert-circle' },
  CANCELLED: { label: 'Cancelled', color: colors.textMuted, bg: colors.surfaceAlt, icon: 'close-circle-outline' },
};

/** "today 18:30", "tomorrow 09:00", "Fri 21 Nov 09:00" */
export function dayTime(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

/** One post: which clip, to which account, how it is going, and what can be done about it. */
export function PostRow({ post, onRetry, onCancel, onRemove, compact }: { post: Publication; onRetry?: () => void; onCancel?: () => void; onRemove?: () => void; compact?: boolean }) {
  const s = STATUS[post.scheduled ? 'SCHEDULED' : post.status];
  const waiting = post.status === 'QUEUED' || post.status === 'PUBLISHING';
  return (
    <View style={styles.row}>
      {!compact ? (
        <View style={styles.thumb}>
          {post.clip?.thumbUrl ? <Image source={{ uri: mediaUrl(post.clip.thumbUrl) }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Ionicons name="film-outline" size={18} color={colors.textDim} />}
        </View>
      ) : null}
      <AccountAvatar account={post.account} size={compact ? 32 : 36} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="title" numberOfLines={1} style={{ fontFamily: fonts.semibold }}>
          {compact && post.clip ? `Clip ${post.clip.index} → ${post.account.name}` : post.title}
        </Text>
        <View style={styles.meta}>
          <View style={[styles.pill, { backgroundColor: s.bg }]}>
            <Ionicons name={s.icon} size={12} color={s.color} />
            <Text variant="label" color={s.color} fixedColor style={{ fontFamily: fonts.semibold, fontSize: 12 }}>
              {s.label}
            </Text>
          </View>
          <Text variant="label" color={colors.textMuted} numberOfLines={1} style={{ flexShrink: 1 }}>
            {compact ? '' : `${PLATFORM[post.account.platform].label} · ${post.account.name} · `}
            {post.scheduled ? dayTime(post.runAt) : post.status === 'PUBLISHED' && post.publishedAt ? ago(post.publishedAt) : post.status === 'PUBLISHING' ? `${post.progress}%` : ago(post.createdAt)}
          </Text>
        </View>
        {post.status === 'PUBLISHING' ? <ProgressBar value={post.progress} color={colors.info} /> : null}
        {post.error && post.status !== 'PUBLISHED' && post.status !== 'CANCELLED' ? (
          <Text variant="label" color={post.status === 'FAILED' ? colors.danger : colors.warning} numberOfLines={3}>
            {post.error}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {post.externalUrl ? (
          <Pressable onPress={() => void Linking.openURL(post.externalUrl!)} style={styles.btn} hitSlop={6} accessibilityLabel={`Open the post on ${PLATFORM[post.account.platform].label}`}>
            <Ionicons name="open-outline" size={17} color={colors.text} />
          </Pressable>
        ) : null}
        {onRetry && (post.status === 'FAILED' || post.status === 'CANCELLED') && post.clip ? (
          <Pressable onPress={onRetry} style={styles.btn} hitSlop={6} accessibilityLabel="Post again">
            <Ionicons name="refresh" size={17} color={colors.text} />
          </Pressable>
        ) : null}
        {onCancel && waiting ? (
          <Pressable onPress={onCancel} style={styles.btn} hitSlop={6} accessibilityLabel="Cancel this post">
            <Ionicons name="close" size={18} color={colors.text} />
          </Pressable>
        ) : null}
        {onRemove && !waiting ? (
          <Pressable onPress={onRemove} style={styles.btn} hitSlop={6} accessibilityLabel="Remove from this list">
            <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  thumb: { width: 40, height: 56, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 22, borderRadius: 11 },
  actions: { flexDirection: 'row', gap: 6 },
  btn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
});
