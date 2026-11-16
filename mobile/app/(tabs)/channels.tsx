import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform as Device, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as ExpoLinking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '../../src/components/Button';
import { AccountAvatar, PlatformIcon } from '../../src/components/PlatformBadge';
import { PostRow } from '../../src/components/PostRow';
import { Text } from '../../src/components/Text';
import { Card, Chips, Empty, Notice, Screen, SectionTitle, Spinner } from '../../src/components/ui';
import { api } from '../../src/api/client';
import type { Platform, Publication, SocialAccount, SocialProvider } from '../../src/api/types';
import { useAuth } from '../../src/store/auth';
import { colors, fonts, radius, space } from '../../src/theme';
import { PLATFORM, span } from '../../src/social/platforms';

type Filter = 'all' | 'waiting' | 'published' | 'failed';
interface Stats {
  waiting: number;
  published: number;
  failed: number;
}

function confirm(message: string): Promise<boolean> {
  if (Device.OS === 'web') return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert('Are you sure?', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Yes', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

/** Connected social accounts, and everything posted or scheduled to them. */
export default function Channels() {
  const admin = useAuth((s) => s.user?.role === 'ADMIN');
  const [providers, setProviders] = useState<SocialProvider[] | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<Publication[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [setup, setSetup] = useState<Platform | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAccounts = useCallback(async () => {
    const [p, a] = await Promise.all([api<{ providers: SocialProvider[] }>('/social/providers'), api<{ accounts: SocialAccount[] }>('/social/accounts')]);
    setProviders(p.providers);
    setAccounts(a.accounts);
  }, []);

  const loadPosts = useCallback(async () => {
    const r = await api<{ publications: Publication[]; stats: Stats }>(`/publications?status=${filter}`);
    setPosts(r.publications);
    setStats(r.stats);
    return r.publications.some((p) => p.status === 'PUBLISHING' || (p.status === 'QUEUED' && !p.scheduled));
  }, [filter]);

  /** The outcome of a connection, as the server reports it in the address's fragment (#connected=YOUTUBE&name=…). */
  const showOutcome = useCallback((url: string) => {
    const q = new URLSearchParams(url.split('#')[1] ?? '');
    const connected = q.get('connected');
    if (connected) {
      const label = PLATFORM[connected as Platform]?.label ?? connected;
      setNotice({ tone: 'info', text: `${label} connected${q.get('name') ? `: ${q.get('name')}` : ''}. You can now post clips to it.` });
    } else if (q.get('error')) setNotice({ tone: 'danger', text: q.get('error')! });
    return Boolean(connected || q.get('error'));
  }, []);

  // Back from the platform's approval page (web): say how it went, then tidy the address bar
  useEffect(() => {
    if (Device.OS !== 'web' || !window.location.hash) return;
    if (showOutcome(window.location.href)) window.history.replaceState(null, '', window.location.pathname);
  }, [showOutcome]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadAccounts().catch((e) => alive && setNotice({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not load your accounts' }));
      const tick = async () => {
        const active = await loadPosts().catch(() => false);
        if (alive) timer.current = setTimeout(tick, active ? 3000 : 15000);
      };
      void tick();
      return () => {
        alive = false;
        if (timer.current) clearTimeout(timer.current);
      };
    }, [loadAccounts, loadPosts]),
  );

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setNotice({ tone: 'danger', text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setBusy('');
    }
  };

  const connect = (platform: Platform) =>
    act(`connect${platform}`, async () => {
      setNotice(null);
      const returnTo = Device.OS === 'web' ? `${window.location.origin}/channels` : ExpoLinking.createURL('channels');
      const { url } = await api<{ url: string }>(`/social/connect/${platform.toLowerCase()}`, { body: { returnTo } });
      if (Device.OS === 'web') {
        // The platform's approval page replaces this one, then sends the person back here
        window.location.assign(url);
        return;
      }
      const r = await WebBrowser.openAuthSessionAsync(url, returnTo);
      if (r.type === 'success') showOutcome(r.url);
      await loadAccounts();
    });

  const disconnect = (a: SocialAccount) =>
    act(`off${a.id}`, async () => {
      if (!(await confirm(`Disconnect ${a.name}? Posts waiting for it are cancelled. Nothing already posted is removed.`))) return;
      await api(`/social/accounts/${a.id}`, { method: 'DELETE' });
      await Promise.all([loadAccounts(), loadPosts()]);
    });

  const postAction = (p: Publication, what: 'retry' | 'cancel' | 'remove') =>
    act(`${what}${p.id}`, async () => {
      if (what === 'remove') await api(`/publications/${p.id}`, { method: 'DELETE' });
      else await api(`/publications/${p.id}/${what}`, { method: 'POST' });
      await loadPosts();
    });

  const ready = (providers ?? []).filter((p) => p.configured);
  const notReady = (providers ?? []).filter((p) => !p.configured);
  const shownSetup = providers?.find((p) => p.platform === setup);

  return (
    <Screen
      title="Channels"
      subtitle={accounts.length ? `${accounts.length} connected${stats ? ` · ${stats.published} posted${stats.waiting ? ` · ${stats.waiting} waiting` : ''}` : ''}` : 'Connect your accounts once, then post clips to all of them in one go.'}
      wide
    >
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      {providers === null ? (
        <Spinner />
      ) : (
        <>
          {accounts.length ? (
            <Card>
              <SectionTitle>Connected</SectionTitle>
              <View style={styles.grid}>
                {accounts.map((a) => (
                  <View key={a.id} style={[styles.account, a.needsReconnect && { borderColor: colors.danger }]}>
                    <AccountAvatar account={a} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text variant="title" numberOfLines={1} style={{ fontFamily: fonts.semibold }}>
                        {a.name}
                      </Text>
                      <Text variant="label" color={a.needsReconnect ? colors.danger : colors.textMuted} numberOfLines={1}>
                        {a.needsReconnect ? 'Access expired: connect again' : [PLATFORM[a.platform].label, a.handle ? (a.handle.startsWith('@') ? a.handle : `@${a.handle}`) : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {a.needsReconnect ? <Button label="Reconnect" loading={busy === `connect${a.platform}`} onPress={() => void connect(a.platform)} /> : null}
                    <Pressable onPress={() => void disconnect(a)} hitSlop={8} style={styles.iconBtn} accessibilityLabel={`Disconnect ${a.name}`}>
                      <Ionicons name="unlink-outline" size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          <Card>
            <SectionTitle hint="You approve on the platform's own page. Cliper Agent never sees your password, and you can disconnect at any time.">
              {accounts.length ? 'Add another' : 'Connect an account'}
            </SectionTitle>
            <View style={styles.grid}>
              {[...ready, ...notReady].map((p) => {
                const meta = PLATFORM[p.platform];
                const count = accounts.filter((a) => a.platform === p.platform).length;
                return (
                  <View key={p.platform} style={styles.tile}>
                    <View style={styles.tileHead}>
                      <PlatformIcon platform={p.platform} size={44} />
                      <View style={{ flex: 1 }}>
                        <Text variant="title" style={{ fontFamily: fonts.semibold }}>
                          {meta.label}
                        </Text>
                        <Text variant="label" color={colors.textMuted}>
                          {meta.post} · up to {span(p.limits.maxSeconds)}
                        </Text>
                      </View>
                    </View>
                    {p.configured ? (
                      <Button
                        label={count ? 'Connect another' : `Connect ${meta.label}`}
                        variant={count ? 'secondary' : 'primary'}
                        icon="add"
                        loading={busy === `connect${p.platform}`}
                        onPress={() => void connect(p.platform)}
                      />
                    ) : (
                      <Button label={admin ? 'Set up on the server' : 'Not available yet'} variant="secondary" icon={admin ? 'construct-outline' : 'lock-closed-outline'} disabled={!admin} onPress={() => setSetup(setup === p.platform ? null : p.platform)} />
                    )}
                  </View>
                );
              })}
            </View>
            {shownSetup ? (
              <View style={styles.setup}>
                <Text variant="title" style={{ fontFamily: fonts.semibold }}>
                  Setting up {PLATFORM[shownSetup.platform].label}
                </Text>
                <Text variant="bodySm" color={colors.textMuted}>
                  1. Create a developer app with {PLATFORM[shownSetup.platform].label} (the steps are in docs/SOCIAL.md).{'\n'}2. Register this redirect address in the app:
                </Text>
                <Text variant="bodySm" selectable style={styles.code}>
                  {shownSetup.redirectUri}
                </Text>
                <Text variant="bodySm" color={colors.textMuted}>
                  3. Put the app's two keys in the server settings (deploy/.env) and restart:
                </Text>
                <Text variant="bodySm" selectable style={styles.code}>
                  {shownSetup.envNames[0]}=…{'\n'}
                  {shownSetup.envNames[1]}=…
                </Text>
              </View>
            ) : null}
          </Card>

          <Card>
            <SectionTitle hint="Post a clip from its page in My clips, or let a job post its clips automatically">Posts</SectionTitle>
            <Chips
              value={filter}
              onChange={(f) => {
                setPosts(null);
                setFilter(f);
              }}
              options={[
                { value: 'all', label: 'All' },
                { value: 'waiting', label: `Waiting${stats?.waiting ? ` (${stats.waiting})` : ''}` },
                { value: 'published', label: 'Posted' },
                { value: 'failed', label: `Failed${stats?.failed ? ` (${stats.failed})` : ''}` },
              ]}
            />
            {posts === null ? (
              <Spinner />
            ) : posts.length === 0 ? (
              <Empty icon="paper-plane-outline" title="Nothing here yet" hint="Open a finished video in My clips and press Post." action={<Button label="My clips" variant="secondary" icon="film-outline" onPress={() => router.navigate('/library')} />} />
            ) : (
              <View>
                {posts.map((p, i) => (
                  <View key={p.id} style={i ? styles.divider : undefined}>
                    <PostRow post={p} onRetry={() => void postAction(p, 'retry')} onCancel={() => void postAction(p, 'cancel')} onRemove={() => void postAction(p, 'remove')} />
                  </View>
                ))}
              </View>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  account: { flexGrow: 1, flexBasis: 300, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: 'transparent' },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  tile: { flexGrow: 1, flexBasis: 300, gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  setup: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  code: { fontFamily: Device.OS === 'web' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : fonts.medium, backgroundColor: colors.surface, padding: space.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
});
