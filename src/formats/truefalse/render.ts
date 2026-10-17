import { SAFE, SAFE_WIDTH } from '@/config';
import {
  buildTimeline,
  clamp,
  drawCountdownRing,
  drawCross,
  drawLabel,
  drawPanel,
  drawText,
  drawTick,
  easeOutBack,
  easeOutCubic,
  fitText,
  lerp,
  measureLabel,
  mix,
  pulse,
  readableOn,
  rgba,
  riseIn,
  roundRectPath,
  withTransform,
  type Ctx,
  type TextLayout,
  type Timeline,
} from '@/scene';
import type { Theme } from '@/themes';
import { CX, contentDirection, drawTagPill, drawTimeline, emphOnPanel, readingTime, typingDuration } from '../kit';
import { PACE_SECONDS } from '../shared';
import type { Cue } from '../types';
import type { TrueFalseData } from './schema';

export function trueFalseTimeline(data: TrueFalseData): Timeline {
  const hasExplanation = data.explanation.trim().length > 0;
  return buildTimeline(
    [
      { id: 'intro', duration: 0.45 },
      { id: 'statement', duration: typingDuration(data.statement, 0.8, 2.4) },
      { id: 'choices', duration: 0.55, offset: 0.1 },
      { id: 'countdown', duration: PACE_SECONDS[data.pace], offset: 0.1 },
      { id: 'reveal', duration: hasExplanation ? 1.3 : 2.2 },
      { id: 'explain', duration: hasExplanation ? readingTime(data.explanation, 2.5, 7) + 0.5 : 0 },
    ],
    0.3,
  );
}

export function trueFalseDuration(data: TrueFalseData): number {
  return trueFalseTimeline(data).total;
}

export function trueFalseCues(data: TrueFalseData): Cue[] {
  const tl = trueFalseTimeline(data);
  const cues: Cue[] = [{ t: 0, sfx: 'whoosh', gain: 0.8 }, { t: tl.get('choices').start, sfx: 'pop', gain: 0.7 }];
  const cd = tl.get('countdown');
  for (let s = 0; s < Math.round(cd.duration); s++) cues.push({ t: cd.start + s, sfx: 'tick', gain: s >= cd.duration - 3 ? 0.9 : 0.55 });
  cues.push({ t: tl.get('reveal').start, sfx: 'correct' }, { t: tl.get('reveal').start + 0.12, sfx: 'reveal', gain: 0.5 });
  if (tl.get('explain').duration > 0) cues.push({ t: tl.get('explain').start, sfx: 'pop', gain: 0.5 });
  return cues;
}

interface Layout {
  statement: TextLayout;
  explanation: TextLayout | null;
  cardY: number;
  cardH: number;
  choicesY: number;
  ringY: number;
  explainY: number;
}

const CHOICE_H = 150;
const RING_R = 92;
const CARD_PAD = 56;

function layout(ctx: Ctx, data: TrueFalseData): Layout {
  const tagBottom = data.label.trim() ? SAFE.top + 78 : SAFE.top - 20;
  const statement = fitText(ctx, data.statement, {
    maxWidth: SAFE_WIDTH - CARD_PAD * 2,
    maxHeight: 520,
    maxSize: 84,
    minSize: 44,
    weight: 800,
    lineHeight: 1.16,
  });
  const explanation = data.explanation.trim()
    ? fitText(ctx, data.explanation, { maxWidth: SAFE_WIDTH - 100, maxHeight: 420, maxSize: 50, minSize: 32, weight: 400, lineHeight: 1.3 })
    : null;
  const cardH = statement.height + CARD_PAD * 2 + 20;
  const lower = Math.max(RING_R * 2 + 30, explanation ? explanation.height + 90 : 0);
  const stack = cardH + 60 + CHOICE_H + 60 + lower;
  const spare = Math.max(0, SAFE.bottom - (tagBottom + 60) - stack);
  const cardY = tagBottom + 60 + spare * 0.4;
  const choicesY = cardY + cardH + 60;
  const lowerY = choicesY + CHOICE_H + 60;
  return { statement, explanation, cardY, cardH, choicesY, ringY: lowerY + RING_R + 10, explainY: lowerY };
}

