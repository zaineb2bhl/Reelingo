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
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  fitText,
  lerp,
  mix,
  pulse,
  readableOn,
  rgba,
  riseIn,
  slideIn,
  withTransform,
  type Ctx,
  type Direction,
  type TextLayout,
  type Timeline,
} from '@/scene';
import type { Theme } from '@/themes';
import { CX, contentDirection, drawTagPill, drawTimeline, emphOnBg, emphOnPanel, optionLetters, readingTime, typingDuration } from '../kit';
import { PACE_SECONDS } from '../shared';
import type { Cue } from '../types';
import type { QuizData } from './schema';

const OPTION_STAGGER = 0.28;
const OPTION_IN = 0.45;

export function quizTimeline(data: QuizData): Timeline {
  const n = Math.max(1, data.options.length);
  const hasExplanation = data.explanation.trim().length > 0;
  return buildTimeline(
    [
      { id: 'intro', duration: 0.45 },
      { id: 'question', duration: typingDuration(data.question) },
      { id: 'options', duration: OPTION_STAGGER * (n - 1) + OPTION_IN, offset: 0.1 },
      { id: 'countdown', duration: PACE_SECONDS[data.pace], offset: 0.1 },
      { id: 'reveal', duration: hasExplanation ? 1.6 : 2.2 },
      { id: 'exit', duration: hasExplanation ? 0.45 : 0 },
      { id: 'explain', duration: hasExplanation ? readingTime(data.explanation, 2.5, 7) + 0.6 : 0 },
    ],
    0.3,
  );
}

export function quizDuration(data: QuizData): number {
  return quizTimeline(data).total;
}

export function quizCues(data: QuizData): Cue[] {
  const tl = quizTimeline(data);
  const cues: Cue[] = [{ t: 0, sfx: 'whoosh', gain: 0.8 }];
  const opts = tl.get('options');
  data.options.forEach((_, i) => cues.push({ t: opts.start + i * OPTION_STAGGER, sfx: 'pop', gain: 0.7 }));
  const cd = tl.get('countdown');
  for (let s = 0; s < Math.round(cd.duration); s++) cues.push({ t: cd.start + s, sfx: 'tick', gain: s >= cd.duration - 3 ? 0.9 : 0.55 });
  cues.push({ t: tl.get('reveal').start, sfx: 'correct' });
  if (tl.get('explain').duration > 0) cues.push({ t: tl.get('exit').start, sfx: 'whoosh', gain: 0.6 });
  return cues;
}

interface OptionBox {
  y: number;
  h: number;
  text: TextLayout;
}

interface QuizLayout {
  dir: Direction;
  tagBottom: number;
  question: TextLayout;
  questionY: number;
  options: OptionBox[];
  ringY: number;
  ringR: number;
}

const BADGE = 84;
const PAD_X = 34;
const OPT_GAP = 28;
const RING_R = 92;

function layout(ctx: Ctx, data: QuizData): QuizLayout {
  const dir = contentDirection(data.question, data.options[0]?.text ?? '');
  const tagBottom = data.label.trim() ? SAFE.top + 78 : SAFE.top - 20;
  const textWidth = SAFE_WIDTH - PAD_X * 2 - BADGE - 26;

  const n = data.options.length;
  const optSize = n >= 4 ? 50 : 56;
  const texts = data.options.map((o) =>
    fitText(ctx, o.text, { maxWidth: textWidth, maxHeight: optSize * 2.5, maxSize: optSize, minSize: 30, weight: 600, lineHeight: 1.15, maxLines: 2 }),
  );
  const heights = texts.map((t) => Math.max(n >= 4 ? 132 : 148, t.height + 64));
  const optionsHeight = heights.reduce((a, b) => a + b, 0) + OPT_GAP * Math.max(0, n - 1);

  const ringBlock = RING_R * 2 + 40;
  const available = SAFE.bottom - tagBottom - 50 - optionsHeight - 60 - ringBlock;
  const question = fitText(ctx, data.question, {
    maxWidth: SAFE_WIDTH,
    maxHeight: Math.max(120, Math.min(420, available)),
    maxSize: 100,
    minSize: 48,
    weight: 800,
    lineHeight: 1.12,
  });

  // Centre the whole stack vertically inside the free space.
  const stack = question.height + 70 + optionsHeight + 60 + ringBlock;
  const spare = Math.max(0, SAFE.bottom - (tagBottom + 50) - stack);
  const questionY = tagBottom + 50 + spare * 0.45;
  let y = questionY + question.height + 70;
  const options: OptionBox[] = texts.map((text, i) => {
    const box = { y, h: heights[i] ?? 116, text };
    y += box.h + OPT_GAP;
    return box;
  });
  const ringY = y - OPT_GAP + 60 + RING_R + 10;
  return { dir, tagBottom, question, questionY, options, ringY, ringR: RING_R };
}

