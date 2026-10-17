import { SAFE, SAFE_WIDTH } from '@/config';
import {
  buildTimeline,
  clamp,
  drawLabel,
  drawPanel,
  drawText,
  easeOutBack,
  easeOutCubic,
  fitText,
  layoutText,
  measureLabel,
  normaliseWord,
  rgba,
  riseIn,
  roundRectPath,
  withTransform,
  type Ctx,
  type TextLayout,
  type Timeline,
} from '@/scene';
import type { Theme } from '@/themes';
import { CX, drawTagPill, drawTimeline, emphOnBg, emphOnPanel } from '../kit';
import { PACE_SECONDS } from '../shared';
import type { Cue } from '../types';
import type { WordOfDayData } from './schema';

export function wordOfDayTimeline(data: WordOfDayData): Timeline {
  const has = (s: string): boolean => s.trim().length > 0;
  return buildTimeline(
    [
      { id: 'intro', duration: 0.45 },
      { id: 'word', duration: 0.9 },
      { id: 'ipa', duration: has(data.ipa) ? 0.45 : 0, offset: -0.25 },
      { id: 'pos', duration: has(data.partOfSpeech) ? 0.4 : 0, offset: -0.15 },
      { id: 'definition', duration: 0.6, offset: 0.15 },
      { id: 'example', duration: has(data.example) ? 0.6 : 0, offset: 0.35 },
      { id: 'highlight', duration: has(data.example) && data.highlight ? 0.5 : 0 },
      { id: 'translation', duration: has(data.translation) ? 0.5 : 0, offset: 0.1 },
      { id: 'hold', duration: PACE_SECONDS[data.pace] },
    ],
    0.2,
  );
}

export function wordOfDayDuration(data: WordOfDayData): number {
  return wordOfDayTimeline(data).total;
}

export function wordOfDayCues(data: WordOfDayData): Cue[] {
  const tl = wordOfDayTimeline(data);
  const cues: Cue[] = [
    { t: 0, sfx: 'whoosh', gain: 0.7 },
    { t: tl.get('word').start, sfx: 'reveal', gain: 0.55 },
    { t: tl.get('definition').start, sfx: 'pop', gain: 0.5 },
  ];
  if (tl.get('example').duration > 0) cues.push({ t: tl.get('example').start, sfx: 'pop', gain: 0.45 });
  if (tl.get('highlight').duration > 0) cues.push({ t: tl.get('highlight').start, sfx: 'tick', gain: 0.5 });
  if (tl.get('translation').duration > 0) cues.push({ t: tl.get('translation').start, sfx: 'pop', gain: 0.4 });
  return cues;
}

/** Matches the target word and simple inflections ("make" → "making", "study" → "studied"). */
export function targetMatcher(word: string): (candidate: string) => boolean {
  const targets = word
    .split(/\s+/)
    .map(normaliseWord)
    .filter((w) => w.length > 0);
  return (candidate) =>
    targets.some((t) => {
      if (candidate === t) return true;
      if (t.length < 3) return false;
      if (candidate.startsWith(t)) return candidate.length - t.length <= 4;
      const stem = /[ey]$/.test(t) ? t.slice(0, -1) : t;
      return stem.length >= 3 && candidate.startsWith(stem) && candidate.length - stem.length <= 4;
    });
}

