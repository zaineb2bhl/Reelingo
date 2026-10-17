import { clamp, linear, type Easing } from './easing';

export interface SegmentSpec {
  id: string;
  duration: number;
  /** Shift relative to the end of the previous segment. Negative values overlap. */
  offset?: number;
}

export interface Segment {
  id: string;
  start: number;
  end: number;
  duration: number;
}

export interface Timeline {
  readonly total: number;
  readonly segments: readonly Segment[];
  has(id: string): boolean;
  get(id: string): Segment;
  /** Eased 0..1 progress through a segment (clamped). */
  p(id: string, t: number, ease?: Easing): number;
  /** Seconds since the segment started (negative before it starts). */
  elapsed(id: string, t: number): number;
  active(id: string, t: number): boolean;
  started(id: string, t: number): boolean;
}

/**
 * Lays out named segments one after another. Formats build one of these from
 * their data and use it for both `duration()` and `render()`, so the two can
 * never disagree.
 */
export function buildTimeline(specs: readonly SegmentSpec[], tail = 0): Timeline {
  const segments: Segment[] = [];
  const byId = new Map<string, Segment>();
  let cursor = 0;
  let maxEnd = 0;

  for (const spec of specs) {
    if (byId.has(spec.id)) throw new Error(`Duplicate timeline segment "${spec.id}"`);
    const start = Math.max(0, cursor + (spec.offset ?? 0));
    const duration = Math.max(0, spec.duration);
    const seg: Segment = { id: spec.id, start, end: start + duration, duration };
    segments.push(seg);
    byId.set(seg.id, seg);
    cursor = seg.end;
    maxEnd = Math.max(maxEnd, seg.end);
  }

  const get = (id: string): Segment => {
    const seg = byId.get(id);
    if (!seg) throw new Error(`Unknown timeline segment "${id}"`);
    return seg;
  };

  return {
    total: maxEnd + Math.max(0, tail),
    segments,
    has: (id) => byId.has(id),
    get,
    p(id, t, ease: Easing = linear) {
      const seg = get(id);
      if (seg.duration === 0) return t >= seg.start ? 1 : 0;
      return ease(clamp((t - seg.start) / seg.duration));
    },
    elapsed: (id, t) => t - get(id).start,
    active(id, t) {
      const seg = get(id);
      return t >= seg.start && t < seg.end;
    },
    started: (id, t) => t >= get(id).start,
  };
}
