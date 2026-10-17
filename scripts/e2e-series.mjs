/**
 * End-to-end check of "Turn a document into a series" in a real Chrome.
 * Everything runs locally (no network APIs). Needs the dev server running.
 *
 *   node scripts/e2e-series.mjs [outDir=.] [extra documents…]
 *
 * Generates a sample PDF and Markdown lesson, uploads each (plus any extra
 * files such as a .docx), generates a series and checks the projects.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.REELINGO_URL ?? 'http://localhost:5173';
const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('No Chrome found; set CHROME_PATH');
const [out = '.', ...extra] = process.argv.slice(2);

const LESSON = [
  { size: 20, text: 'Unit 4: Travelling by train' },
  { size: 11, text: 'Vocabulary' },
  { size: 11, text: 'platform – the place where you get on a train' },
  { size: 11, text: 'ticket – a piece of paper that lets you travel' },
  { size: 11, text: 'delay – a time when something happens later than planned' },
  { size: 11, text: 'luggage – the bags you take on a journey' },
  { size: 11, text: 'We usually buy a ticket at the station before the journey. The train leaves from platform' },
  { size: 11, text: 'three at nine o\'clock. Passengers wait on the platform with their luggage.' },
  { size: 11, text: 'Yesterday there was a long delay because of the snow. The conductor checked every ticket' },
  { size: 11, text: 'and helped an old man with his luggage. Trains are comfortable and often faster than cars.' },
  { size: 11, text: 'Remember to keep your ticket until the end of the journey.' },
];

/** Minimal single-page PDF with Helvetica text lines (enough for pdf.js to extract). */
function makePdf(lines) {
  // Escape PDF string syntax and map the en dash to its WinAnsi byte (0x96).
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/–/g, String.fromCharCode(0x96));
  let y = 790;
  const content = lines
    .map((l) => {
      y -= l.size === 20 ? 0 : l.size * 1.6;
      const line = `BT /F1 ${l.size} Tf 50 ${y.toFixed(0)} Td (${esc(l.text)}) Tj ET`;
      if (l.size === 20) y -= 34;
      return line;
    })
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

const pdfPath = join(out, 'sample-lesson.pdf');
writeFileSync(pdfPath, makePdf(LESSON));
const mdPath = join(out, 'sample-lesson.md');
writeFileSync(
  mdPath,
  `# Leçon 5 : Au marché\n\n## Vocabulaire\n\n- la pomme : un fruit rond, rouge ou vert\n- la carotte : un légume orange et long\n- le marché : un lieu où on achète des produits frais\n- la saison : une période de l'année\n\n## Texte\n\nChaque samedi, Marie va au marché avec sa grand-mère. Elle achète des pommes, des carottes et des tomates.\nLes fruits de saison sont moins chers et plus savoureux. Marie prépare une soupe de carottes pour le dîner.\n`,
);

const browser = await puppeteer.launch({ executablePath, headless: true });
const errors = [];
let failed = false;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('request', (r) => {
    if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) errors.push(`unexpected network request: ${r.url()}`);
  });
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());

  for (const [i, file] of [pdfPath, mdPath, ...extra].entries()) {
    await page.goto(`${BASE}/#/series`, { waitUntil: 'networkidle0' });
    await page.reload({ waitUntil: 'networkidle0' });
    const input = await page.$('input[type=file]');
    await input.uploadFile(file);
    const name = file.split(/[\\/]/).pop();
    await page.waitForFunction((n) => document.body.textContent?.includes(n) || document.querySelector('.text-rose-700'), { timeout: 20000 }, name);
    const uploadError = await page.$eval('.text-rose-700', (e) => e.textContent).catch(() => null);
    if (uploadError) {
      console.log(`FAIL ${name}: ${uploadError}`);
      failed = true;
      continue;
    }
    const started = Date.now();
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => /^Generate \d+ videos$/.test(b.textContent?.trim() ?? ''))?.click();
    });
    // Wait for the whole run to finish (results appear one by one).
    await page.waitForFunction(() => !document.body.textContent?.includes('Generating…') && (document.body.textContent?.includes('Your new videos') || document.body.textContent?.includes('enough material')), { timeout: 60000 });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const created = await page.$$eval('a[href^="#/project/"]', (as) => as.length);
    const notices = await page.$$eval('.bg-amber-50', (els) => els.map((e) => e.textContent?.trim()));
    await page.screenshot({ path: join(out, `ui-series-${i}.png`), fullPage: true });
    console.log(`${created >= 4 ? 'OK  ' : 'FAIL'} ${name}: ${created} videos in ${seconds}s${notices.length ? `  notices: ${notices.join(' | ')}` : ''}`);
    if (created < 4) failed = true;
  }

  // Open the last created project and check the source note.
  await page.click('a[href^="#/project/"]');
  await page.waitForFunction(() => document.body.textContent?.includes('Source:'), { timeout: 10000 });
  await page.screenshot({ path: join(out, 'ui-series-project.png') });
} finally {
  await browser.close();
}
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
process.exit(failed ? 1 : 0);
