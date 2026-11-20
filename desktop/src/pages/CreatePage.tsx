import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  Captions,
  Clapperboard,
  Crop,
  Download,
  Film,
  Link2,
  Maximize,
  Monitor,
  Music2,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { AppConfig, ClipOptions, Job, SourceMeta } from '@/lib/types';
import { cn, formatClock, formatCompact } from '@/lib/utils';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Choice,
  Input,
  Label,
  PageHeader,
  Segmented,
  Select,
  Spinner,
  Toggle,
} from '@/components/ui';

const LENGTHS = [15, 30, 45, 60, 90, 180];

const ASPECT_OPTIONS: {
  value: ClipOptions['aspect'];
  label: string;
  hint: string;
  icon: typeof Smartphone;
}[] = [
  { value: 'phone', label: 'Phone', hint: '9:16 · TikTok, Reels, Shorts', icon: Smartphone },
  { value: 'desktop', label: 'Desktop', hint: '16:9 · YouTube, web', icon: Monitor },
  { value: 'square', label: 'Square', hint: '1:1 · feeds', icon: Square },
  { value: 'portrait', label: 'Portrait', hint: '4:5 · Instagram feed', icon: RectangleVertical },
  { value: 'original', label: 'Original', hint: 'source shape, just cut', icon: RectangleHorizontal },
];

const FIT_OPTIONS: { value: ClipOptions['fit']; label: string; hint: string; icon: typeof Crop }[] = [
  { value: 'crop', label: 'Fill & crop', hint: 'Fill the frame', icon: Crop },
  { value: 'blur', label: 'Blurred background', hint: 'Whole picture visible', icon: Wand2 },
  { value: 'pad', label: 'Black bars', hint: 'Whole picture, padded', icon: Maximize },
];

const FOCUS_OPTIONS: { value: ClipOptions['focus']; label: string }[] = [
  { value: 'start', label: 'Left / top' },
  { value: 'center', label: 'Centre' },
  { value: 'end', label: 'Right / bottom' },
];

const DEFAULT_OPTIONS: ClipOptions = {
  mode: 'split',
  segmentSeconds: 30,
  maxClips: 10,
  aspect: 'phone',
  fit: 'crop',
  focus: 'center',
  quality: '1080',
  fade: false,
  mute: false,
  speed: 1,
  layoutTemplate: 'full',
  removeSilence: false,
  aiDetectContent: '',
  safeZone: 'basic',
  captions: false,
  captionStyle: 'karaoke',
  hook: 'none',
  hookText: '',
  credit: false,
  normalizeAudio: false,
  aiPick: false,
  topic: '',
};

/** "1:05" or "65" → seconds. */
function parseClock(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(':').map(Number);
  if (parts.some((part) => Number.isNaN(part))) return undefined;
  return parts.reduce((acc, part) => acc * 60 + part, 0);
}

