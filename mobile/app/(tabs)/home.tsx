import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextStyle } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '../../src/components/Button';
import { Text } from '../../src/components/Text';
import { ProjectCard } from '../../src/components/ProjectCard';
import { Badge, Glow, Notice, Screen, SectionTitle, Skeleton, Stat } from '../../src/components/ui';
import { api } from '../../src/api/client';
import { ACTIVE, type AppConfig, type Job, type Mode } from '../../src/api/types';
import { useAuth } from '../../src/store/auth';
import { useDraft } from '../../src/store/draft';
import { colors, fonts, gradients, radius, shadow, space } from '../../src/theme';
import { useDesktop } from '../../src/theme/desktop';

const PLATFORMS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'logo-youtube', label: 'YouTube' },
  { icon: 'logo-tiktok', label: 'TikTok' },
  { icon: 'logo-twitter', label: 'X' },
  { icon: 'logo-instagram', label: 'Instagram' },
  { icon: 'logo-twitch', label: 'Twitch' },
  { icon: 'logo-vimeo', label: 'Vimeo' },
];

const MODES: { mode: Mode; title: string; hint: string; icon: keyof typeof Ionicons.glyphMap; ai?: boolean }[] = [
  { mode: 'ai', title: 'AI clips', hint: 'Viral hooks, animated captions, titles & hashtags', icon: 'sparkles', ai: true },
  { mode: 'highlights', title: 'Best moments', hint: 'Picks the most energetic parts, then auto-edits them: captions, jump cuts, zoom', icon: 'flame' },
  { mode: 'split', title: 'Split evenly', hint: 'Back-to-back clips of any length', icon: 'grid' },
  { mode: 'custom', title: 'Exact ranges', hint: 'Cut precisely the timestamps you list', icon: 'time' },
];

const WEB_NO_OUTLINE = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

interface Stats {
  total: number;
  active: number;
  done: number;
  clips: number;
}

