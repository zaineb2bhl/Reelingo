import { z } from 'zod';
import { SAFE, SAFE_WIDTH, VIDEO } from '@/config';
import {
  buildTimeline,
  drawConfetti,
  drawCountdownRing,
  drawLabel,
  drawPanel,
  drawProgressBar,
  drawText,
  easeOutCubic,
  fitText,
  layoutText,
  measureLabel,
  popIn,
  rgba,
  riseIn,
  withTransform,
  type Ctx,
  type Timeline,
} from '@/scene';
import type { Theme } from '@/themes';
import { PACE_SECONDS, paceSchema } from '../shared';
import { defineFormat, type Cue } from '../types';
import { StarterForm } from './Form';

/**
 * Reference format: a title card that exercises the scene toolkit. It is kept
 * as a minimal example of the plugin contract (see README).
 */
export const starterSchema = z.object({
  tag: z.string().trim().max(24),
  headline: z.string().trim().min(1, 'Add a headline').max(120),
  subtitle: z.string().trim().max(160),
  pace: paceSchema,
});

export type StarterData = z.infer<typeof starterSchema>;

export const starterDefaults: StarterData = {
  tag: 'Lesson 1',
  headline: 'Say it like a *native* speaker',
  subtitle: 'Five everyday phrases you can use today',
  pace: 'quick',
};

function timeline(data: StarterData): Timeline {
  const typing = Math.min(2.2, Math.max(0.8, data.headline.length / 26));
  return buildTimeline(
    [
      { id: 'intro', duration: 0.5 },
      { id: 'headline', duration: typing },
      { id: 'subtitle', duration: 0.6, offset: -0.1 },
      { id: 'countdown', duration: PACE_SECONDS[data.pace] },
      { id: 'celebrate', duration: 1.6 },
    ],
    0.2,
  );
}

function render(ctx: Ctx, data: StarterData, t: number, theme: Theme): void {
  const tl = timeline(data);
  const cx = VIDEO.width / 2;

  // Tag pill
  if (data.tag) {
    withTransform(ctx, popIn(tl.p('intro', t), cx, SAFE.top + 40), () => {
      const w = measureLabel(ctx, data.tag.toUpperCase(), 34, 800) + 64;
      drawPanel(ctx, cx - w / 2, SAFE.top, w, 80, { fill: theme.accent, radius: 40 });
      drawLabel(ctx, data.tag.toUpperCase(), cx, SAFE.top + 42, { size: 34, weight: 800, color: theme.accentText });
    });
  }

  // Headline, typed in
  const headline = fitText(ctx, data.headline, { maxWidth: SAFE_WIDTH, maxHeight: 520, maxSize: 112, minSize: 56, weight: 800, lineHeight: 1.12 });
  const headlineY = SAFE.top + 170;
  drawText(ctx, headline, {
    x: cx,
    y: headlineY,
    align: 'center',
    color: theme.text,
    emphColor: theme.accent,
    reveal: tl.p('headline', t) * (headline.totalChars + 1),
  });

  // Subtitle
  let below = headlineY + headline.height + 40;
  if (data.subtitle) {
    const sub = layoutText(ctx, data.subtitle, SAFE_WIDTH - 60, { size: 48, weight: 400, lineHeight: 1.3 });
    withTransform(ctx, riseIn(tl.p('subtitle', t)), () => {
      drawText(ctx, sub, { x: cx, y: below, align: 'center', color: theme.textMuted });
    });
    below += sub.height;
  }

  // Countdown ring
  const ringY = Math.max(below + 260, 1180);
  withTransform(ctx, popIn(tl.p('countdown', t, easeOutCubic) * 4, cx, ringY), () => {
    drawCountdownRing(ctx, {
      cx,
      cy: ringY,
      radius: 120,
      progress: tl.p('countdown', t),
      seconds: PACE_SECONDS[data.pace],
      track: rgba(theme.text, 0.15),
      color: theme.accent,
      urgentColor: theme.wrong,
      fill: rgba(theme.panel, theme.dark ? 0.08 : 0.6),
      textColor: theme.text,
    });
  });

  drawConfetti(ctx, {
    t: tl.elapsed('celebrate', t),
    originX: cx,
    originY: ringY,
    colors: [theme.accent, theme.correct, theme.glow[0], theme.glow[1], '#ffffff'],
  });

  drawProgressBar(ctx, {
    x: SAFE.left,
    y: SAFE.bottom - 14,
    width: SAFE_WIDTH,
    height: 14,
    progress: t / tl.total,
    track: rgba(theme.text, 0.15),
    fill: theme.accent,
  });
}

function cues(data: StarterData): Cue[] {
  const tl = timeline(data);
  const out: Cue[] = [{ t: 0, sfx: 'whoosh' }];
  const cd = tl.get('countdown');
  for (let s = 0; s < cd.duration; s++) out.push({ t: cd.start + s, sfx: 'tick', gain: 0.6 });
  out.push({ t: tl.get('celebrate').start, sfx: 'correct' });
  return out;
}

export default defineFormat<StarterData>({
  id: 'starter',
  order: 99,
  hidden: true,
  title: { en: 'Title card', fr: 'Carte titre', ar: 'بطاقة عنوان' },
  description: { en: 'A simple animated title. Reference example for building formats.' },
  schema: starterSchema,
  defaults: starterDefaults,
  Form: StarterForm,
  render,
  duration: (data) => timeline(data).total,
  cues,
});
