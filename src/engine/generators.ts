import nlp from 'compromise';
import { quizSchema, type QuizData, type QuizOption } from '@/formats/quiz/schema';
import { top5Schema, type Top5Data } from '@/formats/top5/schema';
import { trueFalseSchema, type TrueFalseData } from '@/formats/truefalse/schema';
import { wordOfDaySchema, type WordOfDayData } from '@/formats/wordofday/schema';
import type { Analysis, Occurrence, Passage, Term } from './analyze';
import type { ContentStrings } from './strings';
import { capitalise, ensureStop, lowerFirst, shorten, wholeWord, wordCount } from './text';

export interface GeneratedVideo {
  formatId: string;
  data: unknown;
  /** Where the content comes from, shown to the teacher (not in the video). */
  source: string;
}

export interface GenContext {
  a: Analysis;
  s: ContentStrings;
  /** Term keys already used as the main subject of a video in this series. */
  used: Set<string>;
  rand: () => number;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const GRAMMAR_TAGS = ['Plural', 'Singular', 'PastTense', 'PresentTense', 'Gerund', 'Infinitive', 'Participle', 'Comparative', 'Superlative'];
const signature = (tags: readonly string[]): string => GRAMMAR_TAGS.filter((t) => tags.includes(t)).join('|');

function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

function sourceNote(a: Analysis, passageId: number | undefined, extra?: string): string {
  const p = passageId === undefined ? undefined : a.passages[passageId];
  const parts: string[] = [];
  if (p?.page) parts.push(`p. ${p.page}`);
  const heading = p ? a.sections[p.section]?.heading : '';
  if (heading) parts.push(shorten(heading, 50));
  if (p) parts.push(`“${shorten(p.text, 110)}”`);
  if (extra) parts.push(extra);
  return parts.join(' · ');
}

const isGlossaryLine = (p: Passage): boolean => p.kind === 'row' || (p.kind === 'item' && /\s[–—=:]\s|\s-\s/.test(p.text));

/** Every place the term appears, in any inflected form ("carotte" finds "carottes"). */
function mentions(a: Analysis, term: Term): Occurrence[] {
  const out: Occurrence[] = [...term.occurrences];
  const n = term.stems.length;
  if (!n) return out;
  const known = new Set(out.map((o) => `${o.passage}|${o.surface.toLowerCase()}`));
  for (const p of a.passages) {
    for (let i = 0; i + n <= p.stems.length; i++) {
      let match = true;
      for (let k = 0; k < n && match; k++) match = p.stems[i + k] === term.stems[k];
      if (!match) continue;
      const first = p.tokens[i];
      const last = p.tokens[i + n - 1];
      if (!first || !last) continue;
      const surface = p.text.slice(first.start, last.end);
      const id = `${p.id}|${surface.toLowerCase()}`;
      if (known.has(id)) continue;
      known.add(id);
      const like = term.occurrences.find((o) => o.surface.toLowerCase() === surface.toLowerCase());
      out.push({ passage: p.id, surface, tags: like?.tags ?? [] });
    }
  }
  return out;
}

/** Natural sentences from the document that use the term, best first. */
function examplesFor(a: Analysis, term: Term, minWords = 5, maxWords = 30, maxChars = 220): Array<{ passage: Passage; occurrence: Occurrence }> {
  const seen = new Set<number>();
  const out: Array<{ passage: Passage; occurrence: Occurrence; quality: number }> = [];
  for (const occurrence of mentions(a, term)) {
    const passage = a.passages[occurrence.passage];
    if (!passage || seen.has(passage.id) || isGlossaryLine(passage)) continue;
    seen.add(passage.id);
    const words = wordCount(passage.text);
    if (words < minWords || words > maxWords || passage.text.length > maxChars) continue;
    if (!wholeWord(occurrence.surface).test(passage.text)) continue;
    if (/[?？؟]$/.test(passage.text.trim())) continue;
    const quality = -Math.abs(words - 13) + (a.focus.has(passage.id) ? 5 : 0) + (/[.!]$/.test(passage.text.trim()) ? 2 : 0);
    out.push({ passage, occurrence, quality });
  }
  return out.sort((x, y) => y.quality - x.quality);
}

/** English: conjugate a verb (or phrasal verb) like the answer ("follow up" -> "filled in" style). */
function inflectLike(answer: string, base: string): string {
  try {
    const a = nlp(answer);
    const first = (a.json({ terms: { normal: true } }) as unknown as Array<{ terms: Array<{ tags: string[] }> }>)[0]?.terms[0]?.tags ?? [];
    const b = nlp(base);
    if (first.includes('PastTense')) return b.verbs().toPastTense().text() || base;
    if (first.includes('Gerund')) return b.verbs().toGerund().text().replace(/^is\s+/, '') || base;
    if (first.includes('PresentTense') && /s$/i.test(answer.split(' ')[0] ?? '')) return b.verbs().toPresentTense().text() || base;
    return base;
  } catch {
    return base;
  }
}

/** Wrong answers that fit the same slot: same part of speech and, when known, the same grammatical form. */
function distractorsFor(a: Analysis, term: Term, occurrence: Occurrence, sentence: string, want: number, rand: () => number): string[] {
  const sig = signature(occurrence.tags);
  const lowerSurface = occurrence.surface.toLowerCase();
  const pool: Array<{ surface: string; rank: number }> = [];
  for (const other of a.terms.slice(0, 150)) {
    if (other.key === term.key || other.multiword !== term.multiword) continue;
    if (term.pos && other.pos && other.pos !== term.pos) continue;
    const candidates = mentions(a, other).filter((o) => o.surface.toLowerCase() !== lowerSurface);
    const plural = (w: string): boolean => a.lang === 'fr' && /[sx]$/i.test(w);
    const exact =
      a.lang === 'en' ? candidates.find((o) => signature(o.tags) === sig) : candidates.find((o) => plural(o.surface) === plural(occurrence.surface));
    const pick = exact ?? (a.lang === 'en' && term.pos ? undefined : a.lang === 'fr' ? undefined : candidates[0]);
    if (!pick) continue;
    const surface = pick.surface;
    if (wholeWord(surface).test(sentence) || surface.toLowerCase().includes(lowerSurface) || lowerSurface.includes(surface.toLowerCase())) continue;
    if (pool.some((p) => p.surface.toLowerCase() === surface.toLowerCase())) continue;
    pool.push({ surface, rank: pool.length + rand() * 3 });
  }
  let chosen = pool.sort((x, y) => x.rank - y.rank).slice(0, want).map((p) => p.surface);
  if (a.lang === 'en' && (term.pos === 'phrasal' || term.pos === 'verb')) {
    chosen = chosen.map((c) => inflectLike(occurrence.surface, c.toLowerCase())).filter((c) => c.toLowerCase() !== lowerSurface);
  }
  // Match capitalisation of the answer (e.g. at the start of a sentence).
  const capital = /^\p{Lu}/u.test(occurrence.surface);
  return chosen.map((c) => (capital ? capitalise(c) : /^\p{Lu}/u.test(c) && !/^\p{Lu}{2}/u.test(c) ? lowerFirst(c) : c));
}

const definitionText = (t: Term, max: number): string | undefined => (t.definition ? shorten(t.definition, max) : undefined);

function candidates(ctx: GenContext): Term[] {
  return ctx.a.terms.filter((t) => !ctx.used.has(t.key));
}

/* ------------------------------------------------------------------ */
/* Word of the day                                                     */
/* ------------------------------------------------------------------ */

export function generateWordOfDay(ctx: GenContext, count: number): GeneratedVideo[] {
  const { a, s } = ctx;
  const out: GeneratedVideo[] = [];
  const pool = candidates(ctx)
    .filter((t) => t.display.length <= 40 && (t.definition || a.lang !== 'en'))
    .sort((x, y) => Number(y.definitionSource === 'document') - Number(x.definitionSource === 'document') || y.score - x.score);

  for (const term of pool) {
    if (out.length >= count) break;
    const examples = examplesFor(a, term);
    const example = examples.find((e) => e.passage.id !== term.definitionPassage);
    // French / Arabic without a definition in the document: use the clearest sentence as context.
    const definition = term.definition ?? (examples[0] ? examples[0].passage.text : undefined);
    if (!definition) continue;
    const ipa =
      a.lang === 'en' && a.lexicon
        ? term.display
            .split(' ')
            .map((w) => a.lexicon?.ipa(w))
            .every(Boolean)
          ? term.display
              .split(' ')
              .map((w) => a.lexicon?.ipa(w) ?? '')
              .join(' ')
          : ''
        : '';
    const data: WordOfDayData = {
      label: s.wotdLabel,
      word: term.display,
      ipa,
      partOfSpeech: term.pos ? s.pos[term.pos] : '',
      definition: shorten(ensureStop(capitalise(definition)), 220),
      example: example && example.passage.text !== definition ? shorten(example.passage.text, 220) : '',
      translation: term.translation && term.translation.toLowerCase() !== term.display.toLowerCase() ? shorten(term.translation, 140) : '',
      highlight: true,
      pace: 'standard',
    };
    const parsed = wordOfDaySchema.safeParse(data);
    if (!parsed.success) continue;
    ctx.used.add(term.key);
    const where = term.definitionSource === 'document' ? term.definitionPassage : (example?.passage.id ?? term.occurrences[0]?.passage);
    out.push({ formatId: 'word-of-the-day', data: parsed.data, source: sourceNote(a, where, term.definitionSource === 'dictionary' ? 'definition: WordNet' : undefined) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Quiz: fill the gap / what does it mean                              */
/* ------------------------------------------------------------------ */

function gapQuiz(ctx: GenContext, term: Term): GeneratedVideo | null {
  const { a, s, rand } = ctx;
  for (const { passage, occurrence } of examplesFor(a, term, 6, 28, 170)) {
    const blankRe = wholeWord(occurrence.surface);
    const question = passage.text.replace(blankRe, '*_____*');
    if (question === passage.text || question.length > 160) continue;
    const wrong = distractorsFor(a, term, occurrence, passage.text, 3, rand);
    if (wrong.length < 2) continue;
    const options: QuizOption[] = shuffle([{ text: occurrence.surface, correct: true }, ...wrong.map((w) => ({ text: w, correct: false }))], rand).map((o) => ({ ...o, text: shorten(o.text, 80) }));
    const def = definitionText(term, 180);
    const data: QuizData = {
      label: s.gapLabel,
      question,
      options,
      pace: 'standard',
      explanation: shorten(def ? s.explainAnswer(term.display, ensureStop(lowerFirst(def))) : s.fromText(passage.text), 240),
    };
    const parsed = quizSchema.safeParse(data);
    if (parsed.success) return { formatId: 'quiz', data: parsed.data, source: sourceNote(a, passage.id) };
  }
  return null;
}

function meaningQuiz(ctx: GenContext, term: Term): GeneratedVideo | null {
  const { a, s, rand } = ctx;
  const answer = definitionText(term, 80);
  if (!answer || term.display.length > 40) return null;
  const usable = a.terms.filter((t) => t.key !== term.key && t.definition && (!term.pos || !t.pos || t.pos === term.pos));
  const texts = (list: Term[]): string[] =>
    list
      .slice(0, 40)
      .map((t) => shorten(t.definition ?? '', 80))
      .filter((d, i, all) => d && d.toLowerCase() !== answer.toLowerCase() && all.indexOf(d) === i);
  // Wrong answers from the same kind of source as the right one (document glossary vs dictionary).
  const same = shuffle(texts(usable.filter((t) => t.definitionSource === term.definitionSource)), rand);
  const rest = shuffle(texts(usable.filter((t) => t.definitionSource !== term.definitionSource)), rand);
  const wrong = [...same, ...rest.filter((d) => !same.includes(d))].slice(0, 3);
  if (wrong.length < 2) return null;
  const options: QuizOption[] = shuffle([{ text: capitalise(answer), correct: true }, ...wrong.map((w) => ({ text: capitalise(w), correct: false }))], rand);
  const example = examplesFor(a, term)[0];
  const data: QuizData = {
    label: s.meaningLabel,
    question: s.meaningQuestion(term.display),
    options,
    pace: 'standard',
    explanation: example ? shorten(s.fromText(example.passage.text), 240) : '',
  };
  const parsed = quizSchema.safeParse(data);
  if (!parsed.success) return null;
  return { formatId: 'quiz', data: parsed.data, source: sourceNote(a, term.definitionPassage ?? example?.passage.id, term.definitionSource === 'dictionary' ? 'definition: WordNet' : undefined) };
}

export function generateQuizzes(ctx: GenContext, count: number): GeneratedVideo[] {
  const out: GeneratedVideo[] = [];
  const pool = candidates(ctx);
  // Alternate the two quiz types for variety, falling back to whichever works.
  let preferGap = true;
  for (const term of pool) {
    if (out.length >= count) break;
    const video = preferGap ? (gapQuiz(ctx, term) ?? meaningQuiz(ctx, term)) : (meaningQuiz(ctx, term) ?? gapQuiz(ctx, term));
    if (!video) continue;
    ctx.used.add(term.key);
    out.push(video);
    preferGap = !preferGap;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* True or false                                                       */
/* ------------------------------------------------------------------ */

function negateEnglish(sentence: string): string | null {
  try {
    const doc = nlp(sentence);
    if (doc.has('#Negative') || !doc.has('#Verb')) return null;
    const negative = doc.sentences().toNegative().text().trim();
    return negative && negative !== sentence.trim() ? negative : null;
  } catch {
    return null;
  }
}

function trueFalseFor(ctx: GenContext, term: Term, wantTrue: boolean): GeneratedVideo | null {
  const { a, s, rand } = ctx;
  const base = { label: s.tfLabel, trueLabel: s.trueLabel, falseLabel: s.falseLabel, pace: 'standard' as const };
  const build = (statement: string, answer: boolean, explanation: string, passageId: number | undefined, extra?: string): GeneratedVideo | null => {
    const data: TrueFalseData = { ...base, statement: shorten(statement, 180), answer, explanation: shorten(explanation, 240) };
    const parsed = trueFalseSchema.safeParse(data);
    return parsed.success ? { formatId: 'true-false', data: parsed.data, source: sourceNote(a, passageId, extra) } : null;
  };

  // 1. A sentence from the document, as-is (true) or changed (false).
  for (const { passage, occurrence } of examplesFor(a, term, 6, 25, 180)) {
    const original = passage.text.trim();
    if (!/[.!]$/.test(original)) continue;
    if (wantTrue) return build(original, true, s.textSays(original), passage.id);
    const swap = distractorsFor(a, term, occurrence, original, 1, rand)[0];
    const negated = a.lang === 'en' ? negateEnglish(original) : null;
    const changed = rand() < 0.5 ? (negated ?? (swap ? original.replace(wholeWord(occurrence.surface), swap) : null)) : swap ? original.replace(wholeWord(occurrence.surface), swap) : negated;
    if (changed && changed !== original) return build(changed, false, s.textSays(original), passage.id);
  }

  // 2. The term's definition, matched correctly (true) or with another term's (false).
  const def = definitionText(term, 130);
  if (!def) return null;
  if (wantTrue) {
    const example = examplesFor(a, term)[0];
    return build(ensureStop(s.means(term.display, lowerFirst(def))), true, example ? s.fromText(example.passage.text) : '', term.definitionPassage ?? example?.passage.id);
  }
  const other = a.terms.find((t) => t.key !== term.key && t.definition && t.definition !== term.definition && (!term.pos || t.pos === term.pos));
  if (!other?.definition) return null;
  return build(ensureStop(s.means(term.display, lowerFirst(shorten(other.definition, 130)))), false, ensureStop(s.means(term.display, lowerFirst(def))), term.definitionPassage);
}

export function generateTrueFalse(ctx: GenContext, count: number): GeneratedVideo[] {
  const out: GeneratedVideo[] = [];
  let wantTrue = ctx.rand() < 0.5;
  for (const term of candidates(ctx)) {
    if (out.length >= count) break;
    const video = trueFalseFor(ctx, term, wantTrue) ?? trueFalseFor(ctx, term, !wantTrue);
    if (!video) continue;
    ctx.used.add(term.key);
    out.push(video);
    wantTrue = !wantTrue;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Top 5                                                               */
/* ------------------------------------------------------------------ */

export function generateTop5(ctx: GenContext, count: number): GeneratedVideo[] {
  const { a, s } = ctx;
  const groups: Array<{ heading: string; terms: Term[]; passage?: number }> = [];
  const bySection = new Map<number, Term[]>();
  for (const term of a.terms) {
    if (term.display.length > 60) continue;
    const sections = new Set(term.occurrences.map((o) => a.passages[o.passage]?.section ?? 0));
    for (const sec of sections) {
      const list = bySection.get(sec) ?? [];
      if (list.length < 12) list.push(term);
      bySection.set(sec, list);
    }
  }
  for (const [sec, terms] of bySection) {
    const heading = a.sections[sec]?.heading ?? '';
    if (heading && terms.length >= 3) groups.push({ heading, terms, passage: terms[0]?.occurrences[0]?.passage });
  }
  groups.sort((x, y) => y.terms.slice(0, 5).reduce((n, t) => n + t.score, 0) - x.terms.slice(0, 5).reduce((n, t) => n + t.score, 0));
  // Always offer a whole-document list too.
  if (a.terms.length >= 3) groups.push({ heading: '', terms: a.terms.slice(0, 12) });

  const out: GeneratedVideo[] = [];
  const usedLists = new Set<string>();
  for (const group of groups) {
    if (out.length >= count) break;
    // Prefer terms that come with a meaning, keep the ranking order.
    const ranked = [...group.terms].sort((x, y) => Number(!!(y.definition || y.translation)) - Number(!!(x.definition || x.translation)) || y.score - x.score);
    const picked = ranked.slice(0, 5).sort((x, y) => y.score - x.score);
    if (picked.length < 3) continue;
    const signatureKey = picked.map((t) => t.key).join('|');
    if (usedLists.has(signatureKey)) continue;
    usedLists.add(signatureKey);
    const phrasal = a.lang === 'en' && picked.every((t) => t.pos === 'phrasal');
    const topic = shorten(group.heading || s.thisLesson, 50);
    const data: Top5Data = {
      title: shorten((phrasal ? s.top5PhrasalTitle : s.top5Title)(picked.length, topic), 100),
      items: picked.map((t) => ({ text: shorten(t.display, 60), detail: t.definition ? shorten(t.definition, 90) : t.translation ? shorten(t.translation, 90) : '' })),
      pace: 'standard',
    };
    const parsed = top5Schema.safeParse(data);
    if (!parsed.success) continue;
    out.push({ formatId: 'top5', data: parsed.data, source: sourceNote(a, group.passage, group.heading ? undefined : a.name) });
  }
  return out;
}
