/**
 * Clicks through the main flows in a real Chrome and saves screenshots.
 * Needs the dev server running (npm run dev).
 *
 *   node scripts/e2e-ui.mjs [outDir=.]
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
const out = process.argv[2] ?? '.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath, headless: true });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  await page.setViewport({ width: 1440, height: 900 });

  const shot = async (name) => {
    await page.screenshot({ path: join(out, `ui-${name}.png`) });
    console.log('saved', name);
  };
  const clickText = async (text) => {
    const ok = await page.evaluate((t) => {
      const el = [...document.querySelectorAll('button, a')].find((e) => e.textContent?.trim() === t);
      if (el instanceof HTMLElement) el.click();
      return !!el;
    }, text);
    if (!ok) throw new Error(`No button/link "${text}"`);
  };

  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1500);
  await shot('home');

  for (const id of ['quiz', 'top5', 'true-false', 'word-of-the-day']) {
    await page.goto(`${BASE}/#/edit/${id}`, { waitUntil: 'networkidle0' });
    await sleep(id === 'top5' ? 6000 : 3500);
    await shot(`editor-${id}`);
  }

  // Branding + export on the quiz
  await page.goto(`${BASE}/#/edit/quiz`, { waitUntil: 'networkidle0' });
  await page.type('input[placeholder="@yourhandle"]', '@miss.lingo');
  await sleep(500);
  await clickText('Download MP4');
  await page.waitForFunction(() => document.body.textContent?.includes('Your video is ready'), { timeout: 120000 });
  await sleep(500);
  await shot('export-done');
  await clickText('Render again').catch(() => undefined);
  await page.keyboard.press('Escape');

  // Save project, then see it on the home screen
  await page.goto(`${BASE}/#/edit/quiz`, { waitUntil: 'networkidle0' });
  await clickText('Save');
  await page.waitForFunction(() => document.body.textContent?.includes('Saved'), { timeout: 10000 });
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle0' });
  await sleep(1200);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(400);
  await shot('home-projects');

  // Audio panel
  await page.goto(`${BASE}/#/edit/word-of-the-day`, { waitUntil: 'networkidle0' });
  await clickText('Music');
  await sleep(300);
  await shot('audio-panel');

  // Uploads: generated WAV as music, SVG logo; then export with effects off and check the music is in the file.
  const wavPath = join(out, 'e2e-tone.wav');
  writeFileSync(wavPath, makeWav(3, 440));
  const svgPath = join(out, 'e2e-logo.svg');
  writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="90" fill="#ff6a3d"/><text x="100" y="125" font-size="80" text-anchor="middle" fill="#fff" font-family="sans-serif">R</text></svg>');
  const musicInput = await page.$('footer input[type=file]');
  await musicInput.uploadFile(wavPath);
  await page.waitForFunction(() => document.body.textContent?.includes('e2e-tone.wav'), { timeout: 10000 });
  await page.click('footer button[aria-expanded]');
  await page.click('footer [role=switch]');
  const logoInput = await page.$('aside input[type=file]');
  await logoInput.uploadFile(svgPath);
  await page.waitForFunction(() => document.body.textContent?.includes('e2e-logo.svg'), { timeout: 10000 });
  await sleep(2500);
  await shot('media-uploaded');
  await clickText('Download MP4');
  await page.waitForFunction(() => document.body.textContent?.includes('Your video is ready'), { timeout: 120000 });
  const peak = await page.evaluate(async () => {
    const video = document.querySelector('[role=dialog] video');
    const buf = await (await fetch(video.src)).arrayBuffer();
    const decoded = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(buf);
    let p = 0;
    const ch = decoded.getChannelData(0);
    for (let i = 0; i < ch.length; i++) p = Math.max(p, Math.abs(ch[i]));
    return p;
  });
  console.log('music-only export peak', peak.toFixed(3));
  if (!(peak > 0.05)) errors.push(`music missing from export (peak ${peak})`);
  await page.keyboard.press('Escape');
  await page.click('footer [role=switch]');

  // Arabic UI
  await page.select('#locale', 'ar');
  await sleep(800);
  await shot('editor-ar');
  await page.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle0' });
  await sleep(300);
  await shot('settings-ar');
  await page.select('#locale', 'en');

  // Mobile
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle0' });
  await sleep(1200);
  await shot('mobile-home');
  await page.goto(`${BASE}/#/edit/true-false`, { waitUntil: 'networkidle0' });
  await sleep(500);
  await shot('mobile-edit');
  await clickText('Preview');
  await sleep(3000);
  await shot('mobile-preview');
} finally {
  await browser.close();
}
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('no console errors');

/** 16-bit mono PCM WAV with a sine tone. */
function makeWav(seconds, freq, rate = 44100) {
  const n = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 12000), 44 + i * 2);
  return buf;
}
