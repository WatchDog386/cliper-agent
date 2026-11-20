import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Text } from '../../src/components/Text';
import { Badge, Card, Notice, Screen, SectionTitle } from '../../src/components/ui';
import { Segmented } from '../../src/components/Segmented';
import { api, API_URL, DEMO } from '../../src/api/client';
import type { AiStatus, User } from '../../src/api/types';
import { useAuth } from '../../src/store/auth';
import { DEFAULT_OPTIONS, useDraft } from '../../src/store/draft';
import { colors, fonts, gradients, setThemeMode, space, themeMode } from '../../src/theme';
import { useDesktop } from '../../src/theme/desktop';

interface SystemInfo {
  tools: Record<string, { ok: boolean; version?: string }>;
  queue: { running: number; concurrency: number };
}

export default function Settings() {
  const user = useAuth((s) => s.user);
  const desktop = useDesktop();
  const [name, setName] = useState(user?.name ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);

  useEffect(() => {
    api<SystemInfo>('/system').then(setSystem, () => undefined);
    api<AiStatus>('/ai/status').then(setAi, () => undefined);
  }, []);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setMsg(null);
    try {
      setMsg({ tone: 'success', text: await fn() });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setBusy('');
    }
  };

  const col = { flexGrow: 1, flexBasis: desktop ? 420 : '100%' } as const;

  return (
    <Screen eyebrow="Account" title="Settings" subtitle={user ? `${user.email}${user.role === 'ADMIN' ? ' · admin' : ''}` : undefined} wide>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      {/* ── AI engine ── */}
      <View style={styles.aiCard}>
        <LinearGradient colors={['rgba(155,107,255,0.25)', 'rgba(255,79,163,0.08)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <LinearGradient colors={gradients.brand} style={styles.aiIcon}>
            <Ionicons name="sparkles" size={20} color="#FFFFFF" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text variant="h2">AI engine · OpusClip</Text>
            <Text variant="bodySm" color={colors.textMuted}>
              Viral-moment detection, animated captions, AI titles, hashtags and virality scores.
            </Text>
          </View>
          {ai ? <Badge tone={ai.ok ? 'lime' : 'neutral'} icon={ai.ok ? 'checkmark-circle' : 'close-circle'}>{ai.ok ? 'Connected' : ai.enabled ? 'Error' : 'Off'}</Badge> : null}
        </View>
        {ai && !ai.ok ? (
          <Text variant="bodySm" color={colors.textMuted}>
            {ai.enabled ? ai.message : 'Set OPUSCLIP_API_KEY in the server’s .env (backend/.env or deploy/.env) and restart the API. The key stays on the server and is never sent to the app.'}
          </Text>
        ) : null}
        {ai?.templates.length ? (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Text variant="label" color={colors.textMuted}>
              Templates:
            </Text>
            {ai.templates.map((t) => (
              <Badge key={t.id} icon={t.isDefault ? 'star' : undefined}>
                {t.name}
              </Badge>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.cols}>
        <Card style={col}>
          <SectionTitle>Profile</SectionTitle>
          <Input label="Name" value={name} onChangeText={setName} />
          <Button
            label="Save name"
            variant="secondary"
            loading={busy === 'name'}
            style={{ alignSelf: 'flex-start' }}
            onPress={() =>
              void run('name', async () => {
                const r = await api<{ user: User }>('/auth/me', { method: 'PATCH', body: { name } });
                await useAuth.getState().updateUser(r.user);
                return 'Name saved';
              })
            }
          />
        </Card>

        <Card style={col}>
          <SectionTitle hint="Signs you out on every other device">Password</SectionTitle>
          <Input label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
          <Input label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" placeholder="8+ characters with a letter and a number" />
          <Button
            label="Change password"
            variant="secondary"
            loading={busy === 'pw'}
            style={{ alignSelf: 'flex-start' }}
            onPress={() =>
              void run('pw', async () => {
                const r = await api<{ token: string; user: User }>('/auth/change-password', { body: { currentPassword: current, newPassword: next } });
                await useAuth.getState().setSession(r.token, r.user);
                setCurrent('');
                setNext('');
                return 'Password changed';
              })
            }
          />
        </Card>

        <Card style={col}>
          <SectionTitle>Appearance</SectionTitle>
          {Platform.OS === 'web' ? (
            <Segmented
              value={themeMode}
              onChange={(m) => m !== themeMode && setThemeMode(m)}
              options={[
                { value: 'dark', label: 'Dark', icon: 'moon-outline' },
                { value: 'light', label: 'Light', icon: 'sunny-outline' },
              ]}
            />
          ) : (
            <Text variant="bodySm" color={colors.textMuted}>
              The app uses the dark studio theme on phones.
            </Text>
          )}
          <SectionTitle hint="The Create page starts from your last settings">Clip defaults</SectionTitle>
          <Button
            label="Reset (30s · 9:16 · blurred fill)"
            variant="secondary"
            icon="refresh"
            style={{ alignSelf: 'flex-start' }}
            onPress={() => {
              useDraft.getState().setOptions(DEFAULT_OPTIONS);
              useDraft.getState().remember();
              setMsg({ tone: 'success', text: 'Clip settings reset' });
            }}
          />
        </Card>

        <Card style={col}>
          <SectionTitle hint={DEMO ? 'Demo mode: no server' : API_URL}>Server</SectionTitle>
          {system ? (
            <View style={{ gap: 10 }}>
              {Object.entries(system.tools).map(([tool, t]) => (
                <View key={tool} style={styles.toolRow}>
                  <Ionicons name={t.ok ? 'checkmark-circle' : 'close-circle'} size={18} color={t.ok ? colors.success : colors.danger} />
                  <Text variant="bodySm" style={{ fontFamily: fonts.semibold, width: 70 }}>
                    {tool}
                  </Text>
                  <Text variant="mono" color={colors.textMuted}>
                    {t.ok ? t.version : 'not installed'}
                  </Text>
                </View>
              ))}
              <Text variant="bodySm" color={colors.textMuted}>
                Rendering {system.queue.running} of {system.queue.concurrency} job slots
              </Text>
            </View>
          ) : (
            <Text variant="bodySm" color={colors.textMuted}>
              Checking…
            </Text>
          )}
          {user?.role === 'ADMIN' ? <Button label="Open admin" variant="secondary" icon="shield-checkmark-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/admin')} /> : null}
        </Card>
      </View>

      <Button
        label="Sign out"
        variant="danger"
        icon="log-out-outline"
        style={{ alignSelf: 'flex-start' }}
        onPress={() => {
          void useAuth.getState().logout();
          router.replace('/login');
        }}
      />
      <Text variant="label" color={colors.textDim}>
        Only clip videos you own or have permission to use.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl },
  aiCard: { borderRadius: 22, padding: space.xl, gap: space.md, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(155,107,255,0.35)' },
  aiIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
