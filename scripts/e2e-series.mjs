/**
 * End-to-end check of "Turn a document into a series" in a real Chrome,
 * WITHOUT spending API credit: requests to api.anthropic.com are intercepted
 * and answered with sample videos. Needs the dev server running.
 *
 *   node scripts/e2e-series.mjs <document.docx|.pdf|.txt> [outDir=.]
 */
import { existsSync } from 'node:fs';
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
const [docPath, out = '.'] = process.argv.slice(2);
if (!docPath) throw new Error('Usage: node scripts/e2e-series.mjs <document> [outDir]');

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const browser = await puppeteer.launch({ executablePath, headless: true });
const errors = [];
const requests = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle0' });
  // Fresh state with a dummy key so the Generate button is enabled.
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('reelingo.settings', JSON.stringify({ state: { locale: 'en', apiKey: 'sk-ant-test', aiModel: 'claude-opus-5-5' }, version: 1 }));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  const defaults = await page.evaluate(async () => {
    const { visibleFormats } = await import('/src/formats/registry.ts');
    return Object.fromEntries(visibleFormats.map((f) => [f.title.en, f.defaults]));
  });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (!req.url().startsWith('https://api.anthropic.com/')) return void req.continue();
    if (req.method() === 'OPTIONS') return void req.respond({ status: 204, headers: CORS });
    const body = JSON.parse(req.postData() ?? '{}');
    const text = body.messages?.[0]?.content?.find((b) => b.type === 'text')?.text ?? '';
    const docBlock = body.messages?.[0]?.content?.find((b) => b.type === 'document');
    const title = Object.keys(defaults).find((t) => text.includes(`"${t}" format`));
    const count = Number(/Create (\d+) video/.exec(text)?.[1] ?? 1);
    requests.push({ title, count, hasDocument: !!docBlock, docSource: docBlock?.source?.type, cached: !!docBlock?.cache_control, docText: docBlock?.source?.data?.slice?.(0, 60) });
    const videos = Array.from({ length: count }, (_, i) => ({ source: `Section ${i + 1}`, content: defaults[title] }));
    req.respond({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json', 'request-id': 'req_test' },
      body: JSON.stringify({
        id: `msg_${requests.length}`,
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text: JSON.stringify({ videos }) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    });
  });

  await page.goto(`${BASE}/#/series`, { waitUntil: 'networkidle0' });
  const input = await page.$('input[type=file]');
  await input.uploadFile(docPath);
  const name = docPath.split(/[\\/]/).pop();
  await page.waitForFunction((n) => document.body.textContent?.includes(n), { timeout: 15000 }, name);
  await page.screenshot({ path: join(out, 'ui-series-form.png'), fullPage: true });

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /^Generate \d+ videos$/.test(b.textContent?.trim() ?? ''));
    btn?.click();
  });
  await page.waitForFunction(() => document.body.textContent?.includes('Your new videos') && !document.body.textContent?.includes('Generating…'), { timeout: 60000 });
  await page.screenshot({ path: join(out, 'ui-series-results.png'), fullPage: true });

  const created = await page.$$eval('a[href^="#/project/"]', (as) => as.length);
  console.log('requests:', JSON.stringify(requests, null, 1));
  console.log('projects created:', created);
  if (created !== 5) errors.push(`expected 5 projects, got ${created}`);
  if (!requests.every((r) => r.hasDocument && r.cached)) errors.push('document block missing or not cached');

  // Open one and check the source note is shown in the editor.
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
console.log('series flow OK');