const formatIpa = (ipa: string): string => {
  const s = ipa.trim();
  if (!s) return '';
  return /^[/[]/.test(s) ? s : `/${s}/`;
};

interface Layout {
  word: TextLayout;
  definition: TextLayout;
  example: TextLayout | null;
  translation: TextLayout | null;
  wordY: number;
  ipaY: number;
  posY: number;
  defY: number;
  defH: number;
  exY: number;
  exH: number;
  trY: number;
}

function layout(ctx: Ctx, data: WordOfDayData): Layout {
  const tagBottom = data.label.trim() ? SAFE.top + 78 : SAFE.top - 20;
  const word = fitText(ctx, data.word, { maxWidth: SAFE_WIDTH, maxHeight: 360, maxSize: 176, minSize: 72, weight: 800, lineHeight: 1.02, maxLines: 2 });
  const definition = fitText(ctx, data.definition, { maxWidth: SAFE_WIDTH - 110, maxHeight: 330, maxSize: 52, minSize: 32, weight: 600, lineHeight: 1.26 });
  const example = data.example.trim()
    ? fitText(ctx, data.example, { maxWidth: SAFE_WIDTH - 110, maxHeight: 300, maxSize: 46, minSize: 30, weight: 400, lineHeight: 1.3 })
    : null;
  const translation = data.translation.trim() ? layoutText(ctx, data.translation, SAFE_WIDTH - 120, { size: 40, weight: 600, lineHeight: 1.2 }) : null;

  const ipaH = data.ipa.trim() ? 70 : 0;
  const posH = data.partOfSpeech.trim() ? 76 : 0;
  const defH = definition.height + 90;
  const exH = example ? example.height + 90 : 0;
  const trH = translation ? translation.height + 46 : 0;
  const stack = word.height + 24 + ipaH + (posH ? posH + 10 : 0) + 46 + defH + (exH ? exH + 28 : 0) + (trH ? trH + 28 : 0);
  const spare = Math.max(0, SAFE.bottom - (tagBottom + 50) - stack);
  let y = tagBottom + 50 + spare * 0.42;
  const wordY = y;
  y += word.height + 24;
  const ipaY = y + 26;
  y += ipaH;
  const posY = y + 6;
  y += posH ? posH + 10 : 0;
  y += 46;
  const defY = y;
  y += defH + 28;
  const exY = y;
  y += exH ? exH + 28 : 0;
  return { word, definition, example, translation, wordY, ipaY, posY, defY, defH, exY, exH, trY: y };
}

export function renderWordOfDay(ctx: Ctx, data: WordOfDayData, t: number, theme: Theme): void {
  const tl = wordOfDayTimeline(data);
  const L = layout(ctx, data);

  drawTagPill(ctx, data.label, theme, tl.p('intro', t));

  // The word: big pop with an underline sweep.
  const wp = tl.p('word', t);
  if (wp > 0) {
    const s = easeOutBack(clamp(wp * 1.4));
    withTransform(ctx, { alpha: clamp(wp * 3), scale: 0.7 + 0.3 * s, originX: CX, originY: L.wordY + L.word.height / 2 }, () => {
      drawText(ctx, L.word, { x: CX, y: L.wordY, align: 'center', color: theme.text, emphColor: emphOnBg(theme) });
    });
    const uw = Math.min(L.word.width, SAFE_WIDTH) * easeOutCubic(clamp((wp - 0.35) / 0.65));
    if (uw > 0) {
      ctx.fillStyle = theme.accent;
      roundRectPath(ctx, CX - uw / 2, L.wordY + L.word.height + 4, uw, 12, 6);
      ctx.fill();
    }
  }

  const ipa = formatIpa(data.ipa);
  if (ipa) {
    withTransform(ctx, riseIn(tl.p('ipa', t), 30), () => {
      drawLabel(ctx, ipa, CX, L.ipaY, { size: 50, weight: 400, color: theme.textMuted, direction: 'ltr' });
    });
  }

  const pos = data.partOfSpeech.trim();
  if (pos) {
    const p = tl.p('pos', t);
    const w = measureLabel(ctx, pos, 34, 600) + 56;
    withTransform(ctx, { alpha: clamp(p * 2), scale: easeOutBack(p), originX: CX, originY: L.posY + 30 }, () => {
      drawPanel(ctx, CX - w / 2, L.posY, w, 60, { fill: 'rgba(0,0,0,0)', radius: 30, stroke: theme.accent, strokeWidth: 4 });
      drawLabel(ctx, pos, CX, L.posY + 31, { size: 34, weight: 600, color: emphOnBg(theme) });
    });
  }

  // Definition card with an accent bar on the reading-start side.
  withTransform(ctx, riseIn(tl.p('definition', t), 60), () => {
    drawPanel(ctx, SAFE.left, L.defY, SAFE_WIDTH, L.defH, { fill: theme.panel, radius: 36, shadow: theme.dark ? 'rgba(0,0,0,0.3)' : 'rgba(20,18,43,0.12)' });
    const rtl = L.definition.dir === 'rtl';
    ctx.fillStyle = theme.accent;
    roundRectPath(ctx, rtl ? SAFE.right - 22 : SAFE.left + 14, L.defY + 28, 8, L.defH - 56, 4);
    ctx.fill();
    drawText(ctx, L.definition, { x: rtl ? SAFE.right - 55 : SAFE.left + 55, y: L.defY + 45, align: 'start', color: theme.panelText, emphColor: emphOnPanel(theme) });
  });

  // Example sentence, with the target word highlighted.
  if (L.example) {
    const example = L.example;
    const rtl = example.dir === 'rtl';
    const matcher = targetMatcher(data.word);
    withTransform(ctx, riseIn(tl.p('example', t), 60), () => {
      drawPanel(ctx, SAFE.left, L.exY, SAFE_WIDTH, L.exH, { fill: rgba(theme.panel, theme.dark ? 0.12 : 0.55), radius: 36, stroke: rgba(theme.text, 0.15), strokeWidth: 3 });
      drawLabel(ctx, rtl ? '”' : '“', rtl ? SAFE.right - 34 : SAFE.left + 34, L.exY + 40, { size: 90, weight: 800, color: theme.accent, align: 'center' });
      drawText(ctx, example, {
        x: rtl ? SAFE.right - 55 : SAFE.left + 55,
        y: L.exY + 45,
        align: 'start',
        color: theme.text,
        emphColor: emphOnBg(theme),
        highlight:
          data.highlight && tl.started('highlight', t)
            ? { test: matcher, fill: theme.accent, color: theme.accentText, progress: easeOutCubic(tl.p('highlight', t)) }
            : undefined,
      });
    });
  }

  if (L.translation) {
    const tr = L.translation;
    withTransform(ctx, riseIn(tl.p('translation', t), 40), () => {
      const w = Math.min(SAFE_WIDTH, tr.width + 80);
      const h = tr.height + 46;
      drawPanel(ctx, CX - w / 2, L.trY, w, h, { fill: theme.accent, radius: Math.min(h / 2, 40) });
      drawText(ctx, tr, { x: CX, y: L.trY + 23, align: 'center', color: theme.accentText });
    });
  }

  drawTimeline(ctx, theme, t, tl.total);
}
