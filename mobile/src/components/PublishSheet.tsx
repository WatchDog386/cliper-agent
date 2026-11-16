import { createElement, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../api/client';
import type { Clip, Privacy, Publication, SocialAccount, SocialProvider } from '../api/types';
import { colors, fonts, radius, space } from '../theme';
import { useDesktop } from '../theme/desktop';
import { PLATFORM, span } from '../social/platforms';
import { AccountPicker } from './AccountPicker';
import { Button } from './Button';
import { Input } from './Input';
import { Text } from './Text';
import { Chips, Notice, SectionTitle, Spinner } from './ui';

type When = 'now' | '1h' | '3h' | 'tomorrow' | 'custom';

/** "2026-11-20T18:30" (or with a space) → a date in this device's time zone. */
function parseLocal(text: string): Date | null {
  const d = new Date(text.trim().replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function whenDate(when: When, custom: string): Date | null | undefined {
  const now = Date.now();
  if (when === 'now') return undefined;
  if (when === '1h') return new Date(now + 3600_000);
  if (when === '3h') return new Date(now + 3 * 3600_000);
  if (when === 'tomorrow') {
    const d = new Date(now + 86_400_000);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  return parseLocal(custom);
}

/** A date-and-time field: the browser's own picker on the web, a typed date on phones. */
function DateTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'datetime-local',
      value,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: {
        height: 44,
        borderRadius: 999,
        border: `1px solid ${colors.borderStrong}`,
        padding: '0 16px',
        background: colors.surfaceAlt,
        color: colors.text,
        fontFamily: 'inherit',
        fontSize: 14,
        colorScheme: colors.text === '#15161A' ? 'light' : 'dark',
      },
    });
  }
  return <TextInput value={value} onChangeText={onChange} placeholder="2026-12-31 18:30" placeholderTextColor={colors.textDim} style={styles.date} autoCapitalize="none" />;
}

/**
 * Post one or more clips to connected accounts: pick the accounts, write the text, post now or
 * schedule. With several clips, {n} in the text becomes each clip's number and they can be spaced out.
 */
