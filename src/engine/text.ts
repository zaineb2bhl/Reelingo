import stopwordsIso from 'stopwords-iso/stopwords-iso.json';
import type { Lang } from './types';

/* ------------------------------------------------------------------ */
/* Stopwords                                                           */
/* ------------------------------------------------------------------ */

// English uses a compact list of function words: word frequency (from the
// lexicon) already pushes everyday vocabulary down, and a big list would hide
// useful learner words such as "work" or "year".
const EN_STOP = new Set(
  `a about above after again against all also am an and any are aren't as at be because been before being below between both
  but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each either else even ever every few
  for from further get gets got had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself
  his how how's however i i'd i'll i'm i've if in into is isn't it it's its itself just let's may me might more most must mustn't my
  myself neither no nor not now of off often on once one only or other ought our ours ourselves out over own per quite rather really
  same shall shan't she she'd she'll she's should shouldn't so some still such than that that's the their theirs them themselves then
  there there's these they they'd they'll they're they've this those though through thus to too under until up upon us very via was
  wasn't we we'd we'll we're we've were weren't what what's when when's where where's whether which while who who's whom whose why
  why's will with without won't would wouldn't yet you you'd you'll you're you've your yours yourself yourselves etc eg ie vs`
    .split(/\s+/)
    .filter(Boolean),
);

const isoStop = stopwordsIso as Record<string, string[]>;
let stopwords: Record<Lang, Set<string>> | null = null;

export function isStopword(norm: string, lang: Lang): boolean {
  stopwords ??= {
    en: EN_STOP,
    fr: new Set((isoStop.fr ?? []).map((w) => normalise(w))),
    ar: new Set((isoStop.ar ?? []).map((w) => normalise(w))),
  };
  return stopwords[lang].has(norm);
}

/* ------------------------------------------------------------------ */
/* Normalisation and tokens                                            */
/* ------------------------------------------------------------------ */

const ARABIC_MARKS = new RegExp('[' + '\u064B-\u065F\u0670\u0640' + ']', 'g'); // harakat, dagger alif, tatweel

