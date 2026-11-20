import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Segmented } from '../../src/components/Segmented';
import { Text } from '../../src/components/Text';
import { AspectPicker, Badge, Card, Chips, Notice, OptionCards, ProgressBar, Screen, SectionTitle, Skeleton, ToggleRow } from '../../src/components/ui';
import { api, uploadVideo } from '../../src/api/client';
import type { AiStatus, AppConfig, AutoEdit, BrandKit, ClipOptions, Job, Mode, SourceMeta } from '../../src/api/types';
import { DEFAULT_OPTIONS, EDIT_PRESETS, useDraft } from '../../src/store/draft';
import { colors, fonts, gradients, radius, space } from '../../src/theme';
import { useDesktop } from '../../src/theme/desktop';
import { clock, compact, estimateClips, parseClock } from '../../src/utils/format';

const LENGTHS = [15, 30, 45, 60, 90, 180];
const RES: Record<string, Record<string, string>> = {
  phone: { '480': '480×854', '720': '720×1280', '1080': '1080×1920' },
  desktop: { '480': '854×480', '720': '1280×720', '1080': '1920×1080' },
  square: { '480': '480×480', '720': '720×720', '1080': '1080×1080' },
  portrait: { '480': '480×600', '720': '720×900', '1080': '1080×1350' },
  original: { '480': 'up to 480p', '720': 'up to 720p', '1080': 'up to 1080p' },
};
const PROMPTS = ['Funniest moments', 'Key insights', 'Emotional moments', 'Hot takes', 'Best plays', 'Product demo'];

type Picked = { name: string; size?: number; uri: string; mimeType?: string; file?: File };

/** Keeps the summary in view while the settings scroll (web only). */
const STICKY = (Platform.OS === 'web' ? { position: 'sticky', top: 24 } : {}) as unknown as ViewStyle;

