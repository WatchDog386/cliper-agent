import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '../src/components/Button';
import { Input } from '../src/components/Input';
import { Text } from '../src/components/Text';
import { Segmented } from '../src/components/Segmented';
import { Logo } from '../src/components/Logo';
import { Badge, Glow, Notice } from '../src/components/ui';
import { api } from '../src/api/client';
import type { AppConfig, User } from '../src/api/types';
import { useAuth } from '../src/store/auth';
import { colors, fonts, gradients, radius, space } from '../src/theme';
import { useDesktop } from '../src/theme/desktop';

/** Three phone-shaped frames fanned out: an illustration of what the app makes (no data). */
function ClipFan() {
  const cards: { colors: [string, string]; rot: string; x: number; y: number; cap: string; z: number }[] = [
    { colors: ['#2B1055', '#7597DE'], rot: '-9deg', x: -150, y: 30, cap: '9:16', z: 1 },
    { colors: ['#1A0B2E', '#FF4FA3'], rot: '0deg', x: 0, y: 0, cap: 'CAPTIONS', z: 3 },
    { colors: ['#0F2027', '#2C5364'], rot: '9deg', x: 150, y: 30, cap: 'JUMP CUTS', z: 2 },
  ];
  return (
    <View style={styles.fan}>
      {cards.map((c) => (
        <View key={c.cap} style={[styles.phone, { zIndex: c.z, transform: [{ translateX: c.x }, { translateY: c.y }, { rotate: c.rot }] }]}>
          <LinearGradient colors={c.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={styles.head} />
          <View style={styles.body} />
          <View style={styles.cap}>
            <Text variant="label" color="#C8FF2E" align="center" style={{ fontFamily: fonts.extrabold, fontSize: 11 }}>
              {c.cap}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function Login() {
  const desktop = useDesktop();
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
    if (!email.trim() || !password) return setError('Enter your email and password');
    setBusy(true);
    try {
      const body = mode === 'login' ? { email, password } : { name, email, password };
      const res = await api<{ token: string; user: User }>(`/auth/${mode === 'login' ? 'login' : 'register'}`, { body });
      await useAuth.getState().setSession(res.token, res.user);
      router.replace('/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  const hero = (
    <View style={[styles.hero, desktop && { flex: 1.15, borderRadius: 0, minHeight: '100%' as unknown as number }]}>
      <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Glow color="#9B6BFF" size={800} opacity={0.45} style={{ top: -380, left: -260 }} />
      <Glow color="#FF4FA3" size={620} opacity={0.28} style={{ bottom: -300, right: -200 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Logo size={38} />
        <Text variant="h1" color="#FFFFFF" style={{ fontFamily: fonts.extrabold }}>
          {config?.appName ?? 'Cliper Agent'}
        </Text>
      </View>
      <View style={{ gap: 14, marginTop: desktop ? 56 : 24 }}>
        <Badge tone="ai" icon="sparkles">
          AI clipping · OpusClip engine
        </Badge>
        <Text variant="hero" color="#FFFFFF" style={!desktop && { fontSize: 34, lineHeight: 38, letterSpacing: -1 }}>
          One long video.{'\n'}
          <Text variant="hero" color="#C8FF2E" style={!desktop && { fontSize: 34, lineHeight: 38, letterSpacing: -1 }}>
            Ten viral shorts.
          </Text>
        </Text>
        <Text variant="body" color="rgba(255,255,255,0.72)" style={{ maxWidth: 480, fontSize: desktop ? 17 : 15, lineHeight: desktop ? 26 : 22 }}>
          Paste a link from YouTube, TikTok, X and 1,800+ sites. Get captioned, reframed clips with virality scores, ready for every platform.
        </Text>
      </View>
      {desktop ? <ClipFan /> : null}
      <View style={styles.points}>
        {[
          ['sparkles', 'AI hooks & captions'],
          ['phone-portrait-outline', '9:16 · 16:9 · 1:1 · 4:5'],
          ['flash-outline', 'Clips in minutes'],
        ].map(([icon, label]) => (
          <View key={label} style={styles.point}>
            <Ionicons name={icon as 'sparkles'} size={15} color="#C8FF2E" />
            <Text variant="bodySm" color="rgba(255,255,255,0.86)">
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  const form = (
    <View style={[styles.form, desktop && { flex: 1, justifyContent: 'center', paddingHorizontal: 64 }]}>
      <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', gap: space.lg }}>
        <View style={{ gap: 6 }}>
          <Text variant="display">{mode === 'login' ? 'Welcome back' : 'Create your studio'}</Text>
          <Text variant="body" color={colors.textMuted}>
            {mode === 'login' ? 'Sign in to keep clipping.' : 'The first account on a server becomes its admin.'}
          </Text>
        </View>
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
        {mode === 'login' ? (
          <Text variant="label" color={colors.textDim} align="center" style={{ fontFamily: fonts.regular }}>
            Forgot your password? Ask your workspace admin to reset it (Admin → Team).
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {desktop ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {hero}
          {form}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          {hero}
          {form}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: space.lg, gap: space.xl, width: '100%', maxWidth: 520, alignSelf: 'center' },
  hero: { borderRadius: radius.xxl, padding: 40, gap: space.md, overflow: 'hidden', justifyContent: 'space-between' },
  points: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: space.lg },
  point: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  form: { gap: space.lg, paddingVertical: space.xl },
  fan: { height: 360, alignItems: 'center', justifyContent: 'center', marginVertical: 24 },
  phone: { position: 'absolute', width: 170, height: 300, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: 20 } },
  head: { position: 'absolute', top: 92, alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.35)' },
  body: { position: 'absolute', top: 160, alignSelf: 'center', width: 130, height: 140, borderTopLeftRadius: 65, borderTopRightRadius: 65, backgroundColor: 'rgba(0,0,0,0.35)' },
  cap: { position: 'absolute', left: 12, right: 12, bottom: 54, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)' },
});
