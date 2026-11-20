import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { Button, IconButton } from '../../src/components/Button';
import { Text } from '../../src/components/Text';
import { Badge, Card, Empty, Notice, Screen, SectionTitle, Stat } from '../../src/components/ui';
import { Segmented } from '../../src/components/Segmented';
import { api, mediaUrl } from '../../src/api/client';
import type { PostStatus, ScheduledPost } from '../../src/api/types';
import { colors, fonts, radius, space } from '../../src/theme';
import { useDesktop } from '../../src/theme/desktop';
import { PLATFORMS } from '../../src/utils/platforms';
import { saveFile } from '../../src/utils/download';
import { confirm } from '../../src/utils/confirm';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const STATUS: Record<PostStatus, { label: string; color: string }> = {
  PLANNED: { label: 'Planned', color: colors.info },
  POSTED: { label: 'Posted', color: colors.success },
  SKIPPED: { label: 'Skipped', color: colors.textDim },
};

/** The six weeks shown for a month, starting on Monday. */
function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function PostRow({ p, onChange }: { p: ScheduledPost; onChange: () => void }) {
  const pf = PLATFORMS[p.platform];
  const [busy, setBusy] = useState('');
  const act = async (k: string, fn: () => Promise<unknown>) => {
    setBusy(k);
    try {
      await fn();
      onChange();
    } finally {
      setBusy('');
    }
  };
  const status = (s: PostStatus) => act(s, () => api(`/posts/${p.id}`, { method: 'PATCH', body: { status: s } }));
  return (
    <View style={[styles.post, p.status !== 'PLANNED' && { opacity: 0.7 }]}>
      <Pressable onPress={() => router.push(`/clip/${p.clip.jobId}/${p.clip.id}`)} style={styles.postThumb}>
        {p.clip.thumbUrl ? <Image source={{ uri: mediaUrl(p.clip.thumbUrl) }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      </Pressable>
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Ionicons name={pf.icon} size={14} color={pf.color} />
          <Text variant="label" style={{ fontFamily: fonts.semibold }}>
            {pf.label} · {time(p.scheduledAt)}
          </Text>
          <View style={[styles.statusDot, { backgroundColor: STATUS[p.status].color }]} />
          <Text variant="label" color={STATUS[p.status].color}>
            {STATUS[p.status].label}
          </Text>
        </View>
        <Text variant="title" numberOfLines={1}>
          {p.clip.title}
        </Text>
        {p.caption ? (
          <Text variant="label" color={colors.textMuted} numberOfLines={2} style={{ fontFamily: fonts.regular }}>
            {p.caption}
          </Text>
        ) : null}
        <View style={styles.postActions}>
          {p.status === 'PLANNED' ? <Button size="sm" label="Mark posted" icon="checkmark" loading={busy === 'POSTED'} onPress={() => void status('POSTED')} /> : <Button size="sm" variant="secondary" label="Back to planned" onPress={() => void status('PLANNED')} />}
          {p.status === 'PLANNED' ? <Button size="sm" variant="ghost" label="Skip" onPress={() => void status('SKIPPED')} /> : null}
          {p.caption ? <IconButton size={32} icon="copy-outline" label="Copy caption" onPress={() => void Clipboard.setStringAsync(p.caption)} /> : null}
          {p.clip.downloadUrl ? <IconButton size={32} icon="arrow-down" label="Download clip" onPress={() => void saveFile(p.clip.downloadUrl, `clip-${p.clip.index}.mp4`)} /> : null}
          <IconButton
            size={32}
            icon="trash-outline"
            tone="danger"
            label="Remove from calendar"
            onPress={() =>
              void act('del', async () => {
                if (await confirm('Remove this post from the calendar?')) await api(`/posts/${p.id}`, { method: 'DELETE' });
              })
            }
          />
        </View>
      </View>
    </View>
  );
}

/** Content calendar: plan clips per platform and day, then tick them off as you post. */
export default function Calendar() {
  const desktop = useDesktop();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [posts, setPosts] = useState<ScheduledPost[] | null>(null);
  const [view, setView] = useState<'month' | 'list'>('month');
  const [day, setDay] = useState(() => key(new Date()));
  const [error, setError] = useState('');
  const grid = useMemo(() => monthGrid(month), [month]);

  const load = useCallback(async () => {
    try {
      const from = grid[0]!;
      const to = new Date(grid[41]!);
      to.setDate(to.getDate() + 1);
      const r = await api<{ posts: ScheduledPost[] }>(`/posts?from=${from.toISOString()}&to=${to.toISOString()}`);
      setPosts(r.posts);
      setError('');
    } catch (e) {
      setPosts([]);
      setError(e instanceof Error ? e.message : 'Could not load the calendar');
    }
  }, [grid]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const byDay = useMemo(() => {
    const m = new Map<string, ScheduledPost[]>();
    for (const p of posts ?? []) {
      const k = key(new Date(p.scheduledAt));
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [posts]);

  const today = key(new Date());
  const inMonth = (posts ?? []).filter((p) => new Date(p.scheduledAt).getMonth() === month.getMonth());
  const upcoming = (posts ?? []).filter((p) => p.status === 'PLANNED' && new Date(p.scheduledAt) >= new Date(new Date().setHours(0, 0, 0, 0)));
  const selected = byDay.get(day) ?? [];
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const label = month.toLocaleDateString([], { month: 'long', year: 'numeric' });

  return (
    <Screen
      eyebrow="Publish"
      title="Content calendar"
      subtitle="Plan which clip goes where and when. Open a clip and press Schedule to add it."
      right={<Button label="Schedule a clip" icon="add" onPress={() => router.navigate('/library')} />}
      wide
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={styles.stats}>
        <Stat icon="calendar-outline" label={`Planned in ${month.toLocaleDateString([], { month: 'long' })}`} value={inMonth.filter((p) => p.status === 'PLANNED').length} tone="ai" />
        <Stat icon="checkmark-done-outline" label="Posted this month" value={inMonth.filter((p) => p.status === 'POSTED').length} tone="lime" />
        <Stat icon="time-outline" label="Coming up" value={upcoming.length} />
      </View>

      <View style={styles.bar}>
        <IconButton icon="chevron-back" label="Previous month" onPress={() => shift(-1)} />
        <Text variant="h1" style={{ minWidth: 200, textAlign: 'center' }}>
          {label}
        </Text>
        <IconButton icon="chevron-forward" label="Next month" onPress={() => shift(1)} />
        <Button
          label="Today"
          size="sm"
          variant="secondary"
          onPress={() => {
            setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
            setDay(today);
          }}
        />
        <View style={{ flex: 1 }} />
        <Segmented value={view} onChange={setView} options={[{ value: 'month', label: 'Month', icon: 'calendar-outline' }, { value: 'list', label: 'Upcoming', icon: 'list-outline' }]} />
      </View>

      {view === 'month' ? (
        <View style={[styles.cols, !desktop && { flexDirection: 'column' }]}>
          <Card padded={false} style={{ flex: 1, minWidth: 0, gap: 0 }}>
            <View style={styles.week}>
              {DAYS.map((d) => (
                <Text key={d} variant="overline" color={colors.textDim} style={styles.dow}>
                  {desktop ? d : d[0]}
                </Text>
              ))}
            </View>
            <View style={styles.month}>
              {grid.map((d) => {
                const k = key(d);
                const list = byDay.get(k) ?? [];
                const other = d.getMonth() !== month.getMonth();
                const on = k === day;
                return (
                  <Pressable key={k} onPress={() => setDay(k)} style={(s) => [styles.cell, { minHeight: desktop ? 104 : 56 }, other && { opacity: 0.4 }, on && styles.cellOn, (s as { hovered?: boolean }).hovered && !on && { backgroundColor: colors.surfaceAlt }]}>
                    <View style={[styles.num, k === today && { backgroundColor: colors.highlight }]}>
                      <Text variant="label" color={k === today ? colors.onHighlight : colors.text} style={{ fontFamily: fonts.semibold }}>
                        {d.getDate()}
                      </Text>
                    </View>
                    {desktop ? (
                      list.slice(0, 3).map((p) => (
                        <View key={p.id} style={[styles.chip, { borderLeftColor: PLATFORMS[p.platform].color }, p.status === 'POSTED' && { opacity: 0.55 }]}>
                          <Ionicons name={PLATFORMS[p.platform].icon} size={10} color={PLATFORMS[p.platform].color} />
                          <Text variant="label" numberOfLines={1} style={{ fontSize: 11, flex: 1 }}>
                            {time(p.scheduledAt)} {p.clip.title}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {list.slice(0, 4).map((p) => (
                          <View key={p.id} style={[styles.dot, { backgroundColor: PLATFORMS[p.platform].color }]} />
                        ))}
                      </View>
                    )}
                    {desktop && list.length > 3 ? (
                      <Text variant="label" color={colors.textMuted} style={{ fontSize: 11 }}>
                        +{list.length - 3} more
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Card>
          <View style={[{ gap: space.md }, desktop && { width: 380 }]}>
            <SectionTitle hint={selected.length ? `${selected.length} post${selected.length === 1 ? '' : 's'}` : 'Nothing planned'}>
              {(() => {
                const [y, m, dd] = day.split('-').map(Number);
                return new Date(y!, m!, dd!).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
              })()}
            </SectionTitle>
            {selected.map((p) => (
              <PostRow key={p.id} p={p} onChange={() => void load()} />
            ))}
            {!selected.length ? (
              <View style={styles.free}>
                <Ionicons name="sparkles-outline" size={18} color={colors.textMuted} />
                <Text variant="bodySm" color={colors.textMuted} style={{ flex: 1 }}>
                  A free slot. Pick a ready clip from Projects and press Schedule.
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : upcoming.length ? (
        <View style={{ gap: space.md }}>
          {upcoming.map((p) => (
            <PostRow key={p.id} p={p} onChange={() => void load()} />
          ))}
        </View>
      ) : (
        <Empty icon="calendar-outline" title="Nothing coming up" hint="Open a clip and press Schedule to plan it for TikTok, Reels, Shorts, X, Facebook or LinkedIn." action={<Button label="Open projects" icon="albums-outline" onPress={() => router.navigate('/library')} />} />
      )}

      <View style={styles.legend}>
        {Object.entries(PLATFORMS).map(([k, p]) => (
          <Badge key={k} icon={p.icon}>
            {p.label} · {p.shape}
          </Badge>
        ))}
      </View>
      <Text variant="label" color={colors.textDim} style={{ fontFamily: fonts.regular }}>
        The calendar plans and reminds; it does not post for you. Publish from each app, then mark the post as posted.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  cols: { flexDirection: 'row', gap: space.xl, alignItems: 'flex-start' },
  week: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  dow: { flex: 1, textAlign: 'center', paddingVertical: 10 },
  month: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, padding: 6, gap: 3, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'stretch' },
  cellOn: { backgroundColor: colors.brandSoft },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.surfaceHigh, borderLeftWidth: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  post: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  postThumb: { width: 54, height: 96, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceHigh },
  postActions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginLeft: 4 },
  free: { flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
