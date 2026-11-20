import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, IconButton } from '../src/components/Button';
import { Input } from '../src/components/Input';
import { Text } from '../src/components/Text';
import { Badge, Card, Notice, Screen, SectionTitle, Skeleton, Stat } from '../src/components/ui';
import { api } from '../src/api/client';
import type { AdminUser } from '../src/api/types';
import { useAuth } from '../src/store/auth';
import { colors, fonts, gradients, radius, space } from '../src/theme';
import { ago, bytes } from '../src/utils/format';
import { confirm } from '../src/utils/confirm';

interface Stats {
  users: number;
  jobs: number;
  clips: number;
  bytes: number;
  failed: number;
  running: number;
}

/** Admins: workspace totals and the team (deactivate, promote, reset a password). */
export default function Admin() {
  const me = useAuth((s) => s.user);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const [u, s] = await Promise.all([api<{ users: AdminUser[] }>('/admin/users'), api<Stats>('/admin/stats')]);
      setUsers(u.users);
      setStats(s);
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not load the team' });
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (me && me.role !== 'ADMIN') return <Redirect href="/home" />;

  const update = async (u: AdminUser, body: Record<string, unknown>, done: string) => {
    setBusy(u.id);
    setMsg(null);
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body });
      setMsg({ tone: 'success', text: done });
      setResetFor(null);
      setPw('');
      await load();
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not update this account' });
    } finally {
      setBusy('');
    }
  };

  return (
    <Screen eyebrow="Workspace" title="Admin" subtitle="Your team and how the server is doing." right={<IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} />} wide>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <View style={styles.stats}>
        <Stat icon="people-outline" label="Members" value={stats?.users ?? '–'} />
        <Stat icon="albums-outline" label="Projects" value={stats?.jobs ?? '–'} />
        <Stat icon="film-outline" label="Clips stored" value={stats?.clips ?? '–'} tone="lime" />
        <Stat icon="server-outline" label="Storage used" value={stats ? bytes(stats.bytes) : '–'} />
        <Stat icon="pulse-outline" label="Working now" value={stats?.running ?? '–'} tone="ai" />
        <Stat icon="alert-circle-outline" label="Failed" value={stats?.failed ?? '–'} />
      </View>

      <Card>
        <SectionTitle hint="Deactivating signs a person out everywhere at once">Team</SectionTitle>
        {users === null ? (
          [0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 64 }} />)
        ) : (
          users.map((u) => (
            <View key={u.id} style={[styles.row, !u.active && { opacity: 0.55 }]}>
              <LinearGradient colors={u.role === 'ADMIN' ? gradients.brand : [colors.surfaceHigh, colors.surfaceHigh]} style={styles.avatar}>
                <Text variant="title" color={u.role === 'ADMIN' ? '#FFFFFF' : colors.text}>
                  {u.name.slice(0, 1).toUpperCase()}
                </Text>
              </LinearGradient>
              <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text variant="title">{u.name}</Text>
                  {u.role === 'ADMIN' ? <Badge tone="ai">Admin</Badge> : null}
                  {!u.active ? <Badge>Deactivated</Badge> : null}
                  {u.id === me?.id ? <Badge tone="lime">You</Badge> : null}
                </View>
                <Text variant="label" color={colors.textMuted} style={{ fontFamily: fonts.regular }}>
                  {u.email} · {u.jobs} projects · {u.clips} clips · joined {ago(u.createdAt)}
                </Text>
              </View>
              {u.id !== me?.id ? (
                <View style={styles.actions}>
                  <Button size="sm" variant="secondary" label={u.role === 'ADMIN' ? 'Make member' : 'Make admin'} loading={busy === u.id} onPress={() => void update(u, { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' }, `${u.name} is now ${u.role === 'ADMIN' ? 'a member' : 'an admin'}`)} />
                  <Button size="sm" variant="secondary" label="Reset password" onPress={() => setResetFor(resetFor === u.id ? null : u.id)} />
                  <Button
                    size="sm"
                    variant={u.active ? 'danger' : 'primary'}
                    label={u.active ? 'Deactivate' : 'Reactivate'}
                    onPress={async () => {
                      if (u.active && !(await confirm(`Deactivate ${u.name}? They are signed out at once.`))) return;
                      void update(u, { active: !u.active }, `${u.name} ${u.active ? 'deactivated' : 'reactivated'}`);
                    }}
                  />
                </View>
              ) : null}
              {resetFor === u.id ? (
                <View style={styles.reset}>
                  <View style={{ flex: 1 }}>
                    <Input value={pw} onChangeText={setPw} secureTextEntry placeholder="New password: 8+ characters, a letter and a number" />
                  </View>
                  <Button label="Set password" loading={busy === u.id} onPress={() => void update(u, { password: pw }, `Password reset for ${u.name}. They are signed out everywhere.`)} />
                </View>
              ) : null}
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  reset: { width: '100%', flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
});
