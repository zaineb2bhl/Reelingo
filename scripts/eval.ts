/**
 * Evaluation harness: rule-based generators (A) vs the local LLM pipeline (B)
 * on the same documents, instructions and retrieved passages.
 *
 *   npm run eval                       # all docs, all OLLAMA.evalModels
 *   npm run eval -- --models=qwen2.5:3b --docs=en-office,fr-marche
 *   npm run eval -- --no-llm           # retrieval + rule-based only
 *
 * Writes eval/results.json and eval/ratings-template.csv (for teacher ratings).
 */
import nlp from 'compromise';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isGrounded } from '@/ai/checks';
import { defaultCountFor, parseInstructions } from '@/ai/instructions';
import { OllamaGenerator, type AttemptLog } from '@/ai/ollamaGenerator';
import { runGeneration } from '@/ai/pipeline';
import { prepareDocument } from '@/ai/prepare';
import { normaliseForMatch } from '@/ai/retrieval';
import { summarizeItem } from '@/ai/summary';
import type { GeneratedItem, RetrievedPassage } from '@/ai/types';
import { OLLAMA } from '@/config';
import { createLexicon } from '@/engine/lexicon';
import { parseTextBlocks } from '@/engine/reader';
import { detectLang } from '@/engine/text';
import { getFormat } from '@/formats/registry';

interface GroundTruth {
  docs: Array<{ file: string; queries: Array<{ instructions: string; formatId: string; relevant: string[] }>; reference: Array<{ question: string; answer: string }> }>;
}

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const models = args.includes('--no-llm') ? [] : (flag('models')?.split(',') ?? [...OLLAMA.evalModels]);
const docFilter = flag('docs')?.split(',');
const K = OLLAMA.generation.maxPassages;
const root = join(process.cwd(), 'eval');
const gt = JSON.parse(readFileSync(join(root, 'ground-truth.json'), 'utf8')) as GroundTruth;
const lexDir = join(process.cwd(), 'public', 'lexicon');
const lexicon = createLexicon({
  freq: readFileSync(join(lexDir, 'en-freq.txt'), 'utf8'),
  ipa: JSON.parse(readFileSync(join(lexDir, 'en-ipa.json'), 'utf8')) as Record<string, string>,
  defs: JSON.parse(readFileSync(join(lexDir, 'en-defs.json'), 'utf8')) as Record<string, Record<string, string>>,
});

/* ---------------- metrics helpers ---------------- */

const isRelevant = (passage: string, relevant: readonly string[]): boolean => {
  const p = normaliseForMatch(passage);
  return relevant.some((r) => {
    const n = normaliseForMatch(r);
    return p.includes(n) || n.includes(p);
  });
};

function retrievalMetrics(passages: readonly RetrievedPassage[], relevant: readonly string[]): { recall3: number; mrr: number } {
  const top = passages.slice(0, K);
  const found = new Set<string>();
  top.slice(0, 3).forEach((p) => relevant.forEach((r) => isRelevant(p.text, [r]) && found.add(r)));
  const firstRank = top.findIndex((p) => isRelevant(p.text, relevant));
  // Capped recall@3: a perfect top 3 scores 1 even when more than 3 sentences are relevant.
  return { recall3: found.size / Math.min(3, relevant.length), mrr: firstRank >= 0 ? 1 / (firstRank + 1) : 0 };
}

const POS_TAGS = ['Verb', 'Noun', 'Adjective', 'Adverb', 'Value', 'Preposition', 'Determiner', 'Pronoun'];
function posOf(text: string): string {
  const tags = (nlp(text).json({ terms: { normal: true } }) as Array<{ terms: Array<{ tags: string[] }> }>)[0]?.terms[0]?.tags ?? [];
  return POS_TAGS.find((t) => tags.includes(t)) ?? 'Other';
}

interface DistractorStats {
  distractors: number;
  posMatch: number;
  posChecked: number;
  duplicates: number;
}

