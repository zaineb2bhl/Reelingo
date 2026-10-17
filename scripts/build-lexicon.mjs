/**
 * Builds the English lexicon the content engine loads at runtime:
 *
 *   public/lexicon/en-freq.txt   one word per line, most frequent first (SUBTLEX-US)
 *   public/lexicon/en-ipa.json   { word: IPA }                (CMU Pronouncing Dictionary)
 *   public/lexicon/en-defs.json  { lemma: { n|v|a|r: gloss } } (Princeton WordNet 3.1)
 *
 * Runs automatically before dev / build / test (skipped when the files exist;
 * pass --force to rebuild). All sources are permissively licensed; see README.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'lexicon');
const outputs = ['en-freq.txt', 'en-ipa.json', 'en-defs.json'].map((f) => join(outDir, f));
if (!process.argv.includes('--force') && outputs.every((f) => existsSync(f))) process.exit(0);

const require = createRequire(import.meta.url);
const started = Date.now();
mkdirSync(outDir, { recursive: true });

/* ---------------- frequency ---------------- */
const FREQ_SIZE = 60000;
const subtlex = require('subtlex-word-frequencies/index.json');
const freq = [];
const seen = new Set();
for (const { word } of subtlex) {
  const w = word.toLowerCase();
  if (!/^[a-z][a-z'-]*$/.test(w) || seen.has(w)) continue;
  seen.add(w);
  freq.push(w);
  if (freq.length >= FREQ_SIZE) break;
}
const rank = new Map(freq.map((w, i) => [w, i + 1]));
writeFileSync(outputs[0], freq.join('\n'));

/* ---------------- WordNet ---------------- */
const wnDir = join(dirname(require.resolve('wordnet-db/package.json')), 'dict');
const POS = { noun: 'n', verb: 'v', adj: 'a', adv: 'r' };
const defs = new Map(); // lemma -> [{ pos, gloss, weight }]

const cleanGloss = (raw) => {
  // "definition; "example sentence"" -> "definition"
  let g = raw.split(/;\s*"/)[0].replace(/\s+/g, ' ').trim();
  g = g.replace(/^\(([^)]*)\)\s*/, ''); // drop leading usage notes like "(informal)"
  if (g.length > 140) g = `${g.slice(0, 137).replace(/\s+\S*$/, '')}…`;
  return g;
};

const keepLemma = (lemma) => {
  const parts = lemma.split('_');
  if (parts.length === 1) return rank.has(lemma);
  if (parts.length > 3) return false;
  return parts.every((p) => (rank.get(p) ?? Infinity) <= 20000);
};

for (const [file, pos] of Object.entries(POS)) {
  const data = readFileSync(join(wnDir, `data.${file}`), 'latin1');
  const index = readFileSync(join(wnDir, `index.${file}`), 'latin1');
  // Index synset lines by offset once; searching the 15 MB file per lemma is far too slow.
  const lines = new Map();
  for (const line of data.split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    lines.set(line.slice(0, line.indexOf(' ')), line);
  }
  const glossAt = (offset) => {
    const line = lines.get(offset) ?? '';
    const bar = line.indexOf('| ');
    return bar >= 0 ? cleanGloss(line.slice(bar + 2)) : '';
  };
  for (const line of index.split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const f = line.split(' ');
    const lemma = f[0];
    if (!keepLemma(lemma)) continue;
    const pCnt = Number(f[3]);
    const tagSense = Number(f[5 + pCnt]);
    const firstOffset = f[6 + pCnt];
    if (!firstOffset) continue;
    const gloss = glossAt(firstOffset);
    if (!gloss) continue;
    const key = lemma.replace(/_/g, ' ');
    const list = defs.get(key) ?? [];
    list.push({ pos, gloss, weight: tagSense });
    defs.set(key, list);
  }
}
const defsOut = {};
for (const [lemma, list] of defs) {
  // Most frequently used part of speech first.
  list.sort((a, b) => b.weight - a.weight);
  defsOut[lemma] = Object.fromEntries(list.map((d) => [d.pos, d.gloss]));
}
writeFileSync(outputs[2], JSON.stringify(defsOut));

/* ---------------- IPA ---------------- */
const { dictionary } = await import('cmu-pronouncing-dictionary');
const VOWELS = {
  AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ', EH: 'ɛ', ER: 'ɝ', EY: 'eɪ',
  IH: 'ɪ', IY: 'i', OW: 'oʊ', OY: 'ɔɪ', UH: 'ʊ', UW: 'u',
};
const CONSONANTS = {
  B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', F: 'f', G: 'ɡ', HH: 'h', JH: 'dʒ', K: 'k', L: 'l', M: 'm',
  N: 'n', NG: 'ŋ', P: 'p', R: 'r', S: 's', SH: 'ʃ', T: 't', TH: 'θ', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
};
const ONSETS = new Set(['pl', 'pr', 'bl', 'br', 'tr', 'dr', 'kl', 'kr', 'ɡl', 'ɡr', 'fl', 'fr', 'θr', 'ʃr', 'sp', 'st', 'sk', 'sm', 'sn', 'sl', 'sw', 'tw', 'kw', 'dw', 'spr', 'str', 'skr', 'spl', 'skw', 'pj', 'bj', 'kj', 'ɡj', 'fj', 'vj', 'mj', 'hj', 'spj', 'skj']);

export function arpabetToIpa(arpabet) {
  const phones = arpabet.trim().split(/\s+/).map((p) => {
    const m = /^([A-Z]+)([012])?$/.exec(p);
    if (!m) return null;
    const [, base, stress] = m;
    if (base in VOWELS) {
      let sym = VOWELS[base];
      if (stress === '0' && base === 'AH') sym = 'ə';
      if (stress === '0' && base === 'ER') sym = 'ɚ';
      return { sym, vowel: true, stress: stress ?? '0' };
    }
    return CONSONANTS[base] ? { sym: CONSONANTS[base], vowel: false } : null;
  });
  if (phones.some((p) => p === null)) return null;
  const syllables = phones.filter((p) => p.vowel).length;
  const out = phones.map((p) => p.sym);
  if (syllables > 1) {
    // Insert stress marks before each stressed syllable's onset (maximal legal onset).
    for (let i = phones.length - 1; i >= 0; i--) {
      const p = phones[i];
      if (!p.vowel || p.stress === '0') continue;
      let start = i;
      while (start > 0 && !phones[start - 1].vowel) start--;
      let onsetStart = i;
      for (let s = start; s < i; s++) {
        const cluster = phones.slice(s, i).map((q) => q.sym).join('');
        if (i - s === 1 || ONSETS.has(cluster)) {
          onsetStart = s;
          break;
        }
      }
      if (start === 0) onsetStart = 0;
      out.splice(onsetStart, 0, p.stress === '1' ? 'ˈ' : 'ˌ');
    }
  }
  return out.join('');
}

const ipaOut = {};
const wanted = new Set([...freq, ...[...defs.keys()].filter((k) => !k.includes(' '))]);
for (const w of wanted) {
  const pron = dictionary[w];
  if (!pron) continue;
  const ipa = arpabetToIpa(pron);
  if (ipa) ipaOut[w] = ipa;
}
writeFileSync(outputs[1], JSON.stringify(ipaOut));

const size = (f) => `${(readFileSync(f).length / 1024 / 1024).toFixed(2)} MB`;
console.log(
  `lexicon built in ${((Date.now() - started) / 1000).toFixed(1)}s: freq ${freq.length} (${size(outputs[0])}), ` +
    `ipa ${Object.keys(ipaOut).length} (${size(outputs[1])}), defs ${defs.size} (${size(outputs[2])})`,
);
