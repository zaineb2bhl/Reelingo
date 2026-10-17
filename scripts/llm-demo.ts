/**
 * Dev helper: runs the document path (BM25 retrieval → local LLM → checks →
 * rule-based fallback) in Node against a running Ollama.
 *
 *   npx vite-node scripts/llm-demo.ts [formatId=quiz] [model=qwen2.5:3b] [instructions] [file.md]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OllamaGenerator } from '@/ai/ollamaGenerator';
import { defaultCountFor, parseInstructions } from '@/ai/instructions';
import { runGeneration } from '@/ai/pipeline';
import { prepareDocument } from '@/ai/prepare';
import { OLLAMA } from '@/config';
import { createLexicon } from '@/engine/lexicon';
import { parseTextBlocks } from '@/engine/reader';
import { ENGLISH_LESSON } from '../tests/fixtures/lessons';

const [formatId = 'quiz', model = OLLAMA.defaultModel, instructions = '2 questions on the office', file] = process.argv.slice(2);
const dir = join(process.cwd(), 'public', 'lexicon');
const lexicon = createLexicon({
  freq: readFileSync(join(dir, 'en-freq.txt'), 'utf8'),
  ipa: JSON.parse(readFileSync(join(dir, 'en-ipa.json'), 'utf8')) as Record<string, string>,
  defs: JSON.parse(readFileSync(join(dir, 'en-defs.json'), 'utf8')) as Record<string, Record<string, string>>,
});
const text = file ? readFileSync(file, 'utf8') : ENGLISH_LESSON;
const { count, topic } = parseInstructions(instructions, defaultCountFor(formatId));
const prepared = prepareDocument({ name: file ?? 'english.md', blocks: parseTextBlocks(text, true) }, { formatId, count, topic }, lexicon);
console.log(`retrieved ${prepared.passages.length} passages for "${topic}" (${prepared.lang})`);
prepared.passages.slice(0, OLLAMA.generation.maxPassages).forEach((p, i) => console.log(`  [${i + 1}] ${p.text}`));

const started = performance.now();
const primary = new OllamaGenerator({
  model,
  ipa: (w) => prepared.ipa[w],
  onAttempt: (l) => console.log(`  attempt ${l.attempt}: requested ${l.requested}, returned ${l.returned}, valid ${l.valid}, grounded ${l.grounded}, accepted ${l.accepted} in ${(l.ms / 1000).toFixed(1)}s ${l.errors.length ? `| ${l.errors.join(' | ')}` : ''}`),
});
const result = await runGeneration({ prepared, formatId, count, instructions, topic, level: 'B1', primary });
console.log(`\n${result.items.length} items in ${((performance.now() - started) / 1000).toFixed(1)}s${result.primaryError ? ` (primary error: ${result.primaryError})` : ''}`);
for (const item of result.items) {
  console.log(`\n[${item.origin}${item.fallbackReason ? ` · ${item.fallbackReason}` : ''}] supporting: ${item.supportingSentence}`);
  console.log(JSON.stringify(item.data, null, 1));
}