function distractorStats(items: readonly GeneratedItem[], lang: string): DistractorStats {
  const s: DistractorStats = { distractors: 0, posMatch: 0, posChecked: 0, duplicates: 0 };
  for (const item of items) {
    if (item.formatId !== 'quiz') continue;
    const options = (item.data as { options: Array<{ text: string; correct: boolean }> }).options;
    const answer = options.find((o) => o.correct)?.text ?? '';
    for (const o of options.filter((x) => !x.correct)) {
      s.distractors++;
      if (normaliseForMatch(o.text) === normaliseForMatch(answer)) s.duplicates++;
      if (lang === 'en' && answer.split(/\s+/).length <= 2 && o.text.split(/\s+/).length <= 2) {
        s.posChecked++;
        if (posOf(o.text) === posOf(answer)) s.posMatch++;
      }
    }
  }
  return s;
}

/* ---------------- run ---------------- */

interface GenRow {
  generator: string;
  doc: string;
  lang: string;
  formatId: string;
  instructions: string;
  requested: number;
  delivered: number;
  schemaValid: number;
  returnedRaw: number;
  groundedFirst: number;
  groundedAfterRetry: number;
  fallback: number;
  ms: number;
  unavailable: boolean;
  distractors: DistractorStats;
  items: Array<{ origin: string; summary: string; supportingSentence: string; fallbackReason?: string; data: unknown }>;
}

interface RetrievalRow {
  doc: string;
  lang: string;
  instructions: string;
  recall3: number;
  mrr: number;
  retrieved: string[];
}

async function unload(model: string): Promise<void> {
  await fetch(`${OLLAMA.baseUrl}/api/generate`, { method: 'POST', body: JSON.stringify({ model, keep_alive: 0 }) }).catch(() => undefined);
}

