import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '../src/components/Button';
import { Input } from '../src/components/Input';
import { Text } from '../src/components/Text';
import { Segmented } from '../src/components/Segmented';
import { Notice } from '../src/components/ui';
import { api } from '../src/api/client';
import type { AppConfig, User } from '../src/api/types';
import { useAuth } from '../src/store/auth';
import { colors, fonts, gradients, radius, space } from '../src/theme';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    api<AppConfig>('/config').then(setConfig, () => undefined);
  }, []);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      const body = mode === 'login' ? { email, password } : { name, email, password };
      const res = await api<{ token: string; user: User }>(`/auth/${mode === 'login' ? 'login' : 'register'}`, { body });
      await useAuth.getState().setSession(res.token, res.user);
      router.replace('/create');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bgTop }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <LinearGradient colors={gradients.brand} style={styles.logo}>
            <Ionicons name="cut" size={28} color="#FFFFFF" />
          </LinearGradient>
          <Text variant="display" color="#FFFFFF" fixedColor style={{ fontFamily: fonts.bold, fontSize: 30 }}>
            {config?.appName ?? 'Cliper Agent'}
          </Text>
          <Text variant="body" color="rgba(255,255,255,0.9)" fixedColor>
            Paste a trending video link. Get ready-to-post clips for phone or desktop in minutes.
          </Text>
          <View style={styles.points}>
            {[
              ['link-outline', 'YouTube, TikTok, X, Instagram & more'],
              ['phone-portrait-outline', 'Phone 9:16 or desktop 16:9'],
              ['flame-outline', 'Auto-pick the best moments'],
            ].map(([icon, label]) => (
              <View key={label} style={styles.point}>
                <Ionicons name={icon as 'link-outline'} size={16} color="#FFFFFF" />
                <Text variant="bodySm" color="#FFFFFF" fixedColor>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={styles.form}>
          <Segmented
            options={[
              { value: 'login', label: 'Sign in' },
              { value: 'register', label: 'Create account' },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError('');
            }}
          />
          {mode === 'register' && config && !config.allowSignup ? <Notice tone="warning">Sign-up is closed on this server. Ask the admin for an account.</Notice> : null}
          {mode === 'register' ? <Input label="Name" icon="person-outline" value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" /> : null}
          <Input label="Email" icon="mail-outline" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Input
            label="Password"
            icon="lock-closed-outline"
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'register' ? '8+ characters with a letter and a number' : 'Your password'}
            secureTextEntry
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            onSubmitEditing={() => void submit()}
          />
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button label={mode === 'login' ? 'Sign in' : 'Create account'} size="lg" loading={busy} onPress={() => void submit()} trailingIcon="arrow-forward" />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center', padding: space.lg, gap: space.xl, width: '100%', maxWidth: 480, alignSelf: 'center' },
  hero: { borderRadius: radius.xl, padding: space.xxl, gap: space.md },
  logo: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  points: { gap: 8, marginTop: space.sm },
  point: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  form: { gap: space.lg },
});
