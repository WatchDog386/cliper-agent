import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Text } from '../../src/components/Text';
import { Card, Chips, Notice, Screen, SectionTitle } from '../../src/components/ui';
import { api, API_URL } from '../../src/api/client';
import type { User } from '../../src/api/types';
import { useAuth } from '../../src/store/auth';
import { DEFAULT_OPTIONS, useDraft } from '../../src/store/draft';
import { colors, fonts, setThemeMode, space, themeMode } from '../../src/theme';

interface SystemInfo {
  tools: Record<string, { ok: boolean; version?: string }>;
  queue: { running: number; concurrency: number };
  encoder?: { active: string; hardware: boolean; note: string | null; parallel: number };
  publisher?: { running: number; concurrency: number };
}

export default function Settings() {
  const user = useAuth((s) => s.user);
  const [name, setName] = useState(user?.name ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [system, setSystem] = useState<SystemInfo | null>(null);

  useEffect(() => {
    api<SystemInfo>('/system').then(setSystem, () => undefined);
  }, []);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setMsg(null);
    try {
      setMsg({ tone: 'info', text: await fn() });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setBusy('');
    }
  };

  return (
    <Screen title="Settings" subtitle={user ? `${user.email}${user.role === 'ADMIN' ? ' · admin' : ''}` : undefined}>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <Card>
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

      <Card>
        <SectionTitle hint="Signs you out on every other device">Change password</SectionTitle>
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

      <Card>
        <SectionTitle>Appearance</SectionTitle>
        {Platform.OS === 'web' ? (
          <Chips
            value={themeMode}
            onChange={(m) => m !== themeMode && setThemeMode(m)}
            options={[
              { value: 'light', label: 'Light', icon: 'sunny-outline' },
              { value: 'dark', label: 'Dark', icon: 'moon-outline' },
            ]}
          />
        ) : (
          <Text variant="bodySm" color={colors.textMuted}>
            The phone app uses the light theme.
          </Text>
        )}
        <SectionTitle hint="The Create page starts from your last settings">Clip settings</SectionTitle>
        <Button
          label="Reset to defaults (30s · phone · blurred)"
          variant="secondary"
          style={{ alignSelf: 'flex-start' }}
          onPress={() => {
            useDraft.getState().setOptions(DEFAULT_OPTIONS);
            useDraft.getState().remember();
            setMsg({ tone: 'info', text: 'Clip settings reset' });
          }}
        />
      </Card>

      <Card>
        <SectionTitle>Server</SectionTitle>
        <Text variant="label" color={colors.textMuted}>
          {API_URL}
        </Text>
        {system ? (
          <View style={{ gap: 6 }}>
            {Object.entries(system.tools).map(([name, t]) => (
              <View key={name} style={styles.toolRow}>
                <Ionicons name={t.ok ? 'checkmark-circle' : 'close-circle'} size={18} color={t.ok ? colors.success : colors.danger} />
                <Text variant="bodySm" style={{ fontFamily: fonts.semibold, width: 70 }}>
                  {name}
                </Text>
                <Text variant="bodySm" color={colors.textMuted}>
                  {t.ok ? t.version : 'not installed'}
                </Text>
              </View>
            ))}
            <Text variant="bodySm" color={colors.textMuted}>
              Rendering {system.queue.running} of {system.queue.concurrency} job slots
              {system.encoder ? ` · ${system.encoder.parallel} clip${system.encoder.parallel === 1 ? '' : 's'} at a time` : ''}
            </Text>
            {system.encoder ? (
              <View style={styles.toolRow}>
                <Ionicons name={system.encoder.hardware ? 'flash' : 'hardware-chip-outline'} size={18} color={system.encoder.hardware ? colors.success : colors.textMuted} />
                <Text variant="bodySm" style={{ fontFamily: fonts.semibold, width: 70 }}>
                  encoder
                </Text>
                <Text variant="bodySm" color={colors.textMuted} style={{ flex: 1 }}>
                  {system.encoder.active} {system.encoder.hardware ? '(graphics card)' : '(CPU)'}
                </Text>
              </View>
            ) : null}
            {system.encoder?.note ? <Notice tone="warning">{system.encoder.note}</Notice> : null}
          </View>
        ) : null}
      </Card>

      <Button
        label="Sign out"
        variant="danger"
        icon="log-out-outline"
        onPress={() => {
          void useAuth.getState().logout();
          router.replace('/login');
        }}
      />
      <Text variant="label" color={colors.textDim} align="center" style={{ marginTop: space.sm }}>
        Only clip videos you own or have permission to use.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
