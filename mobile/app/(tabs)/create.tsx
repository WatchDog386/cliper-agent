import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AccountPicker } from '../../src/components/AccountPicker';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Segmented } from '../../src/components/Segmented';
import { Text } from '../../src/components/Text';
import { AspectPicker, Card, Chips, Notice, OptionCards, ProgressBar, Screen, SectionTitle, ToggleRow } from '../../src/components/ui';
import { api, uploadVideo } from '../../src/api/client';
import type { AppConfig, AutoPublish, ClipOptions, Job, SocialAccount, SourceMeta } from '../../src/api/types';
import { useDraft } from '../../src/store/draft';
import { colors, fonts, radius, space } from '../../src/theme';
import { clock, compact, estimateClips, parseClock } from '../../src/utils/format';

const LENGTHS = [15, 30, 45, 60, 90, 180];
const RES: Record<string, Record<string, string>> = {
  phone: { '480': '480×854', '720': '720×1280', '1080': '1080×1920' },
  desktop: { '480': '854×480', '720': '1280×720', '1080': '1920×1080' },
  square: { '480': '480×480', '720': '720×720', '1080': '1080×1080' },
  portrait: { '480': '480×600', '720': '720×900', '1080': '1080×1350' },
  original: { '480': 'up to 480p', '720': 'up to 720p', '1080': 'up to 1080p' },
};

type Picked = { name: string; size?: number; uri: string; mimeType?: string; file?: File };

