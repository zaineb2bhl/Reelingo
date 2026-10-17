/**
 * Aggregates teacher ratings from one or more filled copies of
 * eval/ratings-template.csv (relevance and difficulty, 1-5).
 *
 *   npm run eval:ratings -- eval/ratings-anna.csv eval/ratings-karim.csv
 */
import { readFileSync } from 'node:fs';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const files = process.argv.slice(2);
if (!files.length) files.push('eval/ratings-template.csv');

interface Bucket {
  relevance: number[];
  difficulty: number[];
}
const buckets = new Map<string, Bucket>();
let rated = 0;

for (const file of files) {
  const [header, ...rows] = parseCsv(readFileSync(file, 'utf8'));
  if (!header) continue;
  const col = (name: string): number => header.indexOf(name);
  for (const r of rows) {
    const relevance = Number(r[col('relevance_1to5')]);
    const difficulty = Number(r[col('difficulty_1to5')]);
    if (!(relevance >= 1 && relevance <= 5) && !(difficulty >= 1 && difficulty <= 5)) continue;
    rated++;
    for (const key of [`${r[col('generator')]} · all`, `${r[col('generator')]} · ${r[col('format')]}`]) {
      const b = buckets.get(key) ?? { relevance: [], difficulty: [] };
      if (relevance >= 1 && relevance <= 5) b.relevance.push(relevance);
      if (difficulty >= 1 && difficulty <= 5) b.difficulty.push(difficulty);
      buckets.set(key, b);
    }
  }
}

if (!rated) {
  console.log('No ratings found yet. Fill relevance_1to5 / difficulty_1to5 in a copy of eval/ratings-template.csv, then run this again.');
  process.exit(0);
}
const avg = (xs: number[]): string => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '—');
console.log(`${rated} rated items from ${files.length} file(s)\n`);
console.log('| Generator · format | n | Relevance (1-5) | Difficulty (1-5) |\n| --- | ---: | ---: | ---: |');
for (const [key, b] of [...buckets.entries()].sort()) console.log(`| ${key} | ${Math.max(b.relevance.length, b.difficulty.length)} | ${avg(b.relevance)} | ${avg(b.difficulty)} |`);
