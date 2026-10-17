/**
 * End-to-end test of the document path in a real Chrome, with Ollama MOCKED
 * (requests to the Ollama URL are intercepted). Needs the dev server running.
 *
 *   node scripts/e2e-document.mjs [outDir=.]
 *
 * Scenario "llm":      the mock answers with content grounded in the passages it
 *                      was sent → the form fills from the model → MP4 export.
 * Scenario "fallback": the mock cites an invented sentence twice → the grounding
 *                      check rejects it → rule-based fallback with a note → MP4 export.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.REELINGO_URL ?? 'http://localhost:5173';
const OLLAMA = 'http://localhost:11434';
const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('No Chrome found; set CHROME_PATH');
const out = process.argv[2] ?? '.';

const lessonPath = join(out, 'e2e-lesson.md');
writeFileSync(
  lessonPath,
  `# Unit 4: Travelling by train

We usually buy a ticket at the station before the journey. The train leaves from platform three at nine o'clock.
Passengers wait on the platform with their luggage. Yesterday there was a long delay because of the snow.
The conductor checked every ticket and helped an old man with his luggage. Trains are often faster than cars.
`,
);

const CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
const TAGS = { models: [{ name: 'qwen2.5:3b', details: { family: 'qwen2', parameter_size: '3.1B' } }, { name: 'nomic-embed-text:latest', details: { family: 'nomic-bert' } }] };

/** A quiz grounded in the first usable passage of the prompt (what a good model would do). */
function groundedQuiz(prompt, count) {
  const passages = [...prompt.matchAll(/^\[(\d+)\] (.+)$/gm)].map((m) => m[2]);
  const words = [...new Set(passages.flatMap((p) => p.match(/\b[a-z]{6,}\b/g) ?? []))];
  const items = [];
  for (const sentence of passages) {
    if (items.length >= count) break;
    const answer = (sentence.match(/\b[a-z]{6,}\b/g) ?? []).find((w) => !items.some((i) => i.content.options[0].text === w));
    if (!answer) continue;
    const wrong = words.filter((w) => w !== answer && !sentence.includes(w)).slice(0, 2);
    if (wrong.length < 2) continue;
    items.push({
      supporting_sentence: sentence,
      content: {
        question: sentence.replace(answer, '_____'),
        options: [{ text: answer, correct: true }, ...wrong.map((w) => ({ text: w, correct: false }))],
        explanation: `The text says: ${sentence}`,
      },
    });
  }
  return { items };
}

const inventedQuiz = () => ({
  items: [
    {
      supporting_sentence: 'Trains in this country never leave on time because of the weather.',
      content: { question: 'Trains never leave on _____.', options: [{ text: 'time', correct: true }, { text: 'tracks', correct: false }, { text: 'Sundays', correct: false }], explanation: 'Invented.' },
    },
  ],
});

async function scenario(browser, name) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  const errors = [];
  const calls = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith(OLLAMA)) {
      if (!url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('blob:')) errors.push(`unexpected network request: ${url}`);
      return void req.continue();
    }
    if (url.endsWith('/api/tags')) return void req.respond({ status: 200, headers: CORS, body: JSON.stringify(TAGS) });
    if (url.endsWith('/api/chat')) {
      const body = JSON.parse(req.postData() ?? '{}');
      calls.push(body);
      const prompt = body.messages.map((m) => m.content).join('\n');
      const count = body.format?.properties?.items?.maxItems ?? 1;
      const answer = name === 'llm' ? groundedQuiz(prompt.split('Passages:').pop(), count) : inventedQuiz();
      return void req.respond({ status: 200, headers: CORS, body: JSON.stringify({ message: { role: 'assistant', content: JSON.stringify(answer) }, eval_count: 120 }) });
    }
    return void req.respond({ status: 404, headers: CORS, body: '{}' });
  });

  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/#/edit/quiz?doc`, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  const input = await page.$('input[type=file][accept*="pdf"]');
  await input.uploadFile(lessonPath);
  await page.waitForFunction(() => document.body.innerText.includes('e2e-lesson.md'), { timeout: 15000 });
  await page.type('textarea[placeholder*="quiz questions"]', '2 quiz questions about the train');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Generate from document')?.click());
  await page.waitForFunction(() => /\d+ results/.test(document.body.innerText) && document.body.innerText.includes('Save all as projects'), { timeout: 60000 });

  const panel = await page.evaluate(() => document.body.innerText.match(/\d+ results[\s\S]*?Save all as projects/)?.[0] ?? '');
  const formQuestion = await page.$$eval('textarea', (ts) => ts.map((t) => t.value)[1] ?? '');
  const fromModel = panel.includes('qwen2.5:3b');
  const fallbackNote = /rule-based engine instead of the local AI/.test(panel);

  // The filled form must produce a real video.
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Download MP4'))?.click());
  await page.waitForFunction(() => document.body.innerText.includes('Your video is ready'), { timeout: 120000 });
  const videoBytes = await page.evaluate(async () => (await (await fetch(document.querySelector('[role=dialog] video').src)).blob()).size);
  await page.screenshot({ path: join(out, `e2e-document-${name}.png`) });
  await page.close();

  const ok =
    errors.length === 0 &&
    videoBytes > 50_000 &&
    calls.length > 0 &&
    calls.every((c) => c.stream === false && c.format && c.options?.temperature <= 0.3) &&
    (name === 'llm' ? fromModel && !fallbackNote && formQuestion.includes('_____') : fallbackNote && !panel.includes('never leave on time'));
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${calls.length} model call(s), form filled ${fromModel ? 'by qwen2.5:3b' : 'by the rule-based fallback'}, video ${(videoBytes / 1024).toFixed(0)} KB`);
  if (errors.length) console.log(errors.join('\n'));
  return ok;
}

const browser = await puppeteer.launch({ executablePath, headless: true });
let ok = true;
try {
  ok = (await scenario(browser, 'llm')) && ok;
  ok = (await scenario(browser, 'fallback')) && ok;
} finally {
  await browser.close();
}
process.exit(ok ? 0 : 1);