export function renderQuiz(ctx: Ctx, data: QuizData, t: number, theme: Theme): void {
  const tl = quizTimeline(data);
  const L = layout(ctx, data);
  const exitP = tl.p('exit', t, easeInCubic);

  if (exitP < 1) {
    withTransform(ctx, { alpha: 1 - exitP, dy: -exitP * 140 }, () => drawQuestionScene(ctx, data, t, theme, tl, L));
  }
  if (tl.get('explain').duration > 0 && tl.started('explain', t)) {
    drawExplanationScene(ctx, data, t, theme, tl, L);
  }
  drawTimeline(ctx, theme, t, tl.total);
}

function drawQuestionScene(ctx: Ctx, data: QuizData, t: number, theme: Theme, tl: Timeline, L: QuizLayout): void {
  drawTagPill(ctx, data.label, theme, tl.p('intro', t));

  drawText(ctx, L.question, {
    x: CX,
    y: L.questionY,
    align: 'center',
    color: theme.text,
    emphColor: emphOnBg(theme),
    reveal: tl.p('question', t) * (L.question.totalChars + 1),
  });

  const letters = optionLetters(L.dir);
  const optsStart = tl.get('options').start;
  const revealP = tl.p('reveal', t);
  const revealed = tl.started('reveal', t);

  data.options.forEach((opt, i) => {
    const box = L.options[i];
    if (!box) return;
    const inP = clamp((t - optsStart - i * OPTION_STAGGER) / OPTION_IN);
    if (inP <= 0) return;
    const enter = slideIn(inP, 140, L.dir === 'rtl');

    const correctP = revealed && opt.correct ? easeOutCubic(clamp(revealP * 2.5)) : 0;
    const wrongP = revealed && !opt.correct ? easeOutCubic(clamp(revealP * 2.5)) : 0;
    const bump = revealed && opt.correct ? pulse(t, tl.get('reveal').start, 0.5) * 0.045 : 0;

    const x = SAFE.left;
    const w = SAFE_WIDTH;
    withTransform(
      ctx,
      { ...enter, alpha: (enter.alpha ?? 1) * (1 - wrongP * 0.6), scale: 1 + bump, originX: CX, originY: box.y + box.h / 2 },
      () => {
        const fill = mix(theme.panel, theme.correct, correctP);
        const textColor = correctP > 0.5 ? readableOn(theme.correct) : theme.panelText;
        drawPanel(ctx, x, box.y, w, box.h, {
          fill,
          radius: 30,
          shadow: theme.dark ? 'rgba(0,0,0,0.28)' : 'rgba(20,18,43,0.12)',
          shadowBlur: 30,
          shadowOffsetY: 10,
        });

        const badgeX = L.dir === 'rtl' ? x + w - PAD_X - BADGE / 2 : x + PAD_X + BADGE / 2;
        const cy = box.y + box.h / 2;
        ctx.beginPath();
        ctx.arc(badgeX, cy, BADGE / 2, 0, Math.PI * 2);
        ctx.fillStyle = correctP > 0 ? mix(theme.accent, '#ffffff', correctP) : wrongP > 0 ? mix(theme.accent, theme.wrong, wrongP) : theme.accent;
        ctx.fill();
        if (correctP > 0.15) {
          drawTick(ctx, badgeX, cy, BADGE * 0.62, theme.correct, clamp((correctP - 0.15) / 0.85), 9);
        } else if (wrongP > 0.4) {
          drawCross(ctx, badgeX, cy, BADGE * 0.7, readableOn(theme.wrong), clamp((wrongP - 0.4) / 0.6), 8);
        } else {
          drawLabel(ctx, letters[i] ?? '', badgeX, cy + 2, { size: 42, weight: 800, color: theme.accentText });
        }

        const textX = L.dir === 'rtl' ? x + w - PAD_X - BADGE - 26 : x + PAD_X + BADGE + 26;
        drawText(ctx, box.text, {
          x: textX,
          y: cy - box.text.height / 2,
          align: L.dir === 'rtl' ? 'right' : 'left',
          color: textColor,
          emphColor: correctP > 0.5 ? textColor : emphOnPanel(theme),
        });
      },
    );
  });

  // Countdown ring, which turns into a tick on reveal.
  const cdIn = clamp((t - tl.get('countdown').start + 0.25) / 0.35);
  if (cdIn > 0) {
    const scale = easeOutBack(cdIn);
    withTransform(ctx, { alpha: cdIn, scale, originX: CX, originY: L.ringY }, () => {
      if (!revealed) {
        drawCountdownRing(ctx, {
          cx: CX,
          cy: L.ringY,
          radius: L.ringR,
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
        ctx.arc(0, 0, L.ringR + 7, 0, Math.PI * 2);
        ctx.fillStyle = theme.correct;
        ctx.fill();
        ctx.restore();
        drawTick(ctx, CX, L.ringY, L.ringR * 1.1, readableOn(theme.correct), clamp(revealP * 2.2), 16);
      }
    });
  }
}

function drawExplanationScene(ctx: Ctx, data: QuizData, t: number, theme: Theme, tl: Timeline, L: QuizLayout): void {
  const local = tl.elapsed('explain', t);
  const correct = data.options.filter((o) => o.correct);
  const letters = optionLetters(L.dir);

  const answerText = correct.map((o) => o.text).join('  ·  ');
  const answer = fitText(ctx, answerText, { maxWidth: SAFE_WIDTH - 100, maxHeight: 300, maxSize: 64, minSize: 36, weight: 800, lineHeight: 1.15 });
  const explanation = fitText(ctx, data.explanation, {
    maxWidth: SAFE_WIDTH - 100,
    maxHeight: 640,
    maxSize: 56,
    minSize: 34,
    weight: 400,
    lineHeight: 1.32,
  });

  const answerH = answer.height + 150;
  const explH = explanation.height + 100;
  const total = answerH + 40 + explH;
  const top = SAFE.top + Math.max(60, (SAFE.bottom - SAFE.top - total) / 2);

  withTransform(ctx, riseIn(clamp(local / 0.5), 80), () => {
    drawPanel(ctx, SAFE.left, top, SAFE_WIDTH, answerH, { fill: theme.correct, radius: 36, shadow: 'rgba(0,0,0,0.2)' });
    const fg = readableOn(theme.correct);
    const idx = data.options.findIndex((o) => o.correct);
    const letter = correct.length === 1 && idx >= 0 ? (letters[idx] ?? '') : '';
    const iconX = letter ? CX - 34 : CX;
    ctx.beginPath();
    ctx.arc(iconX, top + 62, 30, 0, Math.PI * 2);
    ctx.fillStyle = rgba(fg, 0.18);
    ctx.fill();
    drawTick(ctx, iconX, top + 62, 40, fg, 1, 7);
    if (letter) drawLabel(ctx, letter, CX + 34, top + 64, { size: 44, weight: 800, color: fg });
    drawText(ctx, answer, { x: CX, y: top + 100, align: 'center', color: fg, emphColor: fg });
  });

  withTransform(ctx, riseIn(clamp((local - 0.25) / 0.5), 80), () => {
    const y = top + answerH + 40;
    drawPanel(ctx, SAFE.left, y, SAFE_WIDTH, explH, { fill: theme.panel, radius: 36, shadow: 'rgba(0,0,0,0.18)' });
    drawText(ctx, explanation, {
      x: explanation.dir === 'rtl' ? SAFE.right - 50 : SAFE.left + 50,
      y: y + 50,
      align: 'start',
      color: theme.panelText,
      emphColor: emphOnPanel(theme),
    });
  });
}
