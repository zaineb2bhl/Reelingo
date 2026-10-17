import { describe, expect, it } from 'vitest';
import { contrastRatio, mix, parseHex, readableOn } from './color';
import { clamp, easeOutBack, progress } from './easing';
import { detectDirection, parseMarkup, stripMarkup, visualOrder } from './text';
import { buildTimeline } from './timeline';

describe('timeline', () => {
  const tl = buildTimeline(
    [
      { id: 'a', duration: 1 },
      { id: 'b', duration: 2 },
      { id: 'c', duration: 1, offset: -0.5 },
    ],
    0.25,
  );

  it('lays segments out sequentially with offsets and tail', () => {
    expect(tl.get('b')).toMatchObject({ start: 1, end: 3 });
    expect(tl.get('c')).toMatchObject({ start: 2.5, end: 3.5 });
    expect(tl.total).toBeCloseTo(3.75);
  });

  it('reports clamped progress', () => {
    expect(tl.p('b', 0)).toBe(0);
    expect(tl.p('b', 2)).toBeCloseTo(0.5);
    expect(tl.p('b', 10)).toBe(1);
    expect(tl.active('a', 0.5)).toBe(true);
    expect(tl.active('a', 1)).toBe(false);
  });

  it('rejects duplicates and unknown ids', () => {
    expect(() => buildTimeline([{ id: 'x', duration: 1 }, { id: 'x', duration: 1 }])).toThrow();
    expect(() => tl.get('nope')).toThrow();
  });
});

describe('easing', () => {
  it('clamps and maps endpoints', () => {
    expect(clamp(2)).toBe(1);
    expect(progress(0.5, 0, 1)).toBe(0.5);
    expect(progress(5, 0, 0)).toBe(1);
    expect(easeOutBack(0)).toBeCloseTo(0);
    expect(easeOutBack(1)).toBeCloseTo(1);
  });
});

describe('markup', () => {
  it('splits starred spans', () => {
    expect(parseMarkup('Say it like a *native* speaker')).toEqual([
      { text: 'Say it like a ', emph: false },
      { text: 'native', emph: true },
      { text: ' speaker', emph: false },
    ]);
  });

  it('supports escaped and unmatched stars', () => {
    expect(stripMarkup('5 \\* 3 = 15')).toBe('5 * 3 = 15');
    expect(parseMarkup('a *b')).toEqual([{ text: 'a *b', emph: false }]);
  });
});

describe('direction', () => {
  it('detects paragraph direction from the first strong character', () => {
    expect(detectDirection('Hello')).toBe('ltr');
    expect(detectDirection('مرحبا بكم')).toBe('rtl');
    expect(detectDirection('123 كلمة')).toBe('rtl');
    expect(detectDirection('... ?')).toBe('ltr');
    expect(detectDirection('Bonjour à tous')).toBe('ltr');
  });

  it('orders words visually', () => {
    const w = (flip: boolean) => ({ flip });
    // RTL paragraph, all RTL words: reversed placement.
    expect(visualOrder([w(false), w(false), w(false)], 'rtl')).toEqual([2, 1, 0]);
    // RTL paragraph with an embedded two-word LTR run (indices 1,2) keeps that run's order.
    expect(visualOrder([w(false), w(true), w(true), w(false)], 'rtl')).toEqual([3, 1, 2, 0]);
    // LTR paragraph with an embedded RTL run reverses only the run.
    expect(visualOrder([w(false), w(true), w(true), w(false)], 'ltr')).toEqual([0, 2, 1, 3]);
  });
});

describe('color', () => {
  it('parses and mixes', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('picks readable text colours', () => {
    expect(readableOn('#ffffff')).toBe('#14122b');
    expect(readableOn('#14122b')).toBe('#ffffff');
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
  });
});