async function warmUp(model: string): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA.baseUrl}/api/generate`, { method: 'POST', body: JSON.stringify({ model, prompt: 'Say OK.', stream: false, options: { num_predict: 2 } }) });
    return res.ok;
  } catch {
    return false;
  }
}

const retrievalRows: RetrievalRow[] = [];
const genRows: GenRow[] = [];
const cases = gt.docs
  .filter((d) => !docFilter || docFilter.some((f) => d.file.startsWith(f)))
  .flatMap((d) => {
    const text = readFileSync(join(root, 'docs', d.file), 'utf8');
    const doc = { name: d.file, blocks: parseTextBlocks(text, true) };
    return d.queries.map((q) => ({ file: d.file, doc, text, q, lang: detectLang(text) }));
  });

console.log(`Evaluating ${cases.length} instruction sets on ${new Set(cases.map((c) => c.file)).size} documents; models: ${models.join(', ') || '(none)'}\n`);

const prepared = cases.map((c) => {
  const { count, topic } = parseInstructions(c.q.instructions, defaultCountFor(c.q.formatId));
  const started = performance.now();
  const p = prepareDocument(c.doc, { formatId: c.q.formatId, count, topic }, c.lang === 'en' ? lexicon : null);
  const ms = performance.now() - started;
  const r = retrievalMetrics(p.passages, c.q.relevant);
  retrievalRows.push({ doc: c.file, lang: c.lang, instructions: c.q.instructions, ...r, retrieved: p.passages.slice(0, K).map((x) => x.text) });

  // A: rule-based generators on the same document.
  const items = p.ruleItems.slice(0, count);
  const format = getFormat(c.q.formatId);
  const sent = p.passages.slice(0, K);
  const grounded = items.filter((i) => isGrounded(i.supportingSentence, sent)).length;
  genRows.push({
    generator: 'rule-based',
    doc: c.file,
    lang: c.lang,
    formatId: c.q.formatId,
    instructions: c.q.instructions,
    requested: count,
    delivered: items.length,
    schemaValid: items.filter((i) => format?.schema.safeParse(i.data).success).length,
    returnedRaw: items.length,
    groundedFirst: grounded,
    groundedAfterRetry: grounded,
    fallback: 0,
    ms,
    unavailable: false,
    distractors: distractorStats(items, c.lang),
    items: items.map((i) => ({ origin: i.origin, summary: summarizeItem(i.formatId, i.data), supportingSentence: i.supportingSentence, data: i.data })),
  });
  return { ...c, prepared: p, count, topic };
});

for (const model of models) {
  process.stdout.write(`${model}: warming up… `);
  const available = await warmUp(model);
  console.log(available ? 'ready' : 'UNAVAILABLE');
  for (const c of prepared) {
    const logs: AttemptLog[] = [];
    const primary = available ? new OllamaGenerator({ model, ipa: (w) => c.prepared.ipa[w], onAttempt: (l) => logs.push(l) }) : null;
    const started = performance.now();
    const result = await runGeneration({ prepared: c.prepared, formatId: c.q.formatId, count: c.count, instructions: c.q.instructions, topic: c.topic, level: 'B1', primary });
    const ms = performance.now() - started;
    const llm = result.items.filter((i) => i.origin === 'llm');
    genRows.push({
      generator: model,
      doc: c.file,
      lang: c.lang,
      formatId: c.q.formatId,
      instructions: c.q.instructions,
      requested: c.count,
      delivered: result.items.length,
      schemaValid: logs.reduce((n, l) => n + l.valid, 0),
      returnedRaw: logs.reduce((n, l) => n + l.returned, 0),
      groundedFirst: llm.filter((i) => i.attempts === 1).length,
      groundedAfterRetry: llm.length,
      fallback: result.items.filter((i) => i.origin === 'rules').length,
      ms,
      unavailable: !available || result.primaryError === 'not-running' || result.primaryError === 'model-missing',
      distractors: distractorStats(llm, c.lang),
      items: result.items.map((i) => ({ origin: i.origin, summary: summarizeItem(i.formatId, i.data), supportingSentence: i.supportingSentence, fallbackReason: i.fallbackReason, data: i.data })),
    });
    console.log(`  ${c.file.padEnd(18)} ${c.q.formatId.padEnd(16)} llm ${llm.length}/${c.count}  fallback ${result.items.length - llm.length}  ${(ms / 1000).toFixed(1)}s`);
  }
  await unload(model);
}

/* ---------------- report ---------------- */

const pct = (a: number, b: number): string => (b ? `${Math.round((100 * a) / b)}%` : '—');
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const retrievalSummary = (['all', 'en', 'fr', 'ar'] as const).map((lang) => {
  const rows = retrievalRows.filter((r) => lang === 'all' || r.lang === lang);
  return { lang, queries: rows.length, recall3: mean(rows.map((r) => r.recall3)), mrr: mean(rows.map((r) => r.mrr)) };
});

const generators = ['rule-based', ...models];
const genSummary = generators.map((g) => {
  const rows = genRows.filter((r) => r.generator === g);
  const sum = (f: (r: GenRow) => number): number => rows.reduce((n, r) => n + f(r), 0);
  const d = rows.reduce((acc, r) => ({ distractors: acc.distractors + r.distractors.distractors, posMatch: acc.posMatch + r.distractors.posMatch, posChecked: acc.posChecked + r.distractors.posChecked, duplicates: acc.duplicates + r.distractors.duplicates }), { distractors: 0, posMatch: 0, posChecked: 0, duplicates: 0 });
  const byLang = Object.fromEntries(['en', 'fr', 'ar'].map((lang) => {
    const lr = rows.filter((r) => r.lang === lang);
    return [lang, { requested: lr.reduce((n, r) => n + r.requested, 0), grounded: lr.reduce((n, r) => n + r.groundedAfterRetry, 0) }];
  }));
  return {
    generator: g,
    unavailable: rows.length > 0 && rows.every((r) => r.unavailable),
    requested: sum((r) => r.requested),
    delivered: sum((r) => r.delivered),
    schemaValid: sum((r) => r.schemaValid),
    returnedRaw: sum((r) => r.returnedRaw),
    groundedFirst: sum((r) => r.groundedFirst),
    groundedAfterRetry: sum((r) => r.groundedAfterRetry),
    fallback: sum((r) => r.fallback),
    secondsPerItem: sum((r) => r.ms) / 1000 / Math.max(1, sum((r) => r.requested)),
    distractors: d,
    byLang,
  };
});

console.log('\nRetrieval (BM25 + heading match, top-%d passages)', K);
console.log('| Language | Queries | Recall@3 | MRR |\n| --- | ---: | ---: | ---: |');
for (const r of retrievalSummary) if (r.queries) console.log(`| ${r.lang} | ${r.queries} | ${r.recall3.toFixed(2)} | ${r.mrr.toFixed(2)} |`);

console.log('\nGeneration');
console.log('| Generator | Items | Schema-valid | Grounded, 1st try | Grounded after retry | Fallback | Distractor POS match (en) | Distractor ≠ answer | s / item |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const g of genSummary) {
  if (g.unavailable) {
    console.log(`| ${g.generator} | unavailable | | | | | | | |`);
    continue;
  }
  const rules = g.generator === 'rule-based';
  console.log(
    `| ${g.generator} | ${g.requested} | ${pct(g.schemaValid, g.returnedRaw)} | ${pct(g.groundedFirst, g.requested)} | ${rules ? '—' : pct(g.groundedAfterRetry, g.requested)} | ${rules ? '—' : pct(g.fallback, g.requested)} | ${pct(g.distractors.posMatch, g.distractors.posChecked)} | ${pct(g.distractors.distractors - g.distractors.duplicates, g.distractors.distractors)} | ${g.secondsPerItem.toFixed(1)} |`,
  );
}
console.log('\nGrounded after retry, by language');
console.log('| Generator | English | French | Arabic |\n| --- | ---: | ---: | ---: |');
for (const g of genSummary) {
  if (g.unavailable) continue;
  const l = g.byLang as Record<string, { requested: number; grounded: number }>;
  const cell = (k: string): string => pct(l[k]?.grounded ?? 0, l[k]?.requested ?? 0);
  console.log(`| ${g.generator} | ${cell('en')} | ${cell('fr')} | ${cell('ar')} |`);
}

const results = {
  generatedAt: new Date().toISOString(),
  config: { models, passagesPerRequest: K, batchSize: OLLAMA.generation.batchSize, temperature: OLLAMA.generation.temperature, retries: OLLAMA.generation.retries },
  notes: [
    'Rule-based "grounded" = its supporting sentence is among the passages retrieved for the instructions (it may use the wider document otherwise).',
    'LLM grounded = passed Zod validation, the exact-sentence grounding check and the per-format checks.',
    'Latency includes retries; models are warmed up first; CPU-only machine.',
  ],
  retrieval: { summary: retrievalSummary, rows: retrievalRows },
  generation: { summary: genSummary, rows: genRows },
};
writeFileSync(join(root, 'results.json'), JSON.stringify(results, null, 2));

// Teacher ratings template: one row per generated item.
const csvCell = (s: string): string => `"${s.replace(/"/g, '""')}"`;
const csv = [
  'doc,instructions,format,generator,origin,item,supporting_sentence,relevance_1to5,difficulty_1to5,notes',
  ...genRows.flatMap((r) => r.items.map((i) => [r.doc, r.instructions, r.formatId, r.generator, i.origin, i.summary, i.supportingSentence].map(csvCell).join(',') + ',,,')),
].join('\n');
writeFileSync(join(root, 'ratings-template.csv'), csv);
console.log('\nSaved eval/results.json and eval/ratings-template.csv');
