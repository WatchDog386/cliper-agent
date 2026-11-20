import { useCallback, useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, IconButton } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Text } from '../../src/components/Text';
import { Badge, Card, Chips, Empty, Notice, Screen, SectionTitle, Skeleton, ToggleRow } from '../../src/components/ui';
import { api, uploadVideo } from '../../src/api/client';
import type { BrandKit, LogoPosition } from '../../src/api/types';
import { useDraft } from '../../src/store/draft';
import { colors, fonts, radius, space } from '../../src/theme';
import { useDesktop } from '../../src/theme/desktop';
import { confirm } from '../../src/utils/confirm';

const SWATCHES = ['#C8FF2E', '#9B6BFF', '#FF4FA3', '#38E1FF', '#FFB547', '#FF5A6A', '#FFFFFF', '#0A0A0F'];
const POSITIONS: { value: LogoPosition; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
];

/** A 9:16 frame showing where the logo lands, at its real relative size. */
function KitPreview({ kit, width = 220 }: { kit: BrandKit; width?: number }) {
  const h = (width * 16) / 9;
  const lw = (width * kit.logoSize) / 100;
  const m = width * 0.04;
  const pos = { [kit.logoPosition.startsWith('top') ? 'top' : 'bottom']: m, [kit.logoPosition.endsWith('left') ? 'left' : 'right']: m };
  return (
    <View style={[styles.frame, { width, height: h }]}>
      <LinearGradient colors={[kit.secondaryColor, '#0B0B10']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.person, { top: h * 0.3, width: width * 0.3, height: width * 0.3, borderRadius: width * 0.15 }]} />
      <View style={[styles.person, { top: h * 0.3 + width * 0.34, width: width * 0.62, height: h * 0.45, borderTopLeftRadius: width * 0.31, borderTopRightRadius: width * 0.31 }]} />
      <View style={[styles.cap, { bottom: h * 0.18 }]}>
        <Text variant="label" color={kit.primaryColor} style={{ fontFamily: fonts.extrabold, fontSize: Math.max(10, width / 18) }}>
          YOUR CAPTION HERE
        </Text>
      </View>
      <View style={[{ position: 'absolute', width: lw, opacity: kit.logoOpacity }, pos]}>
        {kit.logoUrl ? (
          <Image source={{ uri: kit.logoUrl }} style={{ width: lw, height: lw * 0.42 }} resizeMode="contain" />
        ) : (
          <View style={[styles.logoGhost, { width: lw, height: lw * 0.42 }]}>
            <Text variant="label" color="rgba(255,255,255,0.7)" style={{ fontSize: Math.max(8, lw / 6) }}>
              LOGO
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label" color={colors.textMuted}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {SWATCHES.map((c) => (
          <Pressable key={c} onPress={() => onChange(c)} accessibilityLabel={`Colour ${c}`} style={[styles.swatch, { backgroundColor: c }, value.toUpperCase() === c && styles.swatchOn]} />
        ))}
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (/^#[0-9a-fA-F]{6}$/.test(t)) onChange(t.toUpperCase());
          }}
          maxLength={7}
          autoCapitalize="characters"
          style={[styles.hex, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
          accessibilityLabel={`${label} hex`}
        />
      </View>
    </View>
  );
}

