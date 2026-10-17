import { SAFE, SAFE_WIDTH } from '@/config';
import {
  buildTimeline,
  clamp,
  drawConfetti,
  drawLabel,
  drawPanel,
  drawText,
  easeOutBack,
  easeOutCubic,
  fitText,
  lerp,
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
import { CX, contentDirection, drawTagPill, drawTimeline, emphOnBg } from '../kit';
import type { Cue } from '../types';
import { ITEM_SECONDS, type Top5Data } from './schema';

const DRUMROLL = 1.1;

export function top5Timeline(data: Top5Data): Timeline {
  const n = data.items.length;
  const per = ITEM_SECONDS[data.pace];
  const specs = [
    { id: 'intro', duration: 1.2 },
    { id: 'slots', duration: 0.3 + 0.08 * n },
  ];
  // Reveal from the last rank up to #2, then a short drumroll before #1.
  for (let rank = n; rank >= 2; rank--) specs.push({ id: `item${rank}`, duration: per });
  specs.push({ id: 'drumroll', duration: DRUMROLL });
  specs.push({ id: 'item1', duration: per + 1.6 });
  return buildTimeline(specs, 0.2);
}

export function top5Duration(data: Top5Data): number {
  return top5Timeline(data).total;
}

export function top5Cues(data: Top5Data): Cue[] {
  const tl = top5Timeline(data);
  const cues: Cue[] = [{ t: 0, sfx: 'whoosh', gain: 0.8 }];
  for (let rank = data.items.length; rank >= 2; rank--) cues.push({ t: tl.get(`item${rank}`).start, sfx: 'pop' });
  const drum = tl.get('drumroll');
  for (let i = 0; i < 4; i++) cues.push({ t: drum.start + 0.1 + i * 0.24, sfx: 'tick', gain: 0.5 + i * 0.12 });
  cues.push({ t: tl.get('item1').start, sfx: 'reveal' }, { t: tl.get('item1').start + 0.05, sfx: 'correct', gain: 0.6 });
  return cues;
}

interface Row {
  y: number;
  h: number;
  text: TextLayout;
  detail: TextLayout | null;
}

const BADGE_W = 104;

function layout(ctx: Ctx, data: Top5Data): { title: TextLayout; titleY: number; rows: Row[] } {
  const n = data.items.length;
  const tagBottom = SAFE.top + 78;
  const title = fitText(ctx, data.title, { maxWidth: SAFE_WIDTH, maxHeight: 300, maxSize: 84, minSize: 46, weight: 800, lineHeight: 1.1 });
  const titleY = tagBottom + 36;
  const top = titleY + title.height + 54;
  const gap = n >= 5 ? 20 : 26;
  const avail = SAFE.bottom - top;
  const rowH = Math.min(n >= 5 ? 196 : 220, (avail - gap * (n - 1)) / n);
  const textW = SAFE_WIDTH - BADGE_W - 70;
  const rows = data.items.map((item, i) => {
    const hasDetail = item.detail.trim().length > 0;
    const text = fitText(ctx, item.text, {
      maxWidth: textW,
      maxHeight: hasDetail ? rowH * 0.45 : rowH * 0.7,
      maxSize: i === 0 ? 64 : 56,
      minSize: 30,
      weight: 800,
      lineHeight: 1.1,
      maxLines: hasDetail ? 1 : 2,
    });
    const detail = hasDetail
      ? fitText(ctx, item.detail, { maxWidth: textW, maxHeight: rowH * 0.36, maxSize: 36, minSize: 24, weight: 400, lineHeight: 1.2, maxLines: 2 })
      : null;
    return { y: top + i * (rowH + gap), h: rowH, text, detail };
  });
  // Centre the block if rows didn't fill the space.
  const used = n * rowH + (n - 1) * gap;
  const shift = Math.max(0, (avail - used) * 0.5);
  rows.forEach((r) => (r.y += shift));
  return { title, titleY: titleY + shift * 0.4, rows };
}

export function renderTop5(ctx: Ctx, data: Top5Data, t: number, theme: Theme): void {
  const tl = top5Timeline(data);
  const L = layout(ctx, data);
  const dir = contentDirection(data.title, data.items[0]?.text ?? '');
  const rtl = dir === 'rtl';
  const n = data.items.length;

  drawTagPill(ctx, rtl ? `أفضل ${n}` : `TOP ${n}`, theme, clamp(t / 0.45));
  withTransform(ctx, riseIn(clamp((t - 0.2) / 0.6), 60), () => {
    drawText(ctx, L.title, { x: CX, y: L.titleY, align: 'center', color: theme.text, emphColor: emphOnBg(theme) });
  });

  const slotsStart = tl.get('slots').start;
  L.rows.forEach((row, i) => {
    const rank = i + 1;
    const item = data.items[i];
    if (!item) return;
    const slotP = easeOutCubic(clamp((t - slotsStart - (n - 1 - i) * 0.08) / 0.4));
    if (slotP <= 0) return;
    const seg = tl.get(`item${rank}`);
    const revealP = clamp((t - seg.start) / 0.55);
    const isTop = rank === 1;
    const x = SAFE.left;
    const w = SAFE_WIDTH;
    const cy = row.y + row.h / 2;

    // Drumroll pulse on the empty #1 slot.
    const drumPulse = isTop && tl.active('drumroll', t) ? 0.5 + 0.5 * Math.sin(tl.elapsed('drumroll', t) * Math.PI * 8) : 0;
    const bump = isTop ? pulse(t, seg.start, 0.6) * 0.07 : pulse(t, seg.start, 0.35) * 0.03;

    withTransform(ctx, { alpha: slotP, dy: (1 - slotP) * 40, scale: 1 + bump + drumPulse * 0.015, originX: CX, originY: cy }, () => {
      // Empty slot
      drawPanel(ctx, x, row.y, w, row.h, {
        fill: rgba(theme.text, theme.dark ? 0.08 + drumPulse * 0.08 : 0.06 + drumPulse * 0.08),
        radius: 30,
        stroke: rgba(theme.text, 0.18 + drumPulse * 0.4),
        strokeWidth: 3,
      });

      // Filled panel wipes in from the reading-start side.
      if (revealP > 0) {
        const e = easeOutCubic(revealP);
        const fillColor = isTop ? theme.accent : theme.panel;
        ctx.save();
        const wipeW = w * e;
        roundRectPath(ctx, rtl ? x + w - wipeW : x, row.y, wipeW, row.h, 30);
        ctx.clip();
        drawPanel(ctx, x, row.y, w, row.h, { fill: fillColor, radius: 30, shadow: isTop ? rgba(theme.accent, 0.6) : 'rgba(0,0,0,0.18)', shadowBlur: isTop ? 50 : 24 });
        ctx.restore();
      }

      // Rank badge
      const bx = rtl ? x + w - BADGE_W / 2 - 18 : x + BADGE_W / 2 + 18;
      const filled = revealP > 0.3;
      const badgeFill = isTop && filled ? readableOn(theme.accent) : filled ? theme.accent : rgba(theme.text, 0.14);
      const badgeText = isTop && filled ? theme.accent : filled ? theme.accentText : theme.text;
      const r = Math.min(row.h * 0.34, 48) * (isTop ? lerp(1, 1.12, easeOutBack(revealP)) : 1);
      ctx.beginPath();
      ctx.arc(bx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = badgeFill;
      ctx.fill();
      drawLabel(ctx, String(rank), bx, cy + 2, { size: r * 1.05, weight: 800, color: badgeText });

      // Text
      if (revealP > 0) {
        const textP = clamp((revealP - 0.25) / 0.75);
        const textX = rtl ? x + w - BADGE_W - 44 : x + BADGE_W + 44;
        const fg = isTop ? theme.accentText : theme.panelText;
        const muted = isTop ? rgba(theme.accentText, 0.78) : theme.panelMuted;
        const blockH = row.text.height + (row.detail ? row.detail.height + 6 : 0);
        withTransform(ctx, { alpha: textP, dx: (1 - easeOutCubic(textP)) * (rtl ? -30 : 30) }, () => {
          const top = cy - blockH / 2;
          drawText(ctx, row.text, { x: textX, y: top, align: rtl ? 'right' : 'left', color: fg, emphColor: fg });
          if (row.detail) {
            drawText(ctx, row.detail, { x: textX, y: top + row.text.height + 6, align: rtl ? 'right' : 'left', color: muted });
          }
        });
      }
    });

    if (isTop) {
      drawConfetti(ctx, {
        t: t - seg.start,
        originX: CX,
        originY: cy,
        colors: [theme.accent, mix(theme.accent, '#ffffff', 0.5), theme.correct, theme.glow[0], theme.glow[1]],
        seed: 11,
        count: 130,
      });
    }
  });

  drawTimeline(ctx, theme, t, tl.total);
}
