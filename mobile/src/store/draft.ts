import { create } from 'zustand';
import type { ClipOptions } from '../api/types';

/** Default clipping settings: 30-second phone clips with a blurred background. */
export const DEFAULT_OPTIONS: ClipOptions = {
  mode: 'split',
  segmentSeconds: 30,
  maxClips: 10,
  aspect: 'phone',
  fit: 'blur',
  focus: 'center',
  quality: '1080',
  fade: false,
  mute: false,
  speed: 1,
};

const KEY = 'cliper.defaults';
function saved(): ClipOptions {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) return { ...DEFAULT_OPTIONS, ...(JSON.parse(raw) as Partial<ClipOptions>), startAt: undefined, endAt: undefined, ranges: undefined };
  } catch {
    /* ignore */
  }
  return DEFAULT_OPTIONS;
}

/** The link waiting to be clipped (e.g. picked in Discover) and the last-used settings. */
interface DraftState {
  url: string;
  title?: string;
  thumbnail?: string;
  options: ClipOptions;
  setUrl: (url: string, extra?: { title?: string; thumbnail?: string }) => void;
  setOptions: (patch: Partial<ClipOptions>) => void;
  remember: () => void;
}

export const useDraft = create<DraftState>((set, get) => ({
  url: '',
  options: saved(),
  setUrl: (url, extra) => set({ url, title: extra?.title, thumbnail: extra?.thumbnail }),
  setOptions: (patch) => set({ options: { ...get().options, ...patch } }),
  /** Keep this device's last settings (not the trim) as the starting point next time. */
  remember: () => {
    try {
      const { startAt: _s, endAt: _e, ranges: _r, ...rest } = get().options;
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      /* native or private mode */
    }
  },
}));