export function normalise(word: string): string {
  return word.toLocaleLowerCase().replace(/[’`]/g, "'").replace(ARABIC_MARKS, '');
}

/** Removes Latin accents ("été" -> "ete") without touching other scripts. */
export function foldAccents(s: string): string {
  return s.normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC');
}

export interface Token {
  text: string;
  norm: string;
  start: number;
  end: number;
}

const TOKEN_RE = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu;

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    out.push({ text: m[0], norm: normalise(m[0]), start, end: start + m[0].length });
  }
  return out;
}

export const isWordToken = (norm: string): boolean => /^[\p{L}][\p{L}\p{M}'-]*$/u.test(norm);

/* ------------------------------------------------------------------ */
/* Language                                                            */
/* ------------------------------------------------------------------ */

const FR_HINTS = new Set(['le', 'la', 'les', 'des', 'est', 'une', 'un', 'et', 'pour', 'avec', 'dans', 'que', 'qui', 'ne', 'pas', 'sur', 'au', 'du', 'ce', 'il', 'elle', 'nous', 'vous', 'sont', 'mais']);
const EN_HINTS = new Set(['the', 'and', 'is', 'are', 'of', 'to', 'in', 'that', 'it', 'for', 'with', 'on', 'was', 'you', 'this', 'be', 'have', 'they', 'not', 'what']);

export function detectLang(text: string): Lang {
  const sample = text.slice(0, 20000);
  const arabic = (sample.match(/\p{Script=Arabic}/gu) ?? []).length;
  const latin = (sample.match(/\p{Script=Latin}/gu) ?? []).length;
  if (arabic > latin * 0.5) return 'ar';
  let fr = 0;
  let en = 0;
  for (const t of tokenize(sample)) {
    if (FR_HINTS.has(t.norm)) fr++;
    if (EN_HINTS.has(t.norm)) en++;
  }
  fr += (sample.match(/[éèêàçùûôîœ]/g) ?? []).length * 0.2;
  return fr > en ? 'fr' : 'en';
}

/* ------------------------------------------------------------------ */
/* Sentences                                                           */
/* ------------------------------------------------------------------ */

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'vs', 'etc', 'e.g', 'i.e', 'no', 'p', 'pp', 'fig', 'm', 'mme', 'mlle', 'ex', 'cf', 'approx', 'jr', 'sr', 'inc', 'ltd', 'co', 'av', 'env']);

/** Splits running text into sentences (punctuation-based, abbreviation aware). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  const re = /[.!?؟…]+["'”’»)\]]*(?=\s|$)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    const before = text.slice(start, m.index);
    const lastWord = (/(\S+)$/.exec(before)?.[1] ?? '').toLowerCase().replace(/^[("“«]+/, '');
    if (m[0].startsWith('.') && (ABBREVIATIONS.has(lastWord) || /^\p{L}$/u.test(lastWord))) continue;
    const rest = text.slice(end).trimStart();
    // A lowercase Latin letter after the stop means the sentence goes on ("approx. ten").
    if (rest && /^\p{Ll}/u.test(rest) && /\p{Script=Latin}/u.test(rest[0] ?? '')) continue;
    const sentence = text.slice(start, end).trim();
    if (sentence) out.push(sentence);
    start = end;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/* ------------------------------------------------------------------ */
/* Stemming (light, for matching inflected forms)                      */
/* ------------------------------------------------------------------ */

function undouble(w: string): string {
  return /([^aeiou])\1$/.test(w) && !/(ll|ss|zz)$/.test(w) ? w.slice(0, -1) : w;
}

function stemEn(word: string): string {
  let w = word.replace(/'s$/, '');
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ied') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(sh|ch|x|z|ss)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.endsWith('ing') && w.length > 5) w = undouble(w.slice(0, -3));
  else if (w.endsWith('ed') && w.length > 3) w = undouble(w.slice(0, -2));
  if (w.endsWith('e') && w.length > 3) w = w.slice(0, -1);
  return w;
}

function stemFr(word: string): string {
  let w = foldAccents(word).replace(/^(l|d|j|m|n|s|t|c|qu)'/, '');
  if (w.length > 4 && /[sx]$/.test(w)) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

function stemAr(word: string): string {
  let w = word.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  for (const prefix of ['وال', 'بال', 'كال', 'فال', 'لل', 'ال']) {
    if (w.startsWith(prefix) && w.length - prefix.length >= 3) {
      w = w.slice(prefix.length);
      break;
    }
  }
  if (w.length > 4 && /^[وف]/.test(w)) w = w.slice(1);
  for (const suffix of ['ات', 'ون', 'ين', 'ان', 'ها', 'هم']) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  return w;
}

export function stem(norm: string, lang: Lang): string {
  if (lang === 'fr') return stemFr(norm);
  if (lang === 'ar') return stemAr(norm);
  return stemEn(norm);
}

/* ------------------------------------------------------------------ */
/* Small string helpers                                                */
/* ------------------------------------------------------------------ */

export const wordCount = (s: string): number => tokenize(s).length;

/** Shortens text to `max` characters, preferring clause then word boundaries. */
export function shorten(text: string, max: number): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const clause = s.slice(0, max).match(/^(.{20,}?)[;,:–—(](?!.*[;,:–—(])/);
  if (clause?.[1] && clause[1].length >= max * 0.5) return clause[1].trim();
  return `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

export const capitalise = (s: string): string => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);
export const lowerFirst = (s: string): string => (s && !/^\p{Lu}{2}/u.test(s) ? s.charAt(0).toLocaleLowerCase() + s.slice(1) : s);
export const ensureStop = (s: string): string => (/[.!?؟…»”")]$/u.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Regex matching `phrase` as whole words in any script. */
export function wholeWord(phrase: string, flags = 'iu'): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{M}\\p{N}])`, flags);
}