export function PublishSheet({ visible, clips, jobTitle, onClose, onDone }: { visible: boolean; clips: Clip[]; jobTitle: string; onClose: () => void; onDone: (made: Publication[]) => void }) {
  const desktop = useDesktop();
  const many = clips.length > 1;
  const [accounts, setAccounts] = useState<SocialAccount[] | null>(null);
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [when, setWhen] = useState<When>('now');
  const [custom, setCustom] = useState('');
  const [every, setEvery] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    setTitle(many ? `${jobTitle} ({n})` : jobTitle);
    Promise.all([api<{ accounts: SocialAccount[] }>('/social/accounts'), api<{ providers: SocialProvider[] }>('/social/providers')]).then(
      ([a, p]) => {
        setAccounts(a.accounts);
        setProviders(p.providers);
        // Start with every usable account ticked: the common case is "post everywhere"
        setPicked((cur) => (cur.length ? cur.filter((id) => a.accounts.some((x) => x.id === id && !x.needsReconnect)) : a.accounts.filter((x) => !x.needsReconnect).map((x) => x.id)));
      },
      (e) => setError(e instanceof Error ? e.message : 'Could not load your accounts'),
    );
  }, [visible, many, jobTitle]);

  const chosen = useMemo(() => (accounts ?? []).filter((a) => picked.includes(a.id)), [accounts, picked]);
  const longest = Math.max(0, ...clips.map((c) => c.duration));

  // What the chosen platforms will do with this post, said before it is sent
  const notes = useMemo(() => {
    const out: { tone: 'warning' | 'info'; text: string }[] = [];
    const seen = new Set<string>();
    for (const a of chosen) {
      if (seen.has(a.platform)) continue;
      seen.add(a.platform);
      const p = providers.find((x) => x.platform === a.platform);
      if (!p) continue;
      const label = PLATFORM[a.platform].label;
      if (longest > p.limits.maxSeconds) out.push({ tone: 'warning', text: `${label} takes videos up to ${span(p.limits.maxSeconds)}. ${many ? 'Some of these clips are' : 'This clip is'} longer and will be refused.` });
      if (caption.length > p.limits.caption) out.push({ tone: 'warning', text: `${label} shows at most ${p.limits.caption} characters: the text will be cut there.` });
      if (privacy !== 'public' && !p.privacy.includes(privacy)) out.push({ tone: 'info', text: `${label} has no "${privacy}" setting: the post will be public there.` });
      if (a.platform === 'TIKTOK' && privacy !== 'private') out.push({ tone: 'info', text: 'TikTok only lets apps it has audited post publicly. If this post is refused, choose Private.' });
    }
    return out;
  }, [chosen, providers, longest, caption, privacy, many]);

  const at = whenDate(when, custom);
  const submit = async () => {
    setError('');
    if (!picked.length) return setError('Choose at least one account');
    if (at === null) return setError('Enter the date and time to post, e.g. 2026-12-31 18:30');
    if (at && at.getTime() < Date.now()) return setError('That time has already passed');
    setBusy(true);
    try {
      const r = await api<{ publications: Publication[] }>('/publications', {
        body: { clipIds: clips.map((c) => c.id), accountIds: picked, title: title.trim(), caption: caption.trim(), privacy, scheduledAt: at ? at.toISOString() : undefined, everyMinutes: many ? every : 0 },
      });
      onDone(r.publications);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post');
    } finally {
      setBusy(false);
    }
  };

  const total = clips.length * picked.length;
  return (
    <Modal visible={visible} transparent animationType={desktop ? 'fade' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, desktop ? styles.center : styles.bottom]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, desktop ? styles.sheetDesk : styles.sheetPhone]}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text variant="h1" style={{ fontSize: 20 }}>
                {many ? `Post ${clips.length} clips` : `Post clip ${clips[0]?.index ?? ''}`}
              </Text>
              <Text variant="bodySm" color={colors.textMuted} numberOfLines={1}>
                {jobTitle}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          {accounts === null ? (
            error ? (
              <Notice tone="danger">{error}</Notice>
            ) : (
              <Spinner />
            )
          ) : accounts.length === 0 ? (
            <View style={{ gap: space.md, paddingVertical: space.lg }}>
              <Text variant="body" color={colors.textMuted}>
                No accounts are connected yet. Connect YouTube, TikTok, Instagram, Facebook, X or LinkedIn once, then post clips to them from here.
              </Text>
              <Button
                label="Connect an account"
                icon="share-social-outline"
                onPress={() => {
                  onClose();
                  router.navigate('/channels');
                }}
              />
            </View>
          ) : (
            <>
              <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: space.lg, paddingBottom: space.sm }} keyboardShouldPersistTaps="handled">
                <View>
                  <SectionTitle>Where</SectionTitle>
                  <AccountPicker accounts={accounts} value={picked} onChange={setPicked} />
                </View>
                <View style={{ gap: space.md }}>
                  <SectionTitle hint={many ? '{n} becomes each clip’s number, {title} the video’s title' : 'The title is used where a platform has one (YouTube, Facebook, LinkedIn)'}>Text</SectionTitle>
                  <Input label="Title" value={title} onChangeText={setTitle} maxLength={200} placeholder="A title for the video" />
                  <Input label="Caption" value={caption} onChangeText={setCaption} multiline maxLength={5000} placeholder="Say something about it. #hashtags work too" />
                </View>
                <View>
                  <SectionTitle>Who can see it</SectionTitle>
                  <Chips
                    value={privacy}
                    onChange={setPrivacy}
                    options={[
                      { value: 'public', label: 'Public', icon: 'earth-outline' },
                      { value: 'unlisted', label: 'Unlisted', icon: 'link-outline' },
                      { value: 'private', label: 'Private', icon: 'lock-closed-outline' },
                    ]}
                  />
                </View>
                <View style={{ gap: space.sm }}>
                  <SectionTitle>When</SectionTitle>
                  <Chips
                    value={when}
                    onChange={setWhen}
                    options={[
                      { value: 'now', label: 'Now', icon: 'flash-outline' },
                      { value: '1h', label: 'In 1 hour' },
                      { value: '3h', label: 'In 3 hours' },
                      { value: 'tomorrow', label: 'Tomorrow 9:00' },
                      { value: 'custom', label: 'Pick a time', icon: 'calendar-outline' },
                    ]}
                  />
                  {when === 'custom' ? <DateTimeField value={custom} onChange={setCustom} /> : null}
                </View>
                {many ? (
                  <View>
                    <SectionTitle hint="Spread the clips out instead of posting them all together">Time between clips</SectionTitle>
                    <Chips
                      value={every}
                      onChange={setEvery}
                      options={[
                        { value: 0, label: 'All at once' },
                        { value: 30, label: '30 min' },
                        { value: 60, label: '1 hour' },
                        { value: 180, label: '3 hours' },
                        { value: 1440, label: '1 day' },
                      ]}
                    />
                  </View>
                ) : null}
                {notes.map((n) => (
                  <Notice key={n.text} tone={n.tone}>
                    {n.text}
                  </Notice>
                ))}
              </ScrollView>
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <View style={styles.foot}>
                <Button label="Cancel" variant="secondary" onPress={onClose} />
                <Button
                  label={`${at ? 'Schedule' : 'Post now'}${total > 1 ? ` · ${total} posts` : ''}`}
                  icon={at ? 'calendar-outline' : 'paper-plane-outline'}
                  loading={busy}
                  disabled={!picked.length}
                  onPress={() => void submit()}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  bottom: { justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, padding: space.xxl - 4, gap: space.lg, borderWidth: 1, borderColor: colors.glassBorder },
  sheetDesk: { width: '100%', maxWidth: 620, maxHeight: '92%', borderRadius: radius.xl },
  sheetPhone: { maxHeight: '92%', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: space.xxl + 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  foot: { flexDirection: 'row', gap: space.sm },
  date: { height: 44, borderRadius: radius.pill, paddingHorizontal: 16, backgroundColor: colors.surfaceAlt, color: colors.text, fontFamily: fonts.medium, borderWidth: 1, borderColor: colors.borderStrong },
});
