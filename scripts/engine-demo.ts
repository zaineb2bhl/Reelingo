/**
 * Dev helper: runs the content engine on a file (or the bundled sample
 * lessons) and prints the generated videos.
 *
 *   npx vite-node scripts/engine-demo.ts [file.md|file.txt] [instructions]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateSeries } from '@/engine/index';
import { createLexicon } from '@/engine/lexicon';
import { parseTextBlocks } from '@/engine/reader';
import { ARABIC_LESSON, ENGLISH_LESSON, FRENCH_LESSON } from '../tests/fixtures/lessons';

const dir = join(process.cwd(), 'public', 'lexicon');
const lexicon = createLexicon({
  freq: readFileSync(join(dir, 'en-freq.txt'), 'utf8'),
  ipa: JSON.parse(readFileSync(join(dir, 'en-ipa.json'), 'utf8')) as Record<string, string>,
  defs: JSON.parse(readFileSync(join(dir, 'en-defs.json'), 'utf8')) as Record<string, Record<string, string>>,
});

const [file, query = ''] = process.argv.slice(2);
const docs = file
  ? [{ name: file, text: readFileSync(file, 'utf8') }]
  : [
      { name: 'english.md', text: ENGLISH_LESSON },
      { name: 'french.md', text: FRENCH_LESSON },
      { name: 'arabic.md', text: ARABIC_LESSON },
    ];

for (const d of docs) {
  const doc = { name: d.name, blocks: parseTextBlocks(d.text, true) };
  const started = performance.now();
  const result = generateSeries(doc, { counts: { quiz: 3, top5: 1, 'true-false': 2, 'word-of-the-day': 2 }, query }, lexicon);
  console.log(`\n===== ${d.name} (${result.lang}) — ${result.videos.length} videos, ${result.termCount} terms, ${(performance.now() - started).toFixed(0)} ms`);
  if (result.shortfalls.length) console.log('shortfalls:', JSON.stringify(result.shortfalls));
  for (const v of result.videos) {
    console.log(`\n--- ${v.formatId}   [${v.source}]`);
    console.log(JSON.stringify(v.data, null, 1));
  }
}
