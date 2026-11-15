import { describe, expect, it } from 'vitest';
import { planCustom, planHighlights, planSplit } from '../src/clipper/plan';
import { frameSize, optionsSchema } from '../src/clipper/options';
import { buildFilterGraph } from '../src/clipper/filters';
import { isPrivateAddress } from '../src/lib/url-guard';
import { isoDuration } from '../src/modules/discover/discover.routes';

const opts = (o: Record<string, unknown> = {}) => optionsSchema.parse(o);

describe('planSplit', () => {
  it('cuts back-to-back clips of the chosen length', () => {
    const segs = planSplit(95, opts({ segmentSeconds: 30, maxClips: 10 }));
    expect(segs).toEqual([
      { start: 0, end: 30 },
      { start: 30, end: 60 },
      { start: 60, end: 90 },
    ]); // the 5 s tail is shorter than a third of a clip: dropped
  });

  it('keeps a tail of at least a third of a clip', () => {
    const segs = planSplit(75, opts({ segmentSeconds: 30, maxClips: 10 }));
    expect(segs.at(-1)).toEqual({ start: 60, end: 75 });
  });

  it('honours the trim and the clip limit', () => {
    const segs = planSplit(600, opts({ segmentSeconds: 15, maxClips: 3, startAt: 100, endAt: 400 }));
    expect(segs).toEqual([
      { start: 100, end: 115 },
      { start: 115, end: 130 },
      { start: 130, end: 145 },
    ]);
  });

  it('makes one clip from a video shorter than a clip', () => {
    expect(planSplit(12, opts({ segmentSeconds: 30 }))).toEqual([{ start: 0, end: 12 }]);
  });
});

describe('planHighlights', () => {
  it('picks the loudest non-overlapping windows, in time order', () => {
    const loud = Array.from({ length: 120 }, () => -40);
    for (let i = 80; i < 90; i++) loud[i] = -8; // big moment
    for (let i = 20; i < 30; i++) loud[i] = -15; // second moment
    const segs = planHighlights(120, loud, opts({ mode: 'highlights', segmentSeconds: 10, maxClips: 2 }));
    expect(segs.map((s) => [s.start, s.end])).toEqual([
      [20, 30],
      [80, 90],
    ]);
    expect(segs[1]!.score).toBe(100);
    for (const a of segs) for (const b of segs) if (a !== b) expect(a.end <= b.start || b.end <= a.start).toBe(true);
  });

  it('spreads clips evenly when there is no sound', () => {
    const segs = planHighlights(100, [], opts({ mode: 'highlights', segmentSeconds: 10, maxClips: 3 }));
    expect(segs).toEqual([
      { start: 0, end: 10 },
      { start: 45, end: 55 },
      { start: 90, end: 100 },
    ]);
  });
});

describe('planCustom', () => {
  it('sorts, clamps and drops tiny ranges', () => {
    const segs = planCustom(60, opts({ mode: 'custom', ranges: [{ start: 40, end: 90 }, { start: 5, end: 12 }, { start: 59.5, end: 70 }] }));
    expect(segs).toEqual([
      { start: 5, end: 12 },
      { start: 40, end: 60 },
    ]);
  });

  it('requires ranges in custom mode', () => {
    expect(optionsSchema.safeParse({ mode: 'custom' }).success).toBe(false);
  });
});

describe('frameSize', () => {
  it('maps views to frame sizes', () => {
    expect(frameSize('phone', '1080')).toEqual({ width: 1080, height: 1920 });
    expect(frameSize('desktop', '720')).toEqual({ width: 1280, height: 720 });
    expect(frameSize('square', '1080')).toEqual({ width: 1080, height: 1080 });
    expect(frameSize('portrait', '1080')).toEqual({ width: 1080, height: 1350 });
    expect(frameSize('phone', '480')).toEqual({ width: 480, height: 854 });
  });

  it('never upscales the original', () => {
    expect(frameSize('original', '1080', { width: 640, height: 360 })).toEqual({ width: 640, height: 360 });
    expect(frameSize('original', '720', { width: 3840, height: 2160 })).toEqual({ width: 1280, height: 720 });
  });
});

describe('buildFilterGraph', () => {
  const src = { width: 1920, height: 1080, hasAudio: true };
  it('crops to phone view around the chosen focus', () => {
    const g = buildFilterGraph(src, opts({ aspect: 'phone', fit: 'crop', focus: 'start' }), 30);
    expect(g.graph).toContain('crop=1080:1920:(iw-ow)*0:(ih-oh)*0');
    expect(g.graph).toContain('[a]');
  });
  it('builds a blurred background', () => {
    const g = buildFilterGraph(src, opts({ aspect: 'phone', fit: 'blur' }), 30);
    expect(g.graph).toContain('boxblur');
    expect(g.graph).toContain('overlay=');
  });
  it('drops the sound when muted and handles speed and fades', () => {
    const g = buildFilterGraph(src, opts({ aspect: 'desktop', fit: 'pad', mute: true, speed: 2, fade: true }), 30);
    expect(g.withAudio).toBe(false);
    expect(g.graph).not.toContain('[a]');
    expect(g.graph).toContain('setpts=PTS/2');
    expect(g.graph).toContain('fade=t=out:st=14.5:d=0.5');
    expect(g.outDuration).toBe(15);
  });
});

describe('url guard', () => {
  it('flags private and local addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.10', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1', '0.0.0.0'])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '93.184.215.14', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe('isoDuration', () => {
  it('parses YouTube durations', () => {
    expect(isoDuration('PT1H2M3S')).toBe(3723);
    expect(isoDuration('PT45S')).toBe(45);
    expect(isoDuration('P1DT1S')).toBe(86401);
    expect(isoDuration(undefined)).toBeNull();
  });
});