export function CreatePage({
  config,
  initialUrl,
  onCreated,
}: {
  config: AppConfig | null;
  initialUrl?: string;
  onCreated: (job: Job) => void;
}) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [title, setTitle] = useState('');
  const [options, setOptions] = useState<ClipOptions>(DEFAULT_OPTIONS);
  const [meta, setMeta] = useState<SourceMeta | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [inspecting, setInspecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [customLength, setCustomLength] = useState('');
  const [trimStart, setTrimStart] = useState('');
  const [trimEnd, setTrimEnd] = useState('');
  const [ranges, setRanges] = useState([{ start: '0:00', end: '0:30' }]);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof ClipOptions>(key: K, value: ClipOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        setUrl(text);
        void inspect(text);
      }
    } catch {
      setError('Clipboard is not available. Paste the link with Ctrl+V.');
    }
  };

  const inspect = async (link = url) => {
    if (!link.trim()) return;
    setInspecting(true);
    setError('');
    setWarnings([]);
    try {
      const result = await api<{ source: SourceMeta; warnings: string[] }>('/source/inspect', {
        method: 'POST',
        body: { url: link.trim() },
      });
      setMeta(result.source);
      setWarnings(result.warnings ?? []);
      if (!title && result.source.title) setTitle(result.source.title);
    } catch (err) {
      setMeta(null);
      setError(errorMessage(err));
    } finally {
      setInspecting(false);
    }
  };

  useEffect(() => {
    if (initialUrl) void inspect(initialUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const estimate = useMemo(() => {
    const duration = meta?.duration ?? null;
    if (!duration) return null;
    const start = parseClock(trimStart) ?? 0;
    const end = parseClock(trimEnd) ?? duration;
    const usable = Math.max(0, end - start);
    if (options.mode === 'custom') return ranges.length;
    return Math.min(options.maxClips, Math.max(1, Math.floor(usable / options.segmentSeconds)));
  }, [meta, trimStart, trimEnd, options.mode, options.maxClips, options.segmentSeconds, ranges.length]);

  const buildOptions = (): ClipOptions => {
    const next: ClipOptions = { ...options };
    const start = parseClock(trimStart);
    const end = parseClock(trimEnd);
    if (start !== undefined) next.startAt = start;
    if (end !== undefined) next.endAt = end;
    if (options.mode === 'custom') {
      next.ranges = ranges
        .map((range) => ({ start: parseClock(range.start), end: parseClock(range.end) }))
        .filter(
          (range): range is { start: number; end: number } =>
            range.start !== undefined && range.end !== undefined && range.end > range.start,
        );
    }
    if (!next.aiDetectContent) delete next.aiDetectContent;
    if (!next.topic) delete next.topic;
    if (next.hook !== 'custom') delete next.hookText;
    else next.hookText = (next.hookText ?? '').trim();
    return next;
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!url.trim()) {
      setError('Paste a video link first.');
      return;
    }
    const built = buildOptions();
    if (options.mode === 'custom') {
      if (!built.ranges?.length) {
        setError('Add at least one time range that ends after it starts.');
        return;
      }
      if (built.ranges.some((range) => range.end - range.start < 1)) {
        setError('Each time range must be at least 1 second long.');
        return;
      }
    }
    if (built.startAt !== undefined && built.endAt !== undefined && built.endAt <= built.startAt) {
      setError('The trim end must be after the trim start.');
      return;
    }
    if (built.hook === 'custom' && !built.hookText) {
      setError('Write the hook text, or choose another hook style.');
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ job: Job }>('/jobs', {
        method: 'POST',
        body: { url: url.trim(), title: title.trim() || undefined, options: built },
      });
      onCreated(result.job);
      setUrl('');
      setTitle('');
      setMeta(null);
      setWarnings([]);
      setOptions(DEFAULT_OPTIONS);
      setTrimStart('');
      setTrimEnd('');
      setCustomLength('');
      setRanges([{ start: '0:00', end: '0:30' }]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setError('');
    setBusy(true);
    setUploadPct(0);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('options', JSON.stringify(buildOptions()));
      if (title.trim()) form.append('title', title.trim());
      const result = await api<{ job: Job }>('/jobs/upload', { method: 'POST', body: form });
      onCreated(result.job);
      setTitle('');
      setOptions(DEFAULT_OPTIONS);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setUploadPct(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="page-enter">
      <PageHeader
        title="Create clips"
        description="Paste a link or upload a file, choose how to cut it, and Cliper Agent does the rest."
        actions={
          <Button variant="outline" onClick={() => fileRef.current?.click()} loading={uploadPct !== null}>
            <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Upload a file
          </Button>
        }
      />

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <form onSubmit={create} className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-4">
        <div className="space-y-4">
          {/* Source */}
          <Card>
            <CardHeader>
              <CardTitle>Source</CardTitle>
              <CardDescription>YouTube, TikTok, X, Instagram, Twitch, a direct .mp4 link and 1,800+ sites.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="url">Video link</Label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Link2
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-5"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <Input
                      id="url"
                      value={url}
                      onChange={(event) => {
                        setUrl(event.target.value);
                        setMeta(null);
                      }}
                      onBlur={() => url.trim() && !meta && void inspect()}
                      placeholder="https://www.youtube.com/watch?v=…"
                      className="pl-9"
                    />
                  </div>
                  <Button type="button" variant="secondary" onClick={() => void paste()}>
                    Paste
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void inspect()}
                    loading={inspecting}
                    disabled={!url.trim()}
                  >
                    Check
                  </Button>
                </div>
              </div>

              {inspecting && !meta && (
                <div className="flex items-center gap-2 text-[12.5px] text-foreground-4">
                  <Spinner className="h-3.5 w-3.5" /> Reading the video…
                </div>
              )}

              {meta && (
                <div className="flex items-center gap-3 rounded-md border border-edge bg-surface-2 p-2.5">
                  {meta.thumbnail ? (
                    <img
                      src={meta.thumbnail}
                      alt=""
                      className="h-14 w-24 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded bg-surface-3 text-foreground-5">
                      <Film className="h-5 w-5" aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">{meta.title}</p>
                    <p className="mt-0.5 truncate text-[11.5px] text-foreground-4">
                      {[meta.uploader, meta.site, meta.duration ? formatClock(meta.duration) : null, meta.viewCount ? `${formatCompact(meta.viewCount)} views` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {meta.isLive && (
                    <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-[11px] font-medium text-danger-text">
                      Live
                    </span>
                  )}
                </div>
              )}

              {warnings.length > 0 && (
                <Alert tone="warning">
                  <ul className="list-inside list-disc space-y-0.5">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </Alert>
              )}

              <div>
                <Label htmlFor="title">Title (optional)</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Name this job"
                />
              </div>
            </CardContent>
          </Card>

          {/* Clipping */}
          <Card>
            <CardHeader>
              <CardTitle>Clipping</CardTitle>
              <CardDescription>How the video is cut into clips.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Mode</Label>
                <Segmented
                  className="w-full"
                  value={options.mode}
                  onChange={(mode) => set('mode', mode)}
                  options={[
                    { value: 'split', label: 'Split evenly' },
                    { value: 'highlights', label: 'Best moments' },
                    { value: 'custom', label: 'My ranges' },
                  ]}
                />
              </div>

              {options.mode !== 'custom' ? (
                <>
                  <div>
                    <Label>Clip length</Label>
                    <div className="flex flex-wrap gap-2">
                      {LENGTHS.map((length) => (
                        <button
                          key={length}
                          type="button"
                          onClick={() => {
                            setCustomLength('');
                            set('segmentSeconds', length);
                          }}
                          className={cn(
                            'h-8 rounded-md border px-3 text-[12.5px] font-medium transition-colors',
                            options.segmentSeconds === length && !customLength
                              ? 'border-accent-border bg-accent-soft text-accent-text'
                              : 'border-edge bg-surface text-foreground-3 hover:bg-surface-2',
                          )}
                        >
                          {length < 60 ? `${length}s` : `${length / 60} min`}
                        </button>
                      ))}
                      <div className="flex h-8 items-center gap-1.5 rounded-md border border-edge bg-surface px-2">
                        <input
                          value={customLength}
                          onChange={(event) => {
                            const raw = event.target.value.replace(/[^\d]/g, '');
                            setCustomLength(raw);
                            if (raw) set('segmentSeconds', Math.min(600, Math.max(3, Number(raw))));
                          }}
                          placeholder="Custom"
                          inputMode="numeric"
                          className="w-16 bg-transparent text-[12.5px] text-foreground placeholder:text-foreground-5"
                          aria-label="Custom clip length in seconds"
                        />
                        <span className="text-[11.5px] text-foreground-4">s</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="trimStart">Trim from (optional)</Label>
                      <Input
                        id="trimStart"
                        value={trimStart}
                        onChange={(event) => setTrimStart(event.target.value)}
                        placeholder="0:00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="trimEnd">Trim to (optional)</Label>
                      <Input
                        id="trimEnd"
                        value={trimEnd}
                        onChange={(event) => setTrimEnd(event.target.value)}
                        placeholder={meta?.duration ? formatClock(meta.duration) : 'end'}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label>Time ranges</Label>
                  {ranges.map((range, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={range.start}
                        onChange={(event) =>
                          setRanges((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, start: event.target.value } : item,
                            ),
                          )
                        }
                        placeholder="1:05"
                        aria-label={`Range ${index + 1} start`}
                      />
                      <span className="text-foreground-4">→</span>
                      <Input
                        value={range.end}
                        onChange={(event) =>
                          setRanges((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, end: event.target.value } : item,
                            ),
                          )
                        }
                        placeholder="1:35"
                        aria-label={`Range ${index + 1} end`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setRanges((current) => current.filter((_, i) => i !== index))}
                        disabled={ranges.length === 1}
                        aria-label={`Remove range ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRanges((current) => [...current, { start: '', end: '' }])}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Add range
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="maxClips">Maximum clips</Label>
                  <Input
                    id="maxClips"
                    type="number"
                    min={1}
                    max={200}
                    value={options.maxClips}
                    onChange={(event) => set('maxClips', Math.max(1, Number(event.target.value) || 1))}
                  />
                </div>
                <div>
                  <Label htmlFor="speed">Speed</Label>
                  <Select
                    id="speed"
                    value={String(options.speed)}
                    onChange={(event) => set('speed', Number(event.target.value))}
                  >
                    <option value="0.75">0.75×</option>
                    <option value="1">1×</option>
                    <option value="1.25">1.25×</option>
                    <option value="1.5">1.5×</option>
                    <option value="2">2×</option>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Frame */}
          <Card>
            <CardHeader>
              <CardTitle>Frame & quality</CardTitle>
              <CardDescription>Reframe the video for where it will be watched.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Aspect ratio</Label>
                <div className="grid grid-cols-5 gap-2">
                  {ASPECT_OPTIONS.map((option) => (
                    <Choice
                      key={option.value}
                      active={options.aspect === option.value}
                      onClick={() => set('aspect', option.value)}
                      title={option.label}
                      hint={option.hint}
                      icon={option.icon}
                    />
                  ))}
                </div>
              </div>

              <div>
                <Label>Framing</Label>
                <div className="grid grid-cols-3 gap-2">
                  {FIT_OPTIONS.map((option) => (
                    <Choice
                      key={option.value}
                      active={options.fit === option.value}
                      onClick={() => set('fit', option.value)}
                      title={option.label}
                      hint={option.hint}
                      icon={option.icon}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Focus</Label>
                  <Segmented
                    className="w-full"
                    value={options.focus}
                    onChange={(focus) => set('focus', focus)}
                    options={FOCUS_OPTIONS}
                  />
                </div>
                <div>
                  <Label>Quality</Label>
                  <Segmented
                    className="w-full"
                    value={options.quality}
                    onChange={(quality) => set('quality', quality)}
                    options={[
                      { value: '480', label: '480p' },
                      { value: '720', label: '720p' },
                      { value: '1080', label: '1080p' },
                    ]}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Edits */}
          <Card>
            <CardHeader>
              <CardTitle>Ready-to-post edits</CardTitle>
              <CardDescription>Captions, a hook title and the creator&apos;s credit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Toggle
                label="Burned-in captions"
                description="What is said appears on the clip, a few words at a time."
                checked={Boolean(options.captions)}
                onChange={(checked) => set('captions', checked)}
              />
              {options.captions && (
                <div className="pl-1">
                  <Label>Caption style</Label>
                  <Segmented
                    value={options.captionStyle ?? 'karaoke'}
                    onChange={(style) => set('captionStyle', style)}
                    options={[
                      { value: 'bold', label: 'Bold' },
                      { value: 'karaoke', label: 'Karaoke' },
                      { value: 'minimal', label: 'Minimal' },
                    ]}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="hook">Hook title</Label>
                  <Select
                    id="hook"
                    value={options.hook}
                    onChange={(event) => set('hook', event.target.value as ClipOptions['hook'])}
                  >
                    <option value="none">None</option>
                    <option value="auto">Written per clip</option>
                    <option value="custom">Same on every clip</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="topic">Topic (hashtags)</Label>
                  <Input
                    id="topic"
                    value={options.topic}
                    onChange={(event) => set('topic', event.target.value)}
                    placeholder="e.g. GTA 6"
                  />
                </div>
              </div>
              {options.hook === 'custom' && (
                <div>
                  <Label htmlFor="hookText">Hook text</Label>
                  <Input
                    id="hookText"
                    value={options.hookText}
                    onChange={(event) => set('hookText', event.target.value)}
                    placeholder="Shown across the top of each clip"
                    maxLength={80}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Toggle
                  label="Credit creator"
                  checked={Boolean(options.credit)}
                  onChange={(checked) => set('credit', checked)}
                />
                <Toggle
                  label="Even loudness"
                  checked={Boolean(options.normalizeAudio)}
                  onChange={(checked) => set('normalizeAudio', checked)}
                />
                <Toggle
                  label="Remove silence"
                  checked={Boolean(options.removeSilence)}
                  onChange={(checked) => set('removeSilence', checked)}
                />
                <Toggle
                  label="Fade in / out"
                  checked={Boolean(options.fade)}
                  onChange={(checked) => set('fade', checked)}
                />
                <Toggle label="Mute audio" checked={Boolean(options.mute)} onChange={(checked) => set('mute', checked)} />
                <Toggle
                  label="AI picks moments"
                  description="From what is said"
                  checked={Boolean(options.aiPick)}
                  onChange={(checked) => set('aiPick', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary rail */}
        <div className="sticky top-[4.5rem] space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Job summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SummaryRow icon={Clapperboard} label="Source" value={meta?.title ?? (url ? 'Link pasted' : 'Not set')} />
              <SummaryRow
                icon={AlignLeft}
                label="Mode"
                value={
                  options.mode === 'split'
                    ? 'Split evenly'
                    : options.mode === 'highlights'
                      ? 'Best moments'
                      : 'My ranges'
                }
              />
              <SummaryRow
                icon={Film}
                label="Clips"
                value={
                  estimate != null
                    ? `up to ${estimate}`
                    : options.mode === 'custom'
                      ? String(ranges.length)
                      : '—'
                }
              />
              <SummaryRow icon={Captions} label="Captions" value={options.captions ? 'On' : 'Off'} />
              <SummaryRow
                icon={Music2}
                label="Audio"
                value={options.mute ? 'Muted' : options.normalizeAudio ? 'Evened' : 'Original'}
              />
              <SummaryRow
                icon={Download}
                label="Shape"
                value={`${options.aspect} · ${options.quality}p`}
              />

              {error && <Alert>{error}</Alert>}

              <Button type="submit" size="lg" className="w-full" loading={busy}>
                <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Create clips
              </Button>
              {config && (
                <p className="text-center text-[11px] text-foreground-5">
                  Up to {config.limits.maxClipsPerJob} clips · {config.limits.maxSourceMinutes} min source
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-accent-border bg-accent-soft/60">
            <CardContent className="flex gap-2.5">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
              <p className="text-[12px] leading-relaxed text-foreground-3">
                Every clip gets a title and caption with credit and hashtags. Connect accounts in{' '}
                <span className="font-medium text-accent-text">Channels</span> to post when it is ready.
              </p>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Film;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex items-center gap-2 text-[12px] text-foreground-4">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        {label}
      </span>
      <span className="max-w-[60%] truncate text-right text-[12.5px] font-medium capitalize text-foreground-2">
        {value}
      </span>
    </div>
  );
}