export default function Create() {
  const draft = useDraft();
  const o = draft.options;
  const set = draft.setOptions;

  const [source, setSource] = useState<'link' | 'file'>('link');
  const [url, setUrl] = useState(draft.url);
  const [meta, setMeta] = useState<SourceMeta | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [file, setFile] = useState<Picked | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [customLen, setCustomLen] = useState(LENGTHS.includes(o.segmentSeconds) ? '' : String(o.segmentSeconds));
  const [trimStart, setTrimStart] = useState('');
  const [trimEnd, setTrimEnd] = useState('');
  const [ranges, setRanges] = useState<{ start: string; end: string }[]>([{ start: '', end: '' }]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  // "Post automatically": the accounts every finished clip goes to
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [autoTo, setAutoTo] = useState<string[]>([]);
  const [autoCaption, setAutoCaption] = useState('');
  const [autoEvery, setAutoEvery] = useState(60);

  // Accounts may have been connected on the Channels tab since this page was last open
  useFocusEffect(
    useCallback(() => {
      api<{ accounts: SocialAccount[] }>('/social/accounts').then(
        (r) => {
          setAccounts(r.accounts);
          setAutoTo((cur) => cur.filter((id) => r.accounts.some((a) => a.id === id && !a.needsReconnect)));
        },
        () => undefined,
      );
    }, []),
  );

  useEffect(() => {
    api<AppConfig>('/config').then(setConfig, () => undefined);
  }, []);

  // A video picked in Trending arrives here
  useEffect(() => {
    if (draft.url && draft.url !== url) {
      setSource('link');
      setUrl(draft.url);
      setMeta(null);
      void inspect(draft.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.url]);

  const inspect = async (link = url) => {
    if (!link.trim()) return;
    setChecking(true);
    setError('');
    setWarnings([]);
    try {
      const r = await api<{ source: SourceMeta; warnings: string[] }>('/source/inspect', { body: { url: link.trim() } });
      setMeta(r.source);
      setWarnings(r.warnings);
    } catch (e) {
      setMeta(null);
      setError(e instanceof Error ? e.message : 'Could not read that link');
    } finally {
      setChecking(false);
    }
  };

  const paste = async () => {
    const text = (await Clipboard.getStringAsync().catch(() => '')).trim();
    if (text) {
      setUrl(text);
      setMeta(null);
      void inspect(text);
    }
  };

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    setFile({ name: a.name, size: a.size ?? undefined, uri: a.uri, mimeType: a.mimeType ?? undefined, file: (a as { file?: File }).file });
    setError('');
  };

  const parsedRanges = ranges
    .map((r) => ({ start: parseClock(r.start), end: parseClock(r.end) }))
    .filter((r): r is { start: number; end: number } => r.start !== undefined && r.end !== undefined && r.end > r.start);

  const options: ClipOptions = useMemo(
    () => ({
      ...o,
      startAt: o.mode === 'custom' ? undefined : parseClock(trimStart),
      endAt: o.mode === 'custom' ? undefined : parseClock(trimEnd),
      ranges: o.mode === 'custom' ? parsedRanges : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [o, trimStart, trimEnd, ranges],
  );

  const duration = source === 'link' ? meta?.duration : null;
  const estimate = estimateClips(duration, options);

  const submit = async () => {
    setError('');
    if (source === 'link' && !url.trim()) return setError('Paste a video link first');
    if (source === 'file' && !file) return setError('Choose a video file first');
    if (o.mode === 'custom' && !parsedRanges.length) return setError('Add at least one time range, e.g. 0:30 to 1:00');
    if (o.hook === 'custom' && !o.hookText?.trim()) return setError('Write the hook title to show on the clips, or choose another hook option');
    setBusy(true);
    try {
      let job: Job;
      const autoPublish: AutoPublish | undefined = autoTo.length ? { accountIds: autoTo, caption: autoCaption.trim(), privacy: 'public', everyMinutes: autoEvery } : undefined;
      if (source === 'link') {
        job = (await api<{ job: Job }>('/jobs', { body: { url: url.trim(), title: meta?.title ?? draft.title, thumbnailUrl: meta?.thumbnail ?? draft.thumbnail, options, autoPublish } })).job;
      } else {
        const form = new FormData();
        if (Platform.OS === 'web' && file!.file) form.append('file', file!.file, file!.name);
        else form.append('file', { uri: file!.uri, name: file!.name, type: file!.mimeType ?? 'video/mp4' } as unknown as Blob);
        form.append('options', JSON.stringify(options));
        if (autoPublish) form.append('autoPublish', JSON.stringify(autoPublish));
        setUploadPct(0);
        job = (await uploadVideo<{ job: Job }>('/jobs/upload', form, setUploadPct)).job;
      }
      draft.remember();
      draft.setUrl('');
      setUrl('');
      setMeta(null);
      setFile(null);
      router.push(`/job/${job.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start clipping');
    } finally {
      setBusy(false);
      setUploadPct(null);
    }
  };

  return (
    <Screen title="New clips" subtitle="Paste a link, pick a length and a view, and let the agent cut it.">
      {/* ── Source ── */}
      <Card>
        <Segmented
          options={[
            { value: 'link', label: 'Video link' },
            { value: 'file', label: 'Upload a file' },
          ]}
          value={source}
          onChange={setSource}
        />
        {source === 'link' ? (
          <>
            <View style={styles.urlRow}>
              <View style={{ flex: 1 }}>
                <Input
                  icon="link-outline"
                  value={url}
                  onChangeText={(t) => {
                    setUrl(t);
                    setMeta(null);
                  }}
                  onSubmitEditing={() => void inspect()}
                  onBlur={() => !meta && url.trim().length > 8 && void inspect()}
                  placeholder="https://youtube.com/watch?v=…  ·  tiktok.com/…  ·  x.com/…"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
              <Button label="Paste" variant="secondary" icon="clipboard-outline" onPress={() => void paste()} />
            </View>
            {checking ? (
              <Text variant="bodySm" color={colors.textMuted}>
                Reading the link…
              </Text>
            ) : null}
            {meta ? (
              <View style={styles.preview}>
                {meta.thumbnail ? <Image source={{ uri: meta.thumbnail }} style={styles.thumb} /> : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="title" numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
                    {meta.title}
                  </Text>
                  <Text variant="label" color={colors.textMuted}>
                    {[meta.site, meta.uploader, clock(meta.duration), meta.viewCount ? `${compact(meta.viewCount)} views` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            ) : null}
            {warnings.map((w) => (
              <Notice key={w} tone="warning">
                {w}
              </Notice>
            ))}
          </>
        ) : (
          <Pressable onPress={() => void pick()} style={styles.drop}>
            <Ionicons name={file ? 'videocam' : 'cloud-upload-outline'} size={28} color={colors.brand} />
            <Text variant="title" align="center">
              {file ? file.name : 'Choose a video from this device'}
            </Text>
            <Text variant="label" color={colors.textMuted} align="center">
              {file?.size ? `${(file.size / 1e6).toFixed(1)} MB · tap to change` : `MP4, MOV, MKV, WEBM… up to ${config?.limits.maxUploadMb ?? 2048} MB`}
            </Text>
          </Pressable>
        )}
      </Card>

      {/* ── How to cut ── */}
      <Card>
        <SectionTitle hint="How the video is turned into clips">Clipping mode</SectionTitle>
        <OptionCards
          value={o.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'split', label: 'Split evenly', hint: 'Back-to-back clips of the length you choose', icon: 'grid-outline' },
            { value: 'highlights', label: 'Best moments', hint: 'The agent picks the most energetic parts', icon: 'flame-outline' },
            { value: 'custom', label: 'My time ranges', hint: 'Cut exactly the parts you list', icon: 'time-outline' },
          ]}
        />

        {o.mode !== 'custom' ? (
          <>
            <SectionTitle hint="Each clip will be this long">Clip length</SectionTitle>
            <Chips
              value={customLen ? -1 : o.segmentSeconds}
              onChange={(v) => {
                if (v === -1) return;
                setCustomLen('');
                set({ segmentSeconds: v });
              }}
              options={LENGTHS.map((s) => ({ value: s, label: s < 60 ? `${s}s` : `${s / 60} min` }))}
            />
            <View style={styles.inline}>
              <Text variant="bodySm" color={colors.textMuted}>
                Or exactly
              </Text>
              <TextInput
                value={customLen}
                onChangeText={(t) => {
                  setCustomLen(t);
                  const n = Number(t);
                  if (n >= 3 && n <= 600) set({ segmentSeconds: n });
                }}
                placeholder="e.g. 20"
                keyboardType="numeric"
                placeholderTextColor={colors.textDim}
                style={styles.smallInput}
              />
              <Text variant="bodySm" color={colors.textMuted}>
                seconds
              </Text>
            </View>

            <SectionTitle hint="Leave empty to use the whole video (m:ss or seconds)">Use only part of the video</SectionTitle>
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Input label="From" value={trimStart} onChangeText={setTrimStart} placeholder="0:00" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="To" value={trimEnd} onChangeText={setTrimEnd} placeholder={meta?.duration ? clock(meta.duration) : 'end'} />
              </View>
            </View>
          </>
        ) : (
          <>
            <SectionTitle hint="m:ss or seconds, e.g. 1:05 → 1:35">Time ranges</SectionTitle>
            {ranges.map((r, i) => (
              <View key={i} style={styles.rangeRow}>
                <Text variant="label" color={colors.textMuted} style={{ width: 22 }}>
                  {i + 1}.
                </Text>
                <View style={{ flex: 1 }}>
                  <Input value={r.start} onChangeText={(t) => setRanges(ranges.map((x, j) => (j === i ? { ...x, start: t } : x)))} placeholder="start" />
                </View>
                <View style={{ flex: 1 }}>
                  <Input value={r.end} onChangeText={(t) => setRanges(ranges.map((x, j) => (j === i ? { ...x, end: t } : x)))} placeholder="end" />
                </View>
                <Pressable onPress={() => setRanges(ranges.length > 1 ? ranges.filter((_, j) => j !== i) : [{ start: '', end: '' }])} hitSlop={8} accessibilityLabel="Remove range">
                  <Ionicons name="close-circle" size={22} color={colors.textDim} />
                </Pressable>
              </View>
            ))}
            <Button label="Add range" variant="ghost" icon="add" onPress={() => setRanges([...ranges, { start: '', end: '' }])} style={{ alignSelf: 'flex-start' }} />
          </>
        )}

        <SectionTitle>Most clips</SectionTitle>
        <Chips value={o.maxClips} onChange={(maxClips) => set({ maxClips })} options={[3, 5, 10, 20, config?.limits.maxClipsPerJob ?? 50].filter((v, i, a) => a.indexOf(v) === i).map((n) => ({ value: n, label: String(n) }))} />
      </Card>

      {/* ── View ── */}
      <Card>
        <SectionTitle hint="Where the clips will be watched">View</SectionTitle>
        <AspectPicker value={o.aspect} onChange={(aspect) => set({ aspect })} />
        {o.aspect !== 'original' ? (
          <>
            <SectionTitle hint="When the source is a different shape">Framing</SectionTitle>
            <OptionCards
              value={o.fit}
              onChange={(fit) => set({ fit })}
              options={[
                { value: 'blur', label: 'Blurred background', hint: 'Whole picture, blurred fill behind', icon: 'water-outline' },
                { value: 'crop', label: 'Fill & crop', hint: 'Fills the screen, trims the edges', icon: 'crop-outline' },
                { value: 'pad', label: 'Black bars', hint: 'Whole picture, letterboxed', icon: 'tablet-landscape-outline' },
              ]}
            />
            {o.fit === 'crop' ? (
              <>
                <SectionTitle hint="Which part of the picture to keep">Crop focus</SectionTitle>
                <Chips
                  value={o.focus}
                  onChange={(focus) => set({ focus })}
                  options={[
                    { value: 'start', label: o.aspect === 'desktop' ? 'Top' : 'Left', icon: 'arrow-back' },
                    { value: 'center', label: 'Centre', icon: 'locate-outline' },
                    { value: 'end', label: o.aspect === 'desktop' ? 'Bottom' : 'Right', icon: 'arrow-forward' },
                  ]}
                />
              </>
            ) : null}
          </>
        ) : null}
        <SectionTitle>Quality</SectionTitle>
        <Chips
          value={o.quality}
          onChange={(quality) => set({ quality })}
          options={[
            { value: '480', label: `480p · ${RES[o.aspect]!['480']}` },
            { value: '720', label: `720p · ${RES[o.aspect]!['720']}` },
            { value: '1080', label: `1080p · ${RES[o.aspect]!['1080']}` },
          ]}
        />
      </Card>

      {/* ── Extras ── */}
      <Card>
        <SectionTitle>Extras</SectionTitle>
        <ToggleRow icon="contrast-outline" label="Fade in and out" hint="Smooth start and end on every clip" value={o.fade} onChange={(fade) => set({ fade })} />
        <ToggleRow icon="volume-mute-outline" label="Remove sound" hint="Add your own music when posting" value={o.mute} onChange={(mute) => set({ mute })} />
        <SectionTitle>Speed</SectionTitle>
        <Chips
          value={o.speed}
          onChange={(speed) => set({ speed })}
          options={[0.75, 1, 1.25, 1.5, 2].map((s) => ({ value: s, label: `${s}×` }))}
        />
      </Card>

      {/* ── Edits: what makes a clip ready to post ── */}
      <Card>
        <SectionTitle hint="Burned into every clip, so it is ready to post as it comes out">Edits</SectionTitle>
        <ToggleRow icon="chatbox-ellipses-outline" label="Captions" hint="What is said, a few words at a time" value={o.captions} onChange={(captions) => set({ captions })} />
        {o.captions ? (
          <Chips
            value={o.captionStyle}
            onChange={(captionStyle) => set({ captionStyle })}
            options={[
              { value: 'karaoke', label: 'Word lights up' },
              { value: 'bold', label: 'Bold' },
              { value: 'minimal', label: 'Small' },
            ]}
          />
        ) : null}
        {o.captions && config && !config.features.captions ? <Notice tone="warning">This server has no transcription service yet, so clips will come out without captions. The admin can switch it on (WHISPER_URL, see docs/AUTOPILOT.md).</Notice> : null}
        <SectionTitle hint="A title across the top for the first seconds: what stops people scrolling">Hook title</SectionTitle>
        <Chips
          value={o.hook}
          onChange={(hook) => set({ hook })}
          options={[
            { value: 'auto', label: 'Written per clip', icon: 'sparkles-outline' },
            { value: 'custom', label: 'My own text', icon: 'create-outline' },
            { value: 'none', label: 'None' },
          ]}
        />
        {o.hook === 'custom' ? <Input value={o.hookText ?? ''} onChangeText={(hookText) => set({ hookText })} maxLength={80} placeholder="e.g. He was NOT ready for this" /> : null}
        {o.hook === 'auto' && config && !config.features.ai ? (
          <Text variant="label" color={colors.textMuted}>
            Without the AI key the hook is the first thing said in the clip, or the video's title.
          </Text>
        ) : null}
        <ToggleRow icon="person-circle-outline" label="Credit the creator" hint="Their name in a corner, and in the caption" value={o.credit} onChange={(credit) => set({ credit })} />
        <ToggleRow icon="volume-high-outline" label="Even out the sound" hint="The loudness the platforms play at" value={o.normalizeAudio} onChange={(normalizeAudio) => set({ normalizeAudio })} />
        {o.mode === 'highlights' ? (
          <ToggleRow
            icon="sparkles-outline"
            label="Choose moments by what is said"
            hint={config && !(config.features.ai && config.features.captions) ? 'Needs the transcription service and the AI key: loudness is used until then' : 'The AI reads the whole transcript; otherwise loudness decides'}
            value={o.aiPick}
            onChange={(aiPick) => set({ aiPick })}
          />
        ) : null}
        <Input label="Topic (for hashtags and titles)" value={o.topic ?? ''} onChangeText={(topic) => set({ topic: topic || undefined })} maxLength={80} placeholder="e.g. GTA 6" />
      </Card>

      {/* ── Post automatically ── */}
      <Card>
        <SectionTitle hint={accounts.length ? 'Tick accounts to post every clip as soon as it is ready. Leave empty to post by hand later.' : 'Connect your social accounts to post clips straight from here.'}>Post automatically</SectionTitle>
        {accounts.length ? (
          <>
            <AccountPicker accounts={accounts} value={autoTo} onChange={setAutoTo} />
            {autoTo.length ? (
              <>
                <Input label="Caption for every post ({n} = clip number, {title} = video title)" value={autoCaption} onChangeText={setAutoCaption} multiline maxLength={5000} placeholder="{title} · part {n} #shorts" />
                <SectionTitle hint="So a long video feeds your channels for hours instead of flooding them">Time between clips</SectionTitle>
                <Chips
                  value={autoEvery}
                  onChange={setAutoEvery}
                  options={[
                    { value: 0, label: 'All at once' },
                    { value: 30, label: '30 min' },
                    { value: 60, label: '1 hour' },
                    { value: 180, label: '3 hours' },
                    { value: 1440, label: '1 day' },
                  ]}
                />
              </>
            ) : null}
          </>
        ) : (
          <Button label="Connect accounts" variant="secondary" icon="share-social-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.navigate('/channels')} />
        )}
      </Card>

      {/* ── Go ── */}
      <Card style={{ backgroundColor: colors.hero, borderColor: colors.heroBorder }}>
        <Text variant="h2" color={colors.onHero} fixedColor style={{ fontFamily: fonts.bold }}>
          {estimate !== null ? `${estimate} clip${estimate === 1 ? '' : 's'}` : o.mode === 'custom' ? `${parsedRanges.length} clips` : 'Up to ' + o.maxClips + ' clips'}
          {o.mode !== 'custom' ? ` of ${o.segmentSeconds < 60 ? `${o.segmentSeconds}s` : clock(o.segmentSeconds)}` : ''}
        </Text>
        <Text variant="bodySm" color={colors.onHeroMuted} fixedColor>
          {o.aspect === 'original' ? 'Original shape' : `${o.aspect[0]!.toUpperCase()}${o.aspect.slice(1)} view · ${RES[o.aspect]![o.quality]}`}
          {o.aspect !== 'original' ? ` · ${o.fit === 'blur' ? 'blurred background' : o.fit === 'crop' ? 'cropped to fill' : 'black bars'}` : ''}
          {o.mode === 'highlights' ? ' · best moments' : ''}
          {o.speed !== 1 ? ` · ${o.speed}×` : ''}
          {o.mute ? ' · no sound' : ''}
          {o.captions ? ' · captions' : ''}
          {o.hook !== 'none' ? ' · hook title' : ''}
          {autoTo.length ? ` · posted to ${autoTo.length} account${autoTo.length === 1 ? '' : 's'}` : ''}
        </Text>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {uploadPct !== null ? (
          <View style={{ gap: 6 }}>
            <ProgressBar value={uploadPct * 100} />
            <Text variant="label" color={colors.onHeroMuted} fixedColor>
              Uploading… {Math.round(uploadPct * 100)}%
            </Text>
          </View>
        ) : null}
        <Button label={autoTo.length ? 'Clip it and post' : 'Clip it'} icon="cut" size="lg" loading={busy} onPress={() => void submit()} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  preview: { flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  thumb: { width: 112, height: 63, borderRadius: radius.sm, backgroundColor: '#000' },
  drop: { alignItems: 'center', gap: 6, padding: space.xxl, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  smallInput: {
    width: 80,
    height: 38,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontFamily: fonts.medium,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  row2: { flexDirection: 'row', gap: space.md },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
