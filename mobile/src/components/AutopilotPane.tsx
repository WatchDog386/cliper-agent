import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../api/client';
import type { AppConfig, Campaign, ClipOptions, SocialAccount } from '../api/types';
import { useDraft } from '../store/draft';
import { colors, fonts, radius, space } from '../theme';
import { ago } from '../utils/format';
import { AccountPicker } from './AccountPicker';
import { Button } from './Button';
import { Input } from './Input';
import { dayTime } from './PostRow';
import { Text } from './Text';
import { Card, Chips, Empty, Notice, SectionTitle, Spinner } from './ui';

function confirm(message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert('Are you sure?', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Yes', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

/** The clip settings in a few words. */
export function describeOptions(o: ClipOptions) {
  return [
    o.mode === 'highlights' ? 'best moments' : 'split evenly',
    o.segmentSeconds < 60 ? `${o.segmentSeconds}s clips` : `${Math.round(o.segmentSeconds / 6) / 10} min clips`,
    `up to ${o.maxClips} per video`,
    o.aspect === 'original' ? 'original shape' : `${o.aspect} view`,
    o.captions ? 'captions' : null,
    o.hook !== 'none' ? 'hook title' : null,
    o.credit ? 'creator credit' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Autopilot: standing orders. "Every 6 hours, find the best new GTA 6 videos and clip the top 3", with
 * the clip settings from the Create tab, optionally posting the results on their own.
 */
export function AutopilotPane({ topic }: { topic: string }) {
  const draft = useDraft();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The new-campaign form
  const [name, setName] = useState('');
  const [what, setWhat] = useState(topic || 'GTA 6');
  const [sources, setSources] = useState<('youtube' | 'twitch')[]>(['youtube', 'twitch']);
  const [days, setDays] = useState(3);
  const [minViews, setMinViews] = useState(100_000);
  const [perRun, setPerRun] = useState(3);
  const [every, setEvery] = useState(6);
  const [postTo, setPostTo] = useState<string[]>([]);
  const [spacing, setSpacing] = useState(60);

  useEffect(() => {
    if (topic) setWhat(topic);
  }, [topic]);

  const load = useCallback(async () => {
    const r = await api<{ campaigns: Campaign[] }>('/campaigns');
    setCampaigns(r.campaigns);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      api<AppConfig>('/config').then(setConfig, () => undefined);
      api<{ accounts: SocialAccount[] }>('/social/accounts').then((r) => alive && setAccounts(r.accounts), () => undefined);
      const tick = async () => {
        await load().catch((e) => alive && setNotice({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not load campaigns' }));
        if (alive) timer.current = setTimeout(tick, 30000);
      };
      void tick();
      return () => {
        alive = false;
        if (timer.current) clearTimeout(timer.current);
      };
    }, [load]),
  );

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice({ tone: 'danger', text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setBusy('');
    }
  };

  // A campaign cannot use hand-typed time ranges: those belong to one video
  const options: ClipOptions = { ...draft.options, mode: draft.options.mode === 'custom' ? 'highlights' : draft.options.mode, startAt: undefined, endAt: undefined, ranges: undefined, topic: what.trim() || undefined };

  const create = () =>
    act('create', async () => {
      const toggled = sources.length ? sources : (['youtube'] as const);
      await api('/campaigns', {
        body: {
          name: name.trim() || `${what.trim()} clips`,
          topic: what.trim(),
          sources: toggled,
          days,
          minViews,
          maxMinutes: 60,
          videosPerRun: perRun,
          everyHours: every,
          options,
          autoPublish: postTo.length ? { accountIds: postTo, caption: '', privacy: 'public', everyMinutes: spacing } : null,
        },
      });
      setName('');
      setNotice({ tone: 'info', text: `Autopilot started for “${what.trim()}”. Its first run is happening now: clips will appear under My clips.` });
      await load();
    });

  const toggleSource = (s: 'youtube' | 'twitch') => setSources((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      {campaigns === null ? (
        <Spinner />
      ) : campaigns.length === 0 ? (
        <Card>
          <Empty icon="rocket-outline" title="No autopilot running yet" hint="Set one up below: the agent then finds the best new videos on a topic, clips them with your settings, and posts them if you choose accounts." />
        </Card>
      ) : (
        campaigns.map((c) => (
          <Card key={c.id}>
            <View style={styles.head}>
              <View style={[styles.dot, { backgroundColor: c.enabled ? colors.success : colors.textDim }]} />
              <View style={{ flex: 1 }}>
                <Text variant="h2" style={{ fontFamily: fonts.bold }}>
                  {c.name}
                </Text>
                <Text variant="label" color={colors.textMuted}>
                  “{c.topic}” on {c.sources.join(' + ')} · top {c.videosPerRun} every {c.everyHours} h · {c.videosTaken} video{c.videosTaken === 1 ? '' : 's'} clipped
                </Text>
              </View>
              <Switch
                value={c.enabled}
                onValueChange={(enabled) => void act(`sw${c.id}`, async () => void (await api(`/campaigns/${c.id}`, { method: 'PATCH', body: { enabled } }), await load()))}
                trackColor={{ true: colors.brand, false: colors.surfaceHigh }}
                thumbColor="#FFFFFF"
                accessibilityLabel={`${c.name} on or off`}
              />
            </View>
            <Text variant="bodySm" color={colors.textMuted}>
              {describeOptions(c.options)}
              {c.autoPublish ? ` · posts to ${c.autoPublish.accountIds.length} account${c.autoPublish.accountIds.length === 1 ? '' : 's'}` : ' · clips wait for you to post'}
            </Text>
            {c.lastNote ? (
              <View style={styles.note}>
                <Text variant="label" color={colors.textMuted}>
                  {c.lastRunAt ? `Last run ${ago(c.lastRunAt)}` : 'Not run yet'}
                  {c.enabled ? ` · next ${dayTime(c.nextRunAt)}` : ' · paused'}
                </Text>
                <Text variant="bodySm" numberOfLines={4}>
                  {c.lastNote}
                </Text>
              </View>
            ) : (
              <Text variant="label" color={colors.textMuted}>
                {c.enabled ? 'First run starting…' : 'Paused'}
              </Text>
            )}
            {c.recent.length ? (
              <View>
                {c.recent.slice(0, 4).map((r) => (
                  <Pressable key={r.id} onPress={() => r.jobId && router.push(`/job/${r.jobId}`)} style={styles.item} accessibilityLabel={`Open the clips of ${r.title}`}>
                    <Ionicons name={r.platform === 'twitch' ? 'logo-twitch' : 'logo-youtube'} size={15} color={r.platform === 'twitch' ? '#9146FF' : '#FF0033'} />
                    <Text variant="bodySm" numberOfLines={1} style={{ flex: 1 }}>
                      {r.creator ? `${r.creator} – ` : ''}
                      {r.title}
                    </Text>
                    <Ionicons name="chevron-forward" size={15} color={colors.textDim} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.actions}>
              <Button
                label="Run now"
                variant="secondary"
                icon="play-outline"
                loading={busy === `run${c.id}`}
                onPress={() =>
                  void act(`run${c.id}`, async () => {
                    const r = await api<{ note: string }>(`/campaigns/${c.id}/run`, { method: 'POST' });
                    setNotice({ tone: 'info', text: r.note });
                    await load();
                  })
                }
              />
              <Button
                label="Delete"
                variant="danger"
                icon="trash-outline"
                loading={busy === `del${c.id}`}
                onPress={() =>
                  void act(`del${c.id}`, async () => {
                    if (!(await confirm(`Delete “${c.name}”? The clips it already made are kept.`))) return;
                    await api(`/campaigns/${c.id}`, { method: 'DELETE' });
                    await load();
                  })
                }
              />
            </View>
          </Card>
        ))
      )}

      <Card>
        <SectionTitle hint="The agent looks for the best new videos on this topic, again and again">New autopilot</SectionTitle>
        <View style={styles.row2}>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Input label="Topic" value={what} onChangeText={setWhat} maxLength={80} placeholder="e.g. GTA 6" />
          </View>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Input label="Name (optional)" value={name} onChangeText={setName} maxLength={60} placeholder={`${what.trim() || 'Topic'} clips`} />
          </View>
        </View>

        <SectionTitle>Where to look</SectionTitle>
        <View style={styles.chips}>
          {(['youtube', 'twitch'] as const).map((s) => {
            const on = sources.includes(s);
            return (
              <Pressable key={s} onPress={() => toggleSource(s)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.chip, on && styles.chipOn]}>
                <Ionicons name={s === 'twitch' ? 'logo-twitch' : 'logo-youtube'} size={15} color={on ? '#FFFFFF' : colors.textMuted} />
                <Text variant="label" color={on ? '#FFFFFF' : colors.text} fixedColor style={{ fontFamily: fonts.semibold, fontSize: 14 }}>
                  {s === 'twitch' ? 'Twitch clips' : 'YouTube'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {sources.includes('twitch') && config && !config.features.twitch ? <Notice tone="warning">Twitch is not set up on this server yet (TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET), so only YouTube will be searched.</Notice> : null}
        {sources.includes('youtube') && config && !config.features.youtubeApi ? <Notice>Without a YouTube API key, YouTube is searched without dates or subscriber counts. Add YOUTUBE_API_KEY for proper “newest and biggest” ranking.</Notice> : null}

        <SectionTitle hint="Only videos at least this popular, published this recently">Which videos</SectionTitle>
        <Chips
          value={minViews}
          onChange={setMinViews}
          options={[
            { value: 0, label: 'Any views' },
            { value: 10_000, label: '10K+ views' },
            { value: 100_000, label: '100K+' },
            { value: 1_000_000, label: '1M+' },
          ]}
        />
        <Chips
          value={days}
          onChange={setDays}
          options={[
            { value: 1, label: 'Last 24 h' },
            { value: 3, label: 'Last 3 days' },
            { value: 7, label: 'Last week' },
          ]}
        />

        <SectionTitle>How often, how many</SectionTitle>
        <Chips
          value={every}
          onChange={setEvery}
          options={[
            { value: 1, label: 'Every hour' },
            { value: 3, label: 'Every 3 h' },
            { value: 6, label: 'Every 6 h' },
            { value: 12, label: 'Twice a day' },
            { value: 24, label: 'Daily' },
          ]}
        />
        <Chips value={perRun} onChange={setPerRun} options={[1, 2, 3, 5, 10].map((n) => ({ value: n, label: `${n} video${n === 1 ? '' : 's'} per run` }))} />

        <SectionTitle hint="Taken from the Create tab as it is set now">Clip settings</SectionTitle>
        <View style={styles.note}>
          <Text variant="bodySm">{describeOptions(options)}</Text>
        </View>
        <Button label="Change on the Create tab" variant="ghost" icon="options-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.navigate('/create')} />

        <SectionTitle hint={accounts.length ? 'Tick accounts to post every clip without you. Leave empty to review clips first.' : 'Connect accounts on the Channels tab to let autopilot post for you.'}>Post automatically</SectionTitle>
        {accounts.length ? <AccountPicker accounts={accounts} value={postTo} onChange={setPostTo} /> : null}
        {postTo.length ? (
          <Chips
            value={spacing}
            onChange={setSpacing}
            options={[
              { value: 0, label: 'All at once' },
              { value: 30, label: '30 min apart' },
              { value: 60, label: '1 hour apart' },
              { value: 180, label: '3 hours apart' },
            ]}
          />
        ) : null}

        <Button label="Start autopilot" icon="rocket-outline" size="lg" loading={busy === 'create'} disabled={what.trim().length < 2} onPress={() => void create()} />
        <Text variant="label" color={colors.textDim}>
          Only clip creators who allow it, and keep the credit on: it is their work.
        </Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  note: { gap: 4, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row2: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.glassBorder },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
});
