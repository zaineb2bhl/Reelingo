/**
 * Dev helper: renders a strip of frames for each format to PNG so animation
 * timing and layout can be reviewed without a browser.
 *
 *   npx vite-node scripts/contact-sheet.ts [formatId] [themeId] [out.png] [dataJson]
 */
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import { readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { VIDEO } from '@/config';
import { allFormats } from '@/formats/registry';
import { renderFrame } from '@/render/frame';
import type { Ctx } from '@/scene/types';
import { isThemeId, resolveTheme } from '@/themes';

for (const family of ['inter', 'cairo']) {
  const dir = resolve('node_modules/@fontsource', family, 'files');
  for (const file of readdirSync(dir)) {
    if (/-(latin|latin-ext|arabic)-(400|600|800)-normal\.woff2$/.test(file)) {
      GlobalFonts.registerFromPath(join(dir, file), family === 'inter' ? 'Inter' : 'Cairo');
    }
  }
}

const [formatId, themeArg = 'ink', out = 'contact-sheet.png', dataJson] = process.argv.slice(2);
const theme = resolveTheme(isThemeId(themeArg) ? themeArg : 'ink');
const formats = allFormats.filter((f) => !formatId || formatId === 'all' || f.id === formatId);
const FRAMES = 8;
const scale = 0.25;
const fw = VIDEO.width * scale;
const fh = VIDEO.height * scale;
const sheet = createCanvas(fw * FRAMES, (fh + 30) * formats.length);
const sctx = sheet.getContext('2d');
sctx.fillStyle = '#ffffff';
sctx.fillRect(0, 0, sheet.width, sheet.height);

const frame = createCanvas(VIDEO.width, VIDEO.height);
const fctx = frame.getContext('2d');

formats.forEach((format, row) => {
  const data: unknown = dataJson ? JSON.parse(dataJson) : format.defaults;
  const d = format.duration(data);
  for (let i = 0; i < FRAMES; i++) {
    const t = (d * (i + 0.5)) / FRAMES;
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    renderFrame(fctx as unknown as Ctx, format, data, t, theme);
    sctx.drawImage(frame, i * fw, row * (fh + 30), fw, fh);
    sctx.fillStyle = '#000000';
    sctx.font = '16px Inter';
    sctx.fillText(`${format.id} t=${t.toFixed(2)}s`, i * fw + 6, row * (fh + 30) + fh + 20);
  }
});

writeFileSync(out, sheet.toBuffer('image/png'));
console.log(`wrote ${out} (${formats.length} format(s))`);