export default function Create() {
  const params = useLocalSearchParams<{ mode?: Mode; source?: 'link' | 'file' }>();
  const desktop = useDesktop();
  const draft = useDraft();
  const o = draft.options;
  const set = draft.setOptions;

  const [source, setSource] = useState<'link' | 'file'>(params.source === 'file' ? 'file' : 'link');
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
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [kits, setKits] = useState<BrandKit[]>([]);

  useEffect(() => {
    api<AppConfig>('/config').then(setConfig, () => undefined);
    api<AiStatus>('/ai/status').then(setAi, () => undefined);
    api<{ kits: BrandKit[] }>('/brand-kits').then(
      (r) => {
        setKits(r.kits);
        const opts = useDraft.getState().options;
        // The default kit is pre-selected; a kit that was deleted is dropped
        if (opts.brandKitId && !r.kits.some((k) => k.id === opts.brandKitId)) set({ brandKitId: undefined });
        else if (opts.brandKitId === undefined) {
          const def = r.kits.find((k) => k.isDefault);
          if (def) set({ brandKitId: def.id });
        }
      },
      () => undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Links from Home / Trending and ?mode=… / ?source=… arrive here
  useEffect(() => {
    if (params.mode && params.mode !== o.mode) set({ mode: params.mode });
    if (params.source) setSource(params.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.mode, params.source]);

  useEffect(() => {
    if (draft.url) {
      setSource('link');
      setUrl(draft.url);
      setMeta(null);
      void inspect(draft.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.nonce]);

  // Settings reset elsewhere (Settings → Reset) also resets the custom-length box
  useEffect(() => {
    if (LENGTHS.includes(o.segmentSeconds)) setCustomLen('');
  }, [o.segmentSeconds]);

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

  const isAi = o.mode === 'ai';
  const aiOff = config ? !config.ai : false;

  const parsedRanges = ranges
    .map((r) => ({ start: parseClock(r.start), end: parseClock(r.end) }))
    .filter((r): r is { start: number; end: number } => r.start !== undefined && r.end !== undefined && r.end > r.start);

  const startAt = parseClock(trimStart);
  const endAt = parseClock(trimEnd);
  const trimError =
    (trimStart.trim() && startAt === undefined) || (trimEnd.trim() && endAt === undefined)
      ? 'Write times as m:ss or seconds, e.g. 1:30 or 90'
      : startAt !== undefined && endAt !== undefined && endAt <= startAt
        ? 'The end must be after the start'
        : meta?.duration && startAt !== undefined && startAt >= meta.duration
          ? `The video is only ${clock(meta.duration)} long`
          : '';
  const lenError = customLen.trim() && !(Number(customLen) >= 3 && Number(customLen) <= 600) ? 'Between 3 and 600 seconds' : '';

  const options: ClipOptions = useMemo(
    () => ({
      ...o,
      startAt: o.mode === 'custom' ? undefined : startAt,
      endAt: o.mode === 'custom' ? undefined : endAt,
      ranges: o.mode === 'custom' ? parsedRanges : undefined,
      aiPrompt: o.mode === 'ai' ? o.aiPrompt?.trim() || undefined : undefined,
      // '' means "no branding" (chosen on purpose); the server only needs a real id
      brandKitId: o.mode !== 'ai' && o.brandKitId ? o.brandKitId : undefined,
      autoEdit: o.mode !== 'ai' ? o.autoEdit : undefined,
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
    if (isAi && source === 'file') return setError('AI clips work from a link. Paste the link, or pick another mode for uploads.');
    if (isAi && aiOff) return setError('AI clips are not set up on this server yet.');
    if (o.mode === 'custom' && !parsedRanges.length) return setError('Add at least one time range, e.g. 0:30 to 1:00');
    if (trimError && o.mode !== 'custom') return setError(trimError);
    if (lenError && !isAi && o.mode !== 'custom') return setError(`Clip length: ${lenError.toLowerCase()}`);
    setBusy(true);
    try {
      let job: Job;
      if (source === 'link') {
        job = (await api<{ job: Job }>('/jobs', { body: { url: url.trim(), title: meta?.title ?? draft.title, thumbnailUrl: meta?.thumbnail ?? draft.thumbnail, options } })).job;
      } else {
        const form = new FormData();
        if (Platform.OS === 'web' && file!.file) form.append('file', file!.file, file!.name);
        else form.append('file', { uri: file!.uri, name: file!.name, type: file!.mimeType ?? 'video/mp4' } as unknown as Blob);
        form.append('options', JSON.stringify(options));
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

  /* ── Sections ── */

  const sourceCard = (
    <Card>
      <SectionTitle step={1} right={<Segmented options={[{ value: 'link', label: 'Link', icon: 'link' }, { value: 'file', label: 'Upload', icon: 'cloud-upload-outline' }]} value={source} onChange={setSource} />}>
        Source video
      </SectionTitle>
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
            <View style={styles.preview}>
              <Skeleton style={styles.thumb} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton style={{ height: 14, width: '80%' }} />
                <Skeleton style={{ height: 12, width: '50%' }} />
              </View>
            </View>
          ) : null}
          {meta ? (
            <View style={styles.preview}>
              <View style={styles.thumb}>{meta.thumbnail ? <Image source={{ uri: meta.thumbnail }} style={StyleSheet.absoluteFill} /> : null}</View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="title" numberOfLines={2}>
                  {meta.title}
                </Text>
                <Text variant="label" color={colors.textMuted} style={{ fontFamily: fonts.regular }}>
                  {[meta.site, meta.uploader, clock(meta.duration), meta.viewCount ? `${compact(meta.viewCount)} views` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            </View>
          ) : null}
          {warnings.map((w) => (
            <Notice key={w} tone="warning">
              {w}
            </Notice>
          ))}
        </>
      ) : (
        <Pressable onPress={() => void pick()} style={(s) => [styles.drop, (s as { hovered?: boolean }).hovered && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}>
          <View style={styles.dropIcon}>
            <Ionicons name={file ? 'videocam' : 'cloud-upload-outline'} size={24} color={colors.text} />
          </View>
          <Text variant="h2" align="center">
            {file ? file.name : 'Choose a video from this device'}
          </Text>
          <Text variant="label" color={colors.textMuted} align="center" style={{ fontFamily: fonts.regular }}>
            {file?.size ? `${(file.size / 1e6).toFixed(1)} MB · tap to change` : `MP4, MOV, MKV, WEBM… up to ${config?.limits.maxUploadMb ?? 2048} MB`}
          </Text>
        </Pressable>
      )}
    </Card>
  );

  const modeCard = (
    <Card glow={isAi}>
      <SectionTitle step={2} hint="How the video is turned into clips">
        Clipping mode
      </SectionTitle>
      <OptionCards
        value={o.mode}
        onChange={(mode) => set({ mode })}
        min={200}
        options={[
          { value: 'ai', label: 'AI clips', hint: 'Finds viral hooks, adds animated captions, titles, hashtags & a virality score', icon: 'sparkles', badge: aiOff ? 'Not set up' : 'OpusClip', ai: true },
          { value: 'highlights', label: 'Best moments', hint: 'Loudness analysis picks the most energetic parts', icon: 'flame-outline' },
          { value: 'split', label: 'Split evenly', hint: 'Back-to-back clips of the length you choose', icon: 'grid-outline' },
          { value: 'custom', label: 'Exact ranges', hint: 'Cut precisely the parts you list', icon: 'time-outline' },
        ]}
      />
      {isAi && aiOff ? <Notice tone="warning">AI clips need an OpusClip API key on the server (OPUSCLIP_API_KEY). Ask the admin, or pick another mode.</Notice> : null}
      {isAi && source === 'file' ? <Notice tone="info">AI clips work from links. Switch the source to Link, or pick another mode for uploads.</Notice> : null}
    </Card>
  );

  const aiCard = isAi ? (
    <Card>
      <SectionTitle step={3} hint="Tell the AI what to look for">
        AI settings
      </SectionTitle>
      <OptionCards
        value={o.aiModel ?? 'ClipAnything'}
        onChange={(aiModel) => set({ aiModel })}
        options={[
          { value: 'ClipAnything', label: 'ClipAnything', hint: 'Any video: sports, vlogs, gaming. Follows your prompt.', icon: 'scan-outline', badge: 'Smart', ai: true },
          { value: 'ClipBasic', label: 'ClipBasic', hint: 'Talking videos: podcasts, interviews, webinars.', icon: 'mic-outline', ai: true },
        ]}
      />
      <View style={{ gap: 8 }}>
        <Text variant="label" color={colors.textMuted}>
          {o.aiModel === 'ClipBasic' ? 'Topic keywords (comma separated, optional)' : 'What should the AI clip? (optional)'}
        </Text>
        <View style={styles.promptBox}>
          <Ionicons name="sparkles" size={16} color={colors.brand} style={{ marginTop: 2 }} />
          <TextInput
            value={o.aiPrompt ?? ''}
            onChangeText={(aiPrompt) => set({ aiPrompt })}
            placeholder={o.aiModel === 'ClipBasic' ? 'e.g. AI, startups, fundraising' : 'e.g. "every time the crowd goes wild" or "the funniest reactions"'}
            placeholderTextColor={colors.textDim}
            multiline
            maxLength={300}
            style={[styles.promptInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
          />
        </View>
        <Chips size="sm" value={-1 as number} onChange={(i) => set({ aiPrompt: PROMPTS[i] })} options={PROMPTS.map((p, i) => ({ value: i, label: p }))} />
      </View>
      <SectionTitle hint="OpusClip picks the best cut inside this range">Clip length</SectionTitle>
      <Chips
        value={o.aiDuration ?? 'auto'}
        onChange={(aiDuration) => set({ aiDuration })}
        options={[
          { value: 'auto', label: 'Auto (0–3 min)', icon: 'sparkles-outline' },
          { value: 'short', label: '< 30s' },
          { value: 'medium', label: '30–60s' },
          { value: 'long', label: '60–90s' },
          { value: 'xl', label: '90s–3m' },
        ]}
      />
      {ai?.templates.length ? (
        <>
          <SectionTitle hint="Caption style, layout and branding from your OpusClip account">Template</SectionTitle>
          <Chips
            value={o.aiTemplateId ?? ''}
            onChange={(id) => set({ aiTemplateId: id || undefined })}
            options={[{ value: '', label: 'Account default', icon: 'star-outline' as const }, ...ai.templates.map((t) => ({ value: t.id, label: t.name + (t.isDefault ? ' ★' : '') }))]}
          />
        </>
      ) : null}
      <ToggleRow icon="megaphone-outline" label="AI hook headline" hint="A punchy title over the first seconds of each clip" value={!!o.aiHook} onChange={(aiHook) => set({ aiHook })} />
      <SectionTitle>Most clips</SectionTitle>
      <Chips value={o.maxClips} onChange={(maxClips) => set({ maxClips })} options={[3, 5, 10, 20, config?.limits.maxClipsPerJob ?? 50].filter((v, i, a) => a.indexOf(v) === i).map((n) => ({ value: n, label: String(n) }))} />
      <SectionTitle hint="Leave empty to use the whole video (m:ss or seconds)">Only part of the video</SectionTitle>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Input label="From" value={trimStart} onChangeText={setTrimStart} placeholder="0:00" />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="To" value={trimEnd} onChangeText={setTrimEnd} placeholder={meta?.duration ? clock(meta.duration) : 'end'} />
        </View>
      </View>
      {trimError ? <Notice tone="warning">{trimError}</Notice> : null}
    </Card>
  ) : null;

  const cutCard = !isAi ? (
    <Card>
      <SectionTitle step={3} hint={o.mode === 'custom' ? 'm:ss or seconds, e.g. 1:05 → 1:35' : 'Each clip will be this long'}>
        {o.mode === 'custom' ? 'Time ranges' : 'Clip length'}
      </SectionTitle>
      {o.mode !== 'custom' ? (
        <>
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
              style={[styles.smallInput, lenError ? { borderColor: colors.danger } : null]}
            />
            <Text variant="bodySm" color={lenError ? colors.danger : colors.textMuted}>
              {lenError || 'seconds'}
            </Text>
          </View>
          <SectionTitle hint="Leave empty to use the whole video (m:ss or seconds)">Only part of the video</SectionTitle>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Input label="From" value={trimStart} onChangeText={setTrimStart} placeholder="0:00" error={trimStart.trim() && startAt === undefined ? 'm:ss or seconds' : undefined} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="To" value={trimEnd} onChangeText={setTrimEnd} placeholder={meta?.duration ? clock(meta.duration) : 'end'} error={trimEnd.trim() && endAt === undefined ? 'm:ss or seconds' : undefined} />
            </View>
          </View>
          {trimError && !(trimStart.trim() && startAt === undefined) && !(trimEnd.trim() && endAt === undefined) ? <Notice tone="warning">{trimError}</Notice> : null}
        </>
      ) : (
        <>
          {ranges.map((r, i) => {
            const bad = (r.start.trim() || r.end.trim()) && !parsedRanges.some((p) => p.start === parseClock(r.start) && p.end === parseClock(r.end));
            return (
              <View key={i} style={styles.rangeRow}>
                <View style={styles.rangeNum}>
                  <Text variant="label" style={{ fontFamily: fonts.bold }}>
                    {i + 1}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Input value={r.start} onChangeText={(t) => setRanges(ranges.map((x, j) => (j === i ? { ...x, start: t } : x)))} placeholder="start" />
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.textDim} />
                <View style={{ flex: 1 }}>
                  <Input value={r.end} onChangeText={(t) => setRanges(ranges.map((x, j) => (j === i ? { ...x, end: t } : x)))} placeholder="end" error={bad && r.start.trim() && r.end.trim() ? 'check times' : undefined} />
                </View>
                <Pressable onPress={() => setRanges(ranges.length > 1 ? ranges.filter((_, j) => j !== i) : [{ start: '', end: '' }])} hitSlop={8} accessibilityLabel="Remove range">
                  <Ionicons name="close-circle" size={22} color={colors.textDim} />
                </Pressable>
              </View>
            );
          })}
          <Button label="Add range" variant="secondary" size="sm" icon="add" onPress={() => setRanges([...ranges, { start: '', end: '' }])} style={{ alignSelf: 'flex-start' }} />
        </>
      )}
      <SectionTitle>Most clips</SectionTitle>
      <Chips value={o.maxClips} onChange={(maxClips) => set({ maxClips })} options={[3, 5, 10, 20, config?.limits.maxClipsPerJob ?? 50].filter((v, i, a) => a.indexOf(v) === i).map((n) => ({ value: n, label: String(n) }))} />
    </Card>
  ) : null;

  const ae: AutoEdit = o.autoEdit ?? DEFAULT_OPTIONS.autoEdit!;
  const setAe = (patch: Partial<AutoEdit>) => set({ autoEdit: { ...ae, ...patch } });
  const preset = (Object.keys(EDIT_PRESETS) as (keyof typeof EDIT_PRESETS)[]).find((k) => JSON.stringify(EDIT_PRESETS[k]) === JSON.stringify(ae)) ?? 'custom';
  const noSpeech = config ? !config.captions : false;
  const editCard = !isAi ? (
    <Card glow={preset === 'viral'}>
      <SectionTitle step={4} hint="The edits a video editor makes on every short, done for you">
        Auto edit
      </SectionTitle>
      <Chips
        value={preset}
        onChange={(p) => p !== 'custom' && set({ autoEdit: EDIT_PRESETS[p] })}
        options={[
          { value: 'viral', label: 'Viral', icon: 'flash' },
          { value: 'clean', label: 'Clean', icon: 'leaf-outline' },
          { value: 'off', label: 'Off', icon: 'close-circle-outline' },
          ...(preset === 'custom' ? [{ value: 'custom' as const, label: 'Custom', icon: 'options-outline' as const }] : []),
        ]}
      />
      <ToggleRow icon="text-outline" label="Animated captions" hint={noSpeech ? 'Needs speech-to-text on the server (WHISPER_CMD); skipped until then' : 'Word by word, the spoken word highlighted'} value={ae.captions} onChange={(captions) => setAe({ captions })} />
      {ae.captions ? (
        <Chips
          size="sm"
          value={ae.captionStyle}
          onChange={(captionStyle) => setAe({ captionStyle })}
          options={[
            { value: 'karaoke', label: 'Karaoke highlight' },
            { value: 'bold', label: 'Bold boxes' },
            { value: 'clean', label: 'Clean subtitles' },
          ]}
        />
      ) : null}
      <ToggleRow icon="megaphone-outline" label="Hook title" hint="The opening line, big, for the first seconds" value={ae.hook} onChange={(hook) => setAe({ hook })} />
      <ToggleRow icon="git-commit-outline" label="Smart cuts" hint="Clips start and end on whole sentences, never mid-word" value={ae.smartCuts} onChange={(smartCuts) => setAe({ smartCuts })} />
      <ToggleRow icon="cut-outline" label="Remove silences" hint="Pauses over 0.6 s become jump cuts" value={ae.removeSilence} onChange={(removeSilence) => setAe({ removeSilence })} />
      <ToggleRow icon="scan-outline" label="Punch-in zoom" hint="A 12% zoom every few seconds keeps eyes on screen" value={ae.zoom} onChange={(zoom) => setAe({ zoom })} />
      <ToggleRow icon="mic-outline" label="Enhance audio" hint="Removes rumble and hiss, levels to −14 LUFS like TikTok and YouTube" value={ae.enhanceAudio} onChange={(enhanceAudio) => setAe({ enhanceAudio })} />
      <ToggleRow icon="remove-outline" label="Progress bar" hint="A thin bar that fills as the clip plays" value={ae.progressBar} onChange={(progressBar) => setAe({ progressBar })} />
    </Card>
  ) : null;

  const viewCard = !isAi ? (
    <Card>
      <SectionTitle step={5} hint="Where the clips will be watched">
        Format
      </SectionTitle>
      <AspectPicker value={o.aspect} onChange={(aspect) => set({ aspect })} />
      {o.aspect !== 'original' ? (
        <>
          <SectionTitle hint="When the source is a different shape">Framing</SectionTitle>
          <OptionCards
            value={o.fit}
            onChange={(fit) => set({ fit })}
            options={[
              { value: 'blur', label: 'Blurred fill', hint: 'Whole picture on a blurred copy', icon: 'water-outline' },
              { value: 'crop', label: 'Fill & crop', hint: 'Fills the screen, trims edges', icon: 'crop-outline' },
              { value: 'pad', label: 'Letterbox', hint: 'Whole picture, black bars', icon: 'tablet-landscape-outline' },
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
        options={(['480', '720', '1080'] as const).map((q) => ({ value: q, label: `${q}p · ${RES[o.aspect]![q]}` }))}
      />
      <SectionTitle hint="Stamps the kit's logo on every clip" right={<Button label="Manage" size="sm" variant="ghost" trailingIcon="arrow-forward" onPress={() => router.navigate('/brand-kits')} />}>
        Brand kit
      </SectionTitle>
      <Chips
        size="sm"
        value={o.brandKitId ?? ''}
        onChange={(id) => set({ brandKitId: id || '' })}
        options={[{ value: '', label: 'No branding', icon: 'close-circle-outline' as const }, ...kits.map((k) => ({ value: k.id, label: k.name + (k.logoUrl ? '' : ' (no logo)'), icon: 'briefcase-outline' as const }))]}
      />
      <SectionTitle>Extras</SectionTitle>
      <ToggleRow icon="contrast-outline" label="Fade in and out" hint="Smooth start and end on every clip" value={o.fade} onChange={(fade) => set({ fade })} />
      <ToggleRow icon="volume-mute-outline" label="Remove sound" hint="Add your own music when posting" value={o.mute} onChange={(mute) => set({ mute })} />
      <SectionTitle>Speed</SectionTitle>
      <Chips value={o.speed} onChange={(speed) => set({ speed })} options={[0.75, 1, 1.25, 1.5, 2].map((s) => ({ value: s, label: `${s}×` }))} />
    </Card>
  ) : null;

  const headline = isAi
    ? 'AI picks the best moments'
    : estimate !== null
      ? `${estimate} clip${estimate === 1 ? '' : 's'}`
      : o.mode === 'custom'
        ? `${parsedRanges.length} clip${parsedRanges.length === 1 ? '' : 's'}`
        : `Up to ${o.maxClips} clips`;
  const facts = isAi
    ? [
        ['sparkles-outline', o.aiModel ?? 'ClipAnything'],
        ['time-outline', { auto: 'Auto length', short: 'Under 30s', medium: '30–60s', long: '60–90s', xl: '90s–3 min' }[o.aiDuration ?? 'auto']],
        ['text-outline', 'Animated captions'],
        ['pricetags-outline', 'Titles & hashtags'],
        ['speedometer-outline', 'Virality score'],
        ['albums-outline', `Up to ${o.maxClips} clips`],
      ]
    : [
        ['cut-outline', o.mode === 'custom' ? 'Your ranges' : `${o.segmentSeconds < 60 ? `${o.segmentSeconds}s` : clock(o.segmentSeconds)} each`],
        ['phone-portrait-outline', o.aspect === 'original' ? 'Original shape' : `${{ phone: '9:16', desktop: '16:9', square: '1:1', portrait: '4:5' }[o.aspect]} · ${RES[o.aspect]![o.quality]}`],
        ['color-filter-outline', o.aspect === 'original' ? 'No reframing' : o.fit === 'blur' ? 'Blurred fill' : o.fit === 'crop' ? 'Fill & crop' : 'Letterbox'],
        ['flash-outline', o.mode === 'highlights' ? 'Best moments' : o.mode === 'split' ? 'Split evenly' : 'Exact ranges'],
        ...(o.speed !== 1 ? [['speedometer-outline', `${o.speed}× speed`]] : []),
        ...(o.mute ? [['volume-mute-outline', 'No sound']] : []),
        ...(o.autoEdit && preset !== 'off'
          ? [['color-wand-outline', `Auto edit: ${[o.autoEdit.captions && 'captions', o.autoEdit.removeSilence && 'jump cuts', o.autoEdit.zoom && 'zoom', o.autoEdit.hook && 'hook', o.autoEdit.enhanceAudio && 'audio', o.autoEdit.progressBar && 'bar'].filter(Boolean).join(', ')}`]]
          : []),
        ...(o.brandKitId && kits.some((k) => k.id === o.brandKitId) ? [['briefcase-outline', `Logo: ${kits.find((k) => k.id === o.brandKitId)!.name}`]] : []),
      ];

  const summary = (
    <View style={[styles.summary, desktop && STICKY]}>
      <LinearGradient colors={isAi ? ['#1E1433', '#120F1C'] : ['#151A0B', '#0F1109']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {isAi ? <Badge tone="ai" icon="sparkles">AI · OpusClip</Badge> : <Badge tone="lime" icon="flash">Local engine</Badge>}
      </View>
      <Text variant="h1" color="#FFFFFF">
        {headline}
      </Text>
      <View style={{ gap: 10 }}>
        {facts.map(([icon, label]) => (
          <View key={label} style={styles.fact}>
            <Ionicons name={icon as 'cut-outline'} size={16} color={isAi ? '#C9B2FF' : '#C8FF2E'} />
            <Text variant="bodySm" color="rgba(255,255,255,0.82)">
              {label}
            </Text>
          </View>
        ))}
      </View>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {uploadPct !== null ? (
        <View style={{ gap: 6 }}>
          <ProgressBar value={uploadPct * 100} />
          <Text variant="label" color="rgba(255,255,255,0.7)">
            Uploading… {Math.round(uploadPct * 100)}%
          </Text>
        </View>
      ) : null}
      <Button
        label={isAi ? 'Generate AI clips' : 'Clip it'}
        variant={isAi ? 'ai' : 'primary'}
        icon={isAi ? 'sparkles' : 'cut'}
        size="lg"
        loading={busy}
        disabled={isAi && (aiOff || source === 'file')}
        onPress={() => void submit()}
      />
      <Text variant="label" color="rgba(255,255,255,0.5)" align="center" style={{ fontFamily: fonts.regular }}>
        {isAi ? 'Uses OpusClip credits (1 per source minute, 10 minimum).' : 'Rendered on your server with ffmpeg. No credits used.'}
      </Text>
    </View>
  );

  const settings = (
    <>
      {sourceCard}
      {modeCard}
      {aiCard}
      {cutCard}
      {editCard}
      {viewCard}
    </>
  );

  return (
    <Screen eyebrow="Studio" title="New project" subtitle="Paste a link, pick how to cut it, and let the agent do the rest." wide={desktop}>
      {desktop ? (
        <View style={styles.cols}>
          <View style={{ flex: 1, gap: space.xl, minWidth: 0 }}>{settings}</View>
          <View style={{ width: 340 }}>{summary}</View>
        </View>
      ) : (
        <>
          {settings}
          {summary}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: 'row', gap: space.xl, alignItems: 'flex-start' },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  preview: { flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  thumb: { width: 120, height: 68, borderRadius: radius.sm, backgroundColor: '#000', overflow: 'hidden' },
  drop: { alignItems: 'center', gap: 8, padding: space.xxl + 8, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong },
  dropIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh, marginBottom: 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  smallInput: { width: 84, height: 38, borderRadius: radius.md, paddingHorizontal: 12, backgroundColor: colors.surfaceAlt, color: colors.text, fontFamily: fonts.medium, borderWidth: 1, borderColor: colors.borderStrong },
  row2: { flexDirection: 'row', gap: space.md },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rangeNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh },
  promptBox: { flexDirection: 'row', gap: 10, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: 'rgba(155,107,255,0.35)' },
  promptInput: { flex: 1, minHeight: 64, color: colors.text, fontFamily: fonts.regular, fontSize: 15, textAlignVertical: 'top' },
  summary: { borderRadius: radius.xl, padding: space.xl, gap: space.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