/** Brand kits: colours plus a logo that is stamped on every clip rendered with the kit. */
export default function BrandKits() {
  const desktop = useDesktop();
  const [kits, setKits] = useState<BrandKit[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<BrandKit | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async (select?: string) => {
    try {
      const r = await api<{ kits: BrandKit[] }>('/brand-kits');
      setKits(r.kits);
      const pick = r.kits.find((k) => k.id === select) ?? r.kits[0] ?? null;
      setSel(pick?.id ?? null);
      setDraft(pick);
    } catch (e) {
      setKits([]);
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not load brand kits' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      if (done) setMsg({ tone: 'success', text: done });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setBusy('');
    }
  };

  const create = () =>
    run('new', async () => {
      const r = await api<{ kit: BrandKit }>('/brand-kits', { body: { name: `Brand kit ${(kits?.length ?? 0) + 1}` } });
      await load(r.kit.id);
    });

  const save = () =>
    draft &&
    run(
      'save',
      async () => {
        const { name, primaryColor, secondaryColor, logoPosition, logoSize, logoOpacity, isDefault } = draft;
        await api(`/brand-kits/${draft.id}`, { method: 'PATCH', body: { name, primaryColor, secondaryColor, logoPosition, logoSize, logoOpacity, isDefault } });
        await load(draft.id);
      },
      'Brand kit saved',
    );

  const pickLogo = () =>
    draft &&
    run(
      'logo',
      async () => {
        const r = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg', 'image/webp'], copyToCacheDirectory: true });
        if (r.canceled || !r.assets?.[0]) return;
        const a = r.assets[0];
        if (a.size && a.size > 1024 * 1024) throw new Error('The logo must be 1 MB or smaller');
        const form = new FormData();
        const file = (a as { file?: File }).file;
        if (Platform.OS === 'web' && file) form.append('file', file, a.name);
        else form.append('file', { uri: a.uri, name: a.name, type: a.mimeType ?? 'image/png' } as unknown as Blob);
        await uploadVideo(`/brand-kits/${draft.id}/logo`, form, () => undefined);
        await load(draft.id);
      },
      'Logo uploaded',
    );

  const set = (patch: Partial<BrandKit>) => draft && setDraft({ ...draft, ...patch });
  const dirty = draft && kits && JSON.stringify(kits.find((k) => k.id === draft.id)) !== JSON.stringify(draft);

  return (
    <Screen eyebrow="Brand" title="Brand kits" subtitle="Your logo and colours, stamped on every clip you render with the kit." right={<Button label="New brand kit" icon="add" loading={busy === 'new'} onPress={() => void create()} />} wide>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {kits === null ? (
        <Skeleton style={{ height: 480, borderRadius: radius.xl }} />
      ) : kits.length === 0 ? (
        <Empty icon="briefcase-outline" title="No brand kits yet" hint="Upload your logo once and every clip carries it: pick the corner, size and opacity, then choose the kit when you create clips." action={<Button label="Create a brand kit" icon="add" onPress={() => void create()} />} />
      ) : (
        <View style={[styles.cols, !desktop && { flexDirection: 'column' }]}>
          {/* ── List ── */}
          <View style={[{ gap: space.sm }, desktop && { width: 260 }]}>
            {kits.map((k) => (
              <Pressable
                key={k.id}
                onPress={() => {
                  setSel(k.id);
                  setDraft(k);
                }}
                style={(s) => [styles.item, sel === k.id && styles.itemOn, (s as { hovered?: boolean }).hovered && sel !== k.id && { backgroundColor: colors.surfaceAlt }]}
              >
                <View style={[styles.dot, { backgroundColor: k.primaryColor }]}>
                  <View style={[styles.dotInner, { backgroundColor: k.secondaryColor }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="title" numberOfLines={1}>
                    {k.name}
                  </Text>
                  <Text variant="label" color={colors.textMuted} style={{ fontFamily: fonts.regular }}>
                    {k.logoUrl ? 'Logo · ' : 'No logo · '}
                    {POSITIONS.find((p) => p.value === k.logoPosition)?.label.toLowerCase()}
                  </Text>
                </View>
                {k.isDefault ? <Badge tone="lime">Default</Badge> : null}
              </Pressable>
            ))}
          </View>

          {/* ── Editor ── */}
          {draft ? (
            <Card style={{ flex: 1, minWidth: 0 }}>
              <View style={[styles.editor, !desktop && { flexDirection: 'column-reverse', alignItems: 'center' }]}>
                <View style={{ flex: 1, gap: space.lg, alignSelf: 'stretch' }}>
                  <Input label="Name" value={draft.name} onChangeText={(name) => set({ name })} />
                  <SectionTitle hint="PNG with a transparent background works best · up to 1 MB">Logo</SectionTitle>
                  <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                    {draft.logoUrl ? (
                      <View style={styles.logoBox}>
                        <Image source={{ uri: draft.logoUrl }} style={{ width: 96, height: 40 }} resizeMode="contain" />
                      </View>
                    ) : null}
                    <Button label={draft.logoUrl ? 'Replace logo' : 'Upload logo'} variant="secondary" icon="image-outline" loading={busy === 'logo'} onPress={() => void pickLogo()} />
                    {draft.logoUrl ? <Button label="Remove" variant="ghost" onPress={() => void run('rmlogo', async () => (await api(`/brand-kits/${draft.id}/logo`, { method: 'DELETE' }), load(draft.id)))} /> : null}
                  </View>
                  <SectionTitle>Placement</SectionTitle>
                  <Chips size="sm" value={draft.logoPosition} onChange={(logoPosition) => set({ logoPosition })} options={POSITIONS} />
                  <Text variant="label" color={colors.textMuted}>
                    Size: {draft.logoSize}% of the frame width
                  </Text>
                  <Chips size="sm" value={draft.logoSize} onChange={(logoSize) => set({ logoSize })} options={[8, 12, 14, 18, 22, 28, 36].map((v) => ({ value: v, label: `${v}%` }))} />
                  <Text variant="label" color={colors.textMuted}>
                    Opacity
                  </Text>
                  <Chips size="sm" value={draft.logoOpacity} onChange={(logoOpacity) => set({ logoOpacity })} options={[0.4, 0.6, 0.8, 0.9, 1].map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))} />
                  <SectionTitle>Colours</SectionTitle>
                  <ColorField label="Primary (captions, highlights)" value={draft.primaryColor} onChange={(primaryColor) => set({ primaryColor })} />
                  <ColorField label="Secondary (backgrounds)" value={draft.secondaryColor} onChange={(secondaryColor) => set({ secondaryColor })} />
                  <ToggleRow icon="star-outline" label="Default brand kit" hint="Pre-selected on the Create page" value={draft.isDefault} onChange={(isDefault) => set({ isDefault })} />
                  <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                    <Button label="Save changes" icon="checkmark" loading={busy === 'save'} disabled={!dirty} onPress={() => void save()} />
                    <Button
                      label="Use for a new project"
                      variant="secondary"
                      icon="cut"
                      onPress={() => {
                        useDraft.getState().setOptions({ brandKitId: draft.id, mode: useDraft.getState().options.mode === 'ai' ? 'highlights' : useDraft.getState().options.mode });
                        router.navigate('/create');
                      }}
                    />
                    <IconButton
                      icon="trash-outline"
                      tone="danger"
                      size={44}
                      label="Delete brand kit"
                      onPress={() =>
                        void run('del', async () => {
                          if (!(await confirm(`Delete “${draft.name}”? Clips already made keep their logo.`))) return;
                          await api(`/brand-kits/${draft.id}`, { method: 'DELETE' });
                          await load();
                        })
                      }
                    />
                  </View>
                </View>
                <View style={{ alignItems: 'center', gap: 10 }}>
                  <KitPreview kit={draft} width={desktop ? 250 : 220} />
                  <Text variant="label" color={colors.textMuted}>
                    Live preview · 9:16
                  </Text>
                </View>
              </View>
            </Card>
          ) : null}
        </View>
      )}
      <Notice tone="info">The logo is burned into clips made with Split evenly, Best moments and Exact ranges. AI clips use your OpusClip brand template instead (Brand templates).</Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: 'row', gap: space.xl, alignItems: 'flex-start' },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  itemOn: { borderColor: colors.highlight, backgroundColor: colors.surfaceAlt },
  dot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dotInner: { width: 16, height: 16, borderRadius: 8 },
  editor: { flexDirection: 'row', gap: space.xxl, alignItems: 'flex-start' },
  frame: { borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', borderWidth: 1, borderColor: colors.borderStrong },
  person: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.32)' },
  cap: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  logoGhost: { borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.6)', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  logoBox: { padding: 6, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border },
  swatchOn: { borderColor: colors.text, transform: [{ scale: 1.1 }] },
  hex: { width: 96, height: 34, borderRadius: radius.sm, paddingHorizontal: 10, backgroundColor: colors.surfaceAlt, color: colors.text, fontFamily: fonts.medium, borderWidth: 1, borderColor: colors.borderStrong },
});