export function renderTrueFalse(ctx: Ctx, data: TrueFalseData, t: number, theme: Theme): void {
  const tl = trueFalseTimeline(data);
  const L = layout(ctx, data);
  const dir = contentDirection(data.statement);
  const revealed = tl.started('reveal', t);
  const revealP = tl.p('reveal', t);

  drawTagPill(ctx, data.label, theme, tl.p('intro', t));

  // Statement card
  const cardIn = clamp(tl.elapsed('intro', t) / 0.5);
  withTransform(ctx, riseIn(cardIn, 50), () => {
    drawPanel(ctx, SAFE.left, L.cardY, SAFE_WIDTH, L.cardH, {
      fill: theme.panel,
      radius: 44,
      shadow: theme.dark ? 'rgba(0,0,0,0.3)' : 'rgba(20,18,43,0.14)',
      shadowBlur: 40,
    });
    drawText(ctx, L.statement, {
      x: CX,
      y: L.cardY + (L.cardH - L.statement.height) / 2,
      align: 'center',
      color: theme.panelText,
      emphColor: emphOnPanel(theme),
      reveal: tl.p('statement', t) * (L.statement.totalChars + 1),
    });
  });

  // Choices
  const gap = 30;
  const w = (SAFE_WIDTH - gap) / 2;
  const choices = [
    { value: true, label: data.trueLabel },
    { value: false, label: data.falseLabel },
  ];
  const choiceIn = tl.p('choices', t);
  choices.forEach((choice, i) => {
    // "True" sits on the reading-start side.
    const slot = dir === 'rtl' ? 1 - i : i;
    const x = SAFE.left + slot * (w + gap);
    const p = clamp(choiceIn * 1.6 - i * 0.6);
    if (p <= 0) return;
    const isAnswer = choice.value === data.answer;
    const correctP = revealed && isAnswer ? easeOutCubic(clamp(revealP * 3)) : 0;
    const wrongP = revealed && !isAnswer ? easeOutCubic(clamp(revealP * 3)) : 0;
    const bump = revealed && isAnswer ? pulse(t, tl.get('reveal').start, 0.5) * 0.06 : 0;
    const cy = L.choicesY + CHOICE_H / 2;
    withTransform(ctx, { alpha: easeOutCubic(p) * (1 - wrongP * 0.55), scale: easeOutBack(p) * (1 + bump), originX: x + w / 2, originY: cy }, () => {
      const fill = mix(theme.panel, theme.correct, correctP);
      drawPanel(ctx, x, L.choicesY, w, CHOICE_H, { fill, radius: CHOICE_H / 2, shadow: theme.dark ? 'rgba(0,0,0,0.25)' : 'rgba(20,18,43,0.12)', shadowBlur: 26 });
      const fg = correctP > 0.5 ? readableOn(theme.correct) : theme.panelText;
      const iconColor = choice.value ? theme.correct : theme.wrong;
      const labelW = Math.min(w - 150, measureLabel(ctx, choice.label, 52, 800));
      const groupW = 64 + 22 + labelW;
      const startX = x + (w - groupW) / 2;
      const iconX = dir === 'rtl' ? startX + groupW - 32 : startX + 32;
      const textX = dir === 'rtl' ? startX + groupW - 64 - 22 : startX + 64 + 22;
      ctx.beginPath();
      ctx.arc(iconX, cy, 32, 0, Math.PI * 2);
      ctx.fillStyle = correctP > 0.5 ? rgba(fg, 0.2) : rgba(iconColor, 0.16);
      ctx.fill();
      const markColor = correctP > 0.5 ? fg : iconColor;
      if (choice.value) drawTick(ctx, iconX, cy, 44, markColor, 1, 7);
      else drawCross(ctx, iconX, cy, 46, markColor, 1, 7);
      ctx.save();
      roundRectPath(ctx, x + 10, L.choicesY, w - 20, CHOICE_H, CHOICE_H / 2);
      ctx.clip();
      drawLabel(ctx, choice.label, textX, cy + 2, { size: 52, weight: 800, color: fg, align: dir === 'rtl' ? 'right' : 'left' });
      ctx.restore();
    });
  });

  // Countdown ring, replaced by the explanation after the reveal.
  const hasExplanation = L.explanation !== null && tl.get('explain').duration > 0;
  const ringIn = clamp((t - tl.get('countdown').start + 0.25) / 0.35);
  const ringOut = hasExplanation ? clamp(tl.elapsed('explain', t) / 0.3) : 0;
  if (ringIn > 0 && ringOut < 1) {
    withTransform(ctx, { alpha: ringIn * (1 - ringOut), scale: easeOutBack(ringIn), originX: CX, originY: L.ringY }, () => {
      if (!revealed) {
        drawCountdownRing(ctx, {
          cx: CX,
          cy: L.ringY,
          radius: RING_R,
          progress: tl.p('countdown', t),
          seconds: PACE_SECONDS[data.pace],
          track: rgba(theme.text, 0.16),
          color: theme.accent,
          urgentColor: theme.wrong,
          fill: rgba(theme.dark ? '#000000' : '#ffffff', theme.dark ? 0.18 : 0.55),
          textColor: theme.text,
        });
      } else {
        const p = easeOutBack(clamp(revealP * 3));
        ctx.save();
        ctx.translate(CX, L.ringY);
        ctx.scale(lerp(0.6, 1, p), lerp(0.6, 1, p));
        ctx.beginPath();
        ctx.arc(0, 0, RING_R + 7, 0, Math.PI * 2);
        ctx.fillStyle = theme.correct;
        ctx.fill();
        ctx.restore();
        drawTick(ctx, CX, L.ringY, RING_R * 1.1, readableOn(theme.correct), clamp(revealP * 2.2), 16);
      }
    });
  }

  // Stamp over the statement card
  if (revealed) {
    const s = easeOutBack(clamp(revealP * 2.4));
    const label = (data.answer ? data.trueLabel : data.falseLabel).toLocaleUpperCase();
    const color = data.answer ? theme.correct : theme.wrong;
    const sw = measureLabel(ctx, label, 64, 800) + 70;
    const sx = dir === 'rtl' ? SAFE.left + 30 + sw / 2 : SAFE.right - 30 - sw / 2;
    const sy = L.cardY;
    withTransform(ctx, { alpha: clamp(revealP * 5), scale: lerp(1.8, 1, s), rotate: -0.14, originX: sx, originY: sy }, () => {
      drawPanel(ctx, sx - sw / 2, sy - 52, sw, 104, { fill: color, radius: 22, stroke: readableOn(color), strokeWidth: 6, shadow: 'rgba(0,0,0,0.25)' });
      drawLabel(ctx, label, sx, sy + 3, { size: 64, weight: 800, color: readableOn(color) });
    });
  }

  if (hasExplanation && L.explanation) {
    const explanation = L.explanation;
    const p = clamp((tl.elapsed('explain', t) - 0.15) / 0.5);
    if (p > 0) {
      withTransform(ctx, riseIn(p, 70), () => {
        const h = explanation.height + 90;
        drawPanel(ctx, SAFE.left, L.explainY, SAFE_WIDTH, h, { fill: rgba(theme.panel, 0.96), radius: 36, shadow: 'rgba(0,0,0,0.18)' });
        ctx.fillStyle = data.answer ? theme.correct : theme.wrong;
        const barX = explanation.dir === 'rtl' ? SAFE.right - 18 : SAFE.left + 12;
        roundRectPath(ctx, barX, L.explainY + 26, 6, h - 52, 3);
        ctx.fill();
        drawText(ctx, explanation, {
          x: explanation.dir === 'rtl' ? SAFE.right - 50 : SAFE.left + 50,
          y: L.explainY + 45,
          align: 'start',
          color: theme.panelText,
          emphColor: emphOnPanel(theme),
        });
      });
    }
  }

  drawTimeline(ctx, theme, t, tl.total);
}
