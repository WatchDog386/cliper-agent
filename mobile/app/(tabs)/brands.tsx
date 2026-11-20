import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '../../src/components/Button';
import { Text } from '../../src/components/Text';
import { Badge, Empty, Notice, Screen, Skeleton } from '../../src/components/ui';
import { api } from '../../src/api/client';
import type { AiStatus } from '../../src/api/types';
import { useDraft } from '../../src/store/draft';
import { colors, fonts, radius, space } from '../../src/theme';

type Tpl = AiStatus['templates'][number];

/** A 9:16 frame drawn from the template's real caption settings (colours, case, outline, layout). */
function Preview({ t }: { t: Tpl }) {
  const st = t.style;
  const up = st?.uppercase ?? true;
  const words = ['This', 'changed', 'everything'].map((w) => (up ? w.toUpperCase() : w));
  const hl = st?.highlightColor ?? '#C8FF2E';
  return (
    <View style={styles.phone}>
      <LinearGradient colors={['#1A1A24', '#0B0B10']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.head} />
      <View style={styles.body} />
      {st?.captions === false ? null : (
        <View style={styles.caption}>
          {words.map((w, j) => (
            <Text
              key={w}
              variant="label"
              color={j === 1 ? hl : (st?.textColor ?? '#FFFFFF')}
              style={{ fontFamily: fonts.extrabold, fontSize: 13, textShadowColor: st?.stroke ? '#000' : 'transparent', textShadowRadius: st?.stroke ? 4 : 0 }}
            >
              {w}
            </Text>
          ))}
        </View>
      )}
      <View style={styles.tag}>
        <Text variant="label" color="#FFFFFF" style={{ fontFamily: fonts.semibold, fontSize: 10.5 }} numberOfLines={1}>
          {[st?.fontFamily, st?.layout].filter(Boolean).join(' · ') || t.name}
        </Text>
      </View>
    </View>
  );
}

function StyleFacts({ t }: { t: Tpl }) {
  const st = t.style;
  if (!st) return null;
  const facts = [
    st.captions ? 'Captions' : 'No captions',
    st.animation ? st.animation.replace(/[-_]/g, ' ').replace(/word level/i, 'word-level') : null,
    st.uppercase ? 'Uppercase' : null,
    st.emoji ? 'Emojis' : null,
  ].filter(Boolean);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {st.highlightColor ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: st.highlightColor }} /> : null}
      <Text variant="label" color={colors.textMuted} style={{ fontFamily: fonts.regular, flex: 1 }} numberOfLines={2}>
        {facts.join(' · ')}
      </Text>
    </View>
  );
}

/** OpusClip brand templates: caption style, layout and branding applied to AI clips. */
export default function Brands() {
  const [ai, setAi] = useState<AiStatus | null>(null);
  const chosen = useDraft((s) => s.options.aiTemplateId);

  useEffect(() => {
    api<AiStatus>('/ai/status').then(setAi, () => setAi({ enabled: false, ok: false, provider: 'OpusClip', templates: [] }));
  }, []);

  const use = (id?: string) => {
    useDraft.getState().setOptions({ mode: 'ai', aiTemplateId: id });
    useDraft.getState().remember();
    router.navigate('/create?mode=ai');
  };

  return (
    <Screen
      eyebrow="Brand"
      title="Brand templates"
      subtitle="Caption style, layout and branding that the AI applies to every AI clip."
      right={<Button label="Edit in OpusClip" variant="secondary" icon="open-outline" onPress={() => void Linking.openURL('https://clip.opus.pro/brands')} />}
      wide
    >
      {ai === null ? (
        <View style={styles.grid}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ width: 240, height: 420, borderRadius: radius.lg }} />
          ))}
        </View>
      ) : !ai.enabled ? (
        <Empty icon="color-palette-outline" title="AI clips are off" hint="Brand templates come from your OpusClip account. Add OPUSCLIP_API_KEY on the server, then they show up here. For your own logo on any clip, use a brand kit." action={<Button label="Open brand kits" icon="briefcase-outline" onPress={() => router.navigate('/brand-kits')} />} />
      ) : !ai.ok ? (
        <Notice tone="warning">{ai.message ?? 'Could not reach OpusClip.'}</Notice>
      ) : (
        <>
          <Notice tone="info">Templates are created and edited in OpusClip (fonts, caption animation, emojis, layout, watermark). Pick one here to use it for your next AI clips.</Notice>
          <View style={styles.grid}>
            <Pressable onPress={() => use(undefined)} style={(s) => [styles.card, !chosen && styles.on, (s as { hovered?: boolean }).hovered && { borderColor: colors.borderStrong }]}>
              <View style={[styles.phone, styles.auto]}>
                <Ionicons name="star" size={28} color={colors.highlight === '#0A0A0F' ? colors.text : colors.highlight} />
                <Text variant="title" align="center">
                  Account default
                </Text>
                <Text variant="label" color={colors.textMuted} align="center" style={{ fontFamily: fonts.regular }}>
                  Whatever is set as default in OpusClip
                </Text>
              </View>
              <View style={styles.row}>
                <Text variant="title" style={{ flex: 1 }}>
                  Default
                </Text>
                {!chosen ? <Badge tone="lime" icon="checkmark">In use</Badge> : null}
              </View>
            </Pressable>
            {ai.templates.map((t) => {
              const on = chosen === t.id;
              return (
                <Pressable key={t.id} onPress={() => use(t.id)} style={(s) => [styles.card, on && styles.on, (s as { hovered?: boolean }).hovered && { borderColor: colors.borderStrong }]}>
                  <Preview t={t} />
                  <StyleFacts t={t} />
                  <View style={styles.row}>
                    <Text variant="title" style={{ flex: 1 }} numberOfLines={1}>
                      {t.name}
                    </Text>
                    {t.isDefault ? <Badge icon="star">Default</Badge> : null}
                    {on ? <Badge tone="lime" icon="checkmark">In use</Badge> : null}
                  </View>
                  <Button label={on ? 'Selected · new AI project' : 'Use for AI clips'} size="sm" variant={on ? 'primary' : 'secondary'} icon="sparkles" onPress={() => use(t.id)} />
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  card: { width: 240, gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  on: { borderColor: colors.highlight },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phone: { width: '100%', aspectRatio: 9 / 16, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center' },
  auto: { justifyContent: 'center', gap: 8, padding: space.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  head: { position: 'absolute', top: '26%', width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(0,0,0,0.3)' },
  body: { position: 'absolute', top: '45%', width: 150, height: 200, borderTopLeftRadius: 75, borderTopRightRadius: 75, backgroundColor: 'rgba(0,0,0,0.3)' },
  caption: { position: 'absolute', bottom: '22%', flexDirection: 'row', gap: 5, paddingHorizontal: 8, paddingVertical: 5 },
  captionBox: { backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6 },
  tag: { position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
});
