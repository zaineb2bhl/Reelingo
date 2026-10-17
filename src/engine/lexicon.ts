import type { Pos } from './types';

type WordNetPos = 'n' | 'v' | 'a' | 'r';
export type Definitions = Partial<Record<WordNetPos, string>>;

/** English reference data: word frequency, pronunciation and dictionary definitions. */
export interface Lexicon {
  /** 1 = most frequent word in everyday English; undefined = not in the top 60k. */
  rank(word: string): number | undefined;
  ipa(word: string): string | undefined;
  define(lemma: string): Definitions | undefined;
}

export interface LexiconData {
  freq: string;
  ipa: Record<string, string>;
  defs: Record<string, Definitions>;
}

export function createLexicon(data: LexiconData): Lexicon {
  const ranks = new Map<string, number>();
  data.freq.split('\n').forEach((w, i) => {
    if (w && !ranks.has(w)) ranks.set(w, i + 1);
  });
  return {
    rank: (word) => ranks.get(word.toLowerCase()),
    ipa: (word) => data.ipa[word.toLowerCase()],
    define: (lemma) => data.defs[lemma.toLowerCase()],
  };
}

/** Loads the files produced by scripts/build-lexicon.mjs. */
export async function loadLexicon(baseUrl: string): Promise<Lexicon> {
  const get = async (file: string): Promise<Response> => {
    const res = await fetch(new URL(file, baseUrl));
    if (!res.ok) throw new Error(`Could not load ${file} (${res.status})`);
    return res;
  };
  const [freq, ipa, defs] = await Promise.all([
    get('en-freq.txt').then((r) => r.text()),
    get('en-ipa.json').then((r) => r.json() as Promise<Record<string, string>>),
    get('en-defs.json').then((r) => r.json() as Promise<Record<string, Definitions>>),
  ]);
  return createLexicon({ freq, ipa, defs });
}

const WN_POS: Record<Exclude<Pos, 'phrasal'>, WordNetPos> = { noun: 'n', verb: 'v', adjective: 'a', adverb: 'r' };
const POS_FROM_WN: Record<WordNetPos, Pos> = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' };

/** Picks the dictionary sense matching the part of speech seen in the document. */
export function pickDefinition(defs: Definitions | undefined, pos: Pos | undefined): { gloss: string; pos: Pos } | undefined {
  if (!defs) return undefined;
  const wanted: WordNetPos | undefined = pos === 'phrasal' ? 'v' : pos ? WN_POS[pos] : undefined;
  if (wanted && defs[wanted]) return { gloss: defs[wanted], pos: pos === 'phrasal' ? 'phrasal' : POS_FROM_WN[wanted] };
  const first = (Object.keys(defs) as WordNetPos[])[0];
  return first && defs[first] ? { gloss: defs[first], pos: POS_FROM_WN[first] } : undefined;
}