export default function Home() {
  const desktop = useDesktop();
  const user = useAuth((s) => s.user);
  const [url, setUrl] = useState('');
  const [focused, setFocused] = useState(false);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [ai, setAi] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      api<AppConfig>('/config').then((c) => alive && setAi(!!c.ai), () => undefined);
      const tick = async () => {
        let busy = false;
        try {
          const r = await api<{ jobs: Job[]; stats: Stats }>('/jobs?status=all');
          if (!alive) return;
          setJobs(r.jobs.slice(0, 6));
          setStats(r.stats);
          setError('');
          busy = r.jobs.some((j) => ACTIVE.includes(j.status));
        } catch (e) {
          if (alive) setError(e instanceof Error ? e.message : 'Could not load your projects');
        }
        // Refresh quickly while something is rendering, otherwise rarely
        if (alive) timer.current = setTimeout(tick, busy ? 2500 : 15000);
      };
      void tick();
      return () => {
        alive = false;
        if (timer.current) clearTimeout(timer.current);
      };
    }, []),
  );

  const start = (link = url, mode?: Mode) => {
    const clean = link.trim();
    if (mode) useDraft.getState().setOptions({ mode });
    if (clean) useDraft.getState().setUrl(clean);
    router.navigate('/create');
  };

  const paste = async () => {
    const text = (await Clipboard.getStringAsync().catch(() => '')).trim();
    if (text) {
      setUrl(text);
      start(text, ai ? 'ai' : undefined);
    }
  };

  const hello = user?.name ? user.name.split(' ')[0] : 'there';

  return (
    <Screen hideHeader wide>
      {/* ── Hero ── */}
      <View style={[styles.hero, desktop && { paddingVertical: 64, paddingHorizontal: 56 }]}>
        <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Glow color="#9B6BFF" size={760} opacity={0.42} style={{ top: -420, left: -160 }} />
        <Glow color="#FF4FA3" size={520} opacity={0.26} style={{ bottom: -320, right: -120 }} />
        <Glow color="#C8FF2E" size={360} opacity={0.12} style={{ top: -140, right: 120 }} />
        <View style={[styles.heroInner, desktop && { maxWidth: 820 }]}>
          <View style={styles.kicker}>
            <Badge tone="ai" icon="sparkles">
              NEW
            </Badge>
            <Text variant="label" color="rgba(255,255,255,0.82)">
              Hey {hello} · AI clipping powered by OpusClip
            </Text>
          </View>
          <Text variant="hero" color="#FFFFFF" align="center" style={!desktop && { fontSize: 36, lineHeight: 40, letterSpacing: -1.2 }}>
            Turn long videos into{'\n'}
            <Text variant="hero" color={colors.highlight === '#0A0A0F' ? '#C8FF2E' : colors.highlight} style={!desktop && { fontSize: 36, lineHeight: 40, letterSpacing: -1.2 }}>
              viral shorts
            </Text>
            , in one click.
          </Text>
          <Text variant="body" color="rgba(255,255,255,0.72)" align="center" style={{ maxWidth: 560, fontSize: desktop ? 17 : 15, lineHeight: desktop ? 26 : 22 }}>
            Paste a link from YouTube, TikTok, X, Twitch and 1,800+ sites. Get captioned, reframed clips for every platform, with virality scores.
          </Text>

          <View style={[styles.urlBar, focused && styles.urlFocus, !desktop && { flexWrap: 'wrap' }]}>
            <Ionicons name="link" size={20} color="rgba(255,255,255,0.6)" style={{ marginLeft: 6 }} />
            <TextInput
              value={url}
              onChangeText={setUrl}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={() => start(url, ai ? 'ai' : undefined)}
              placeholder="Drop a video link here…"
              placeholderTextColor="rgba(255,255,255,0.42)"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              style={[styles.urlInput, WEB_NO_OUTLINE]}
              accessibilityLabel="Video link"
            />
            {!url ? (
              <Pressable onPress={() => void paste()} style={styles.pasteBtn} accessibilityRole="button">
                <Ionicons name="clipboard-outline" size={15} color="#FFFFFF" />
                <Text variant="label" color="#FFFFFF" style={{ fontFamily: fonts.semibold }}>
                  Paste
                </Text>
              </Pressable>
            ) : null}
            <Button label={ai ? 'Get AI clips' : 'Get clips'} icon={ai ? 'sparkles' : 'cut'} size="lg" onPress={() => start(url, ai ? 'ai' : undefined)} style={!desktop && { flexGrow: 1 }} />
          </View>

          <View style={styles.platforms}>
            {PLATFORMS.map((p) => (
              <View key={p.label} style={styles.platform}>
                <Ionicons name={p.icon} size={14} color="rgba(255,255,255,0.7)" />
                <Text variant="label" color="rgba(255,255,255,0.7)">
                  {p.label}
                </Text>
              </View>
            ))}
            <Pressable onPress={() => router.navigate('/create?source=file')} style={styles.platform}>
              <Ionicons name="cloud-upload-outline" size={14} color="#FFFFFF" />
              <Text variant="label" color="#FFFFFF" style={{ fontFamily: fonts.semibold, textDecorationLine: 'underline' }}>
                or upload a file
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {ai === false ? <Notice tone="info">AI clips are off on this server. Add an OpusClip API key (OPUSCLIP_API_KEY) to switch them on. The other three modes work without it.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {/* ── Modes ── */}
      <SectionTitle hint="Four ways to cut. Pick one, then paste a link.">Start a project</SectionTitle>
      <View style={styles.modes}>
        {MODES.map((m) => (
          <Pressable
            key={m.mode}
            onPress={() => start(url, m.mode)}
            style={(s) => [styles.mode, (s as { hovered?: boolean }).hovered && styles.modeHover, m.ai && { borderColor: 'rgba(155,107,255,0.4)' }]}
          >
            {m.ai ? <LinearGradient colors={['rgba(155,107,255,0.22)', 'rgba(255,79,163,0.06)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
            {m.ai ? (
              <LinearGradient colors={gradients.brand} style={styles.modeIcon}>
                <Ionicons name={m.icon} size={19} color="#FFFFFF" />
              </LinearGradient>
            ) : (
              <View style={[styles.modeIcon, { backgroundColor: colors.surfaceHigh }]}>
                <Ionicons name={m.icon} size={19} color={colors.text} />
              </View>
            )}
            <View style={{ gap: 4, flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="h2">{m.title}</Text>
                {m.ai ? <Badge tone="lime">Popular</Badge> : null}
              </View>
              <Text variant="bodySm" color={colors.textMuted}>
                {m.hint}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>

      {/* ── Stats ── */}
      <View style={styles.stats}>
        <Stat icon="albums-outline" label="Projects" value={stats?.total ?? '–'} />
        <Stat icon="film-outline" label="Clips made" value={stats?.clips ?? '–'} tone="lime" />
        <Stat icon="pulse-outline" label="Working now" value={stats?.active ?? '–'} tone="ai" />
        <Stat icon="checkmark-done-outline" label="Ready" value={stats?.done ?? '–'} />
      </View>

      {/* ── Recent ── */}
      <SectionTitle right={<Button label="View all" variant="ghost" size="sm" trailingIcon="arrow-forward" onPress={() => router.navigate('/library')} />}>Recent projects</SectionTitle>
      {jobs === null ? (
        <View style={styles.grid}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ flexGrow: 1, flexBasis: 260, height: 230, borderRadius: radius.lg }} />
          ))}
        </View>
      ) : jobs.length === 0 ? (
        <View style={styles.firstRun}>
          <Ionicons name="rocket-outline" size={22} color={colors.highlight === '#0A0A0F' ? colors.text : colors.highlight} />
          <Text variant="body" color={colors.textMuted} style={{ flex: 1 }}>
            No projects yet. Paste a link above, or pick something from{' '}
            <Text variant="body" color={colors.text} style={{ fontFamily: fonts.semibold, textDecorationLine: 'underline' }} onPress={() => router.navigate('/discover')}>
              Trending
            </Text>
            .
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {jobs.map((j) => (
            <ProjectCard key={j.id} job={j} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xxl, overflow: 'hidden', paddingVertical: 40, paddingHorizontal: space.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  heroInner: { width: '100%', alignItems: 'center', gap: 18 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 4, paddingRight: 14, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  urlBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    marginTop: 8,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(8,8,12,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    ...shadow.raised,
  },
  urlFocus: { borderColor: 'rgba(200,255,46,0.6)' },
  urlInput: { flex: 1, minWidth: 160, height: 46, color: '#FFFFFF', fontFamily: fonts.medium, fontSize: 16 },
  pasteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.08)' },
  platforms: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: 4 },
  platform: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  mode: { flexGrow: 1, flexBasis: 420, flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  modeHover: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceAlt },
  modeIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  firstRun: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.xl, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
});
