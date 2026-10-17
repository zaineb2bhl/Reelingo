import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { fitText, layoutText } from './text';
import type { Ctx } from './types';

const ctx = createCanvas(1080, 1920).getContext('2d') as unknown as Ctx;

const visualTexts = (text: string, width = 2000): string[][] =>
  layoutText(ctx, text, width, { size: 40 }).lines.map((line) => line.order.map((i) => line.words[i]?.text ?? ''));

describe('text layout', () => {
  it('keeps LTR words in order', () => {
    expect(visualTexts('Hello big world')).toEqual([['Hello', 'big', 'world']]);
  });

  it('places Arabic words right to left', () => {
    expect(visualTexts('واحد اثنان ثلاثة')).toEqual([['ثلاثة', 'اثنان', 'واحد']]);
  });

  it('puts end-of-sentence punctuation on the paragraph side of an embedded English word', () => {
    // In RTL text the Arabic question mark belongs at the far (left) end.
    const [line] = visualTexts('ما معنى apple؟');
    expect(line?.[0]).toBe('؟');
    expect(line?.[1]).toBe('apple');
  });

  it('keeps an embedded English phrase readable inside Arabic', () => {
    const [line] = visualTexts('أنا أحب New York كثيرًا');
    const ny = line?.indexOf('New') ?? -1;
    expect(line?.[ny + 1]).toBe('York');
  });

  it('does not wrap a glued punctuation mark onto its own line', () => {
    const layout = layoutText(ctx, 'Is this correct?', 330, { size: 40 });
    for (const line of layout.lines) expect(line.words[0]?.glue).toBe(false);
  });

  it('counts typed characters across split punctuation', () => {
    const layout = layoutText(ctx, 'Hi, you!', 2000, { size: 40 });
    expect(layout.totalChars).toBe('Hi, you!'.length);
  });

  it('shrinks text rather than breaking a long word', () => {
    const layout = fitText(ctx, 'serendipitously', { maxWidth: 500, maxHeight: 400, maxSize: 180, minSize: 30, weight: 800, maxLines: 2 });
    expect(layout.broken).toBe(false);
    expect(layout.lines).toHaveLength(1);
  });

  it('records emphasised pieces from *star* markup', () => {
    const layout = layoutText(ctx, 'a *key* word', 2000, { size: 40 });
    const key = layout.lines[0]?.words.find((w) => w.text === 'key');
    expect(key?.pieces.every((p) => p.emph)).toBe(true);
  });
});
