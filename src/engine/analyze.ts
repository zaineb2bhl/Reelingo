import nlp from 'compromise';
import { pickDefinition, type Lexicon } from './lexicon';
import { Bm25 } from './search';
import { detectLang, escapeRegExp, isStopword, isWordToken, normalise, splitSentences, stem, tokenize, wordCount, type Token } from './text';
import type { BlockKind, Lang, Pos, SourceDocument } from './types';

/**
 * Turns a document into something the generators can work with:
 *   1. passages (sentences / table rows) grouped into sections by headings,
 *   2. the focus: passages matching the teacher's instructions (BM25 + headings),
 *   3. a glossary found in the document (tables, "term – meaning" lines, "X means Y"),
 *   4. ranked key terms with part of speech, occurrences and definitions.
 */

export interface Passage {
  id: number;
  text: string;
  section: number;
  page?: number;
  kind: BlockKind;
  tokens: Token[];
  stems: string[];
}

export interface Section {
  index: number;
  heading: string;
  page?: number;
}

export interface Occurrence {
  passage: number;
  surface: string;
  /** Grammatical tags (English only), e.g. ["Verb", "PastTense"]. */
  tags: string[];
}

export interface GlossaryEntry {
  term: string;
  definition?: string;
  translation?: string;
  passage: number;
}

export interface Term {
  key: string;
  display: string;
  pos?: Pos;
  score: number;
  occurrences: Occurrence[];
  definition?: string;
  definitionSource?: 'document' | 'dictionary';
  /** Passage the document definition came from. */
  definitionPassage?: number;
  translation?: string;
  multiword: boolean;
  fromGlossary: boolean;
  /** Stems of the term's words (without article), for finding inflected mentions. */
  stems: string[];
}

export interface Analysis {
  name: string;
  lang: Lang;
  passages: Passage[];
  sections: Section[];
  glossary: GlossaryEntry[];
  terms: Term[];
  focus: Set<number>;
  matchedQuery: boolean;
  lexicon: Lexicon | null;
}

/* ------------------------------------------------------------------ */
/* Passages                                                            */
/* ------------------------------------------------------------------ */

interface BlockPassages {
  blockIndex: number;
  first: number;
}

function buildPassages(doc: SourceDocument, lang: Lang): { passages: Passage[]; sections: Section[]; blockStarts: BlockPassages[] } {
  const passages: Passage[] = [];
  const sections: Section[] = [{ index: 0, heading: '' }];
  const blockStarts: BlockPassages[] = [];
  doc.blocks.forEach((block, blockIndex) => {
    if (block.kind === 'heading') {
      sections.push({ index: sections.length, heading: block.text, page: block.page });
      return;
    }
    blockStarts.push({ blockIndex, first: passages.length });
    const texts = block.kind === 'row' ? [block.text] : splitSentences(block.text);
    for (const text of texts) {
      const tokens = tokenize(text);
      if (!tokens.length) continue;
      passages.push({
        id: passages.length,
        text,
        section: sections.length - 1,
        page: block.page,
        kind: block.kind,
        tokens,
        stems: tokens.map((t) => stem(t.norm, lang)),
      });
    }
  });
  return { passages, sections, blockStarts };
}

/* ------------------------------------------------------------------ */
/* Focus (retrieval)                                                   */
/* ------------------------------------------------------------------ */

function queryStems(query: string, lang: Lang): string[] {
  return tokenize(query)
    .filter((t) => /\d/.test(t.norm) || (!isStopword(t.norm, lang) && t.norm.length > 1))
    .map((t) => stem(t.norm, lang));
}

export function computeFocus(query: string, passages: readonly Passage[], sections: readonly Section[], lang: Lang): { focus: Set<number>; matched: boolean } {
  const all = new Set(passages.map((p) => p.id));
  const q = queryStems(query, lang);
  if (!q.length) return { focus: all, matched: false };

  // 1. A heading that contains every query word ("Unit 3", "Past simple") selects its section.
  const headingHits = sections.filter((s) => {
    if (!s.heading) return false;
    const hs = new Set(tokenize(s.heading).map((t) => stem(t.norm, lang)));
    return q.every((w) => hs.has(w));
  });
  if (headingHits.length) {
    const wanted = new Set(headingHits.map((s) => s.index));
    const focus = new Set(passages.filter((p) => wanted.has(p.section)).map((p) => p.id));
    if (focus.size) return { focus, matched: true };
  }

  // 2. Otherwise rank passages with BM25 (section headings count as context).
  const headingStems = sections.map((s) => tokenize(s.heading).map((t) => stem(t.norm, lang)));
  const bm25 = new Bm25(passages.map((p) => [...p.stems, ...(headingStems[p.section] ?? [])]));
  const hits = bm25.search(q);
  const best = hits[0]?.[1] ?? 0;
  if (!hits.length) return { focus: all, matched: false };
  const focus = new Set(
    hits
      .filter(([, s]) => s >= best * 0.3)
      .slice(0, 150)
      .map(([i]) => passages[i]?.id ?? -1)
      .filter((id) => id >= 0),
  );
  // Thin results: add neighbouring sentences for context.
  if (focus.size < 6) {
    for (const id of [...focus]) {
      for (const n of [id - 1, id + 1]) if (passages[n] && passages[n].section === passages[id]?.section) focus.add(n);
    }
  }
  return { focus, matched: true };
}

/* ------------------------------------------------------------------ */
/* Glossary                                                            */
/* ------------------------------------------------------------------ */

const HEADER_WORDS = /^(word|words|term|terms|vocabulary|meaning|meanings|definition|definitions|translation|example|examples|english|french|arabic|mot|mots|terme|sens|signification|définition|traduction|exemple|anglais|français|arabe|كلمة|الكلمة|كلمات|معنى|المعنى|تعريف|ترجمة|الترجمة|مثال|أمثلة)$/i;
const NOT_TERMS = new Set(['note', 'notes', 'example', 'examples', 'remember', 'tip', 'tips', 'answer', 'answers', 'exercise', 'unit', 'lesson', 'chapter', 'page', 'ex', 'e.g', 'remarque', 'exemple', 'attention', 'réponse', 'leçon', 'ملاحظة', 'مثال', 'تمرين', 'الدرس']);
const PAIR = /^(.{1,40}?)\s*(?:[:=→–—]|\s-{1,2})\s*(.+)$/u;

const scriptOf = (s: string): 'arabic' | 'latin' | 'other' =>
  /\p{Script=Arabic}/u.test(s) ? 'arabic' : /\p{Script=Latin}/u.test(s) ? 'latin' : 'other';

const cleanSide = (s: string): string =>
  s
    .replace(/^["“«'(\s]+|["”»'):;,.\s]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

function isTermLike(term: string, lang: Lang): boolean {
  const words = term.split(/\s+/);
  if (!term || words.length > 4 || term.length > 40) return false;
  if (/^\d+$/.test(term) || NOT_TERMS.has(normalise(words[0] ?? ''))) return false;
  return words.some((w) => !isStopword(normalise(w), lang));
}

function classifyMeaning(term: string, meaning: string): { definition?: string; translation?: string } {
  const m = cleanSide(meaning);
  if (!m) return {};
  const otherScript = scriptOf(m) !== scriptOf(term);
  if (otherScript || wordCount(m) <= 3) return { translation: m };
  return { definition: m };
}

const SENTENCE_PATTERNS: Record<Lang, RegExp[]> = {
  en: [
    /^(?:an?\s+|the\s+|to\s+)?([\p{L}' -]{2,40}?)\s+(?:means|refers to|is defined as|describes)\s+(.{6,})$/iu,
    /^(?:an?\s+|the\s+)?([\p{L}' -]{2,30}?)\s+(?:is|are)\s+(?:a|an|the)\s+(.{8,})$/iu,
  ],
  fr: [/^(?:l[ea]\s+|l'|les\s+|un\s+|une\s+)?([\p{L}' -]{2,40}?)\s+(?:signifie|veut dire|désigne|se définit comme)\s+(.{6,})$/iu],
  ar: [/^([\p{L}\p{M} ]{2,40}?)\s+(?:تعني|يعني|معناها|معناه|يُقصد به|يقصد به)\s+(.{4,})$/u],
};
const NOT_SUBJECTS = /^(it|this|that|these|those|there|he|she|they|we|i|you|which|who|what|ce|cela|il|elle|ils|elles|on|nous|vous|هذا|هذه|هو|هي)$/i;

export function extractGlossary(doc: SourceDocument, blockStarts: readonly BlockPassages[], passages: readonly Passage[], lang: Lang): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];
  const startOf = new Map(blockStarts.map((b) => [b.blockIndex, b.first]));
  let roles: { definition?: number; translation?: number; example?: number } | null = null;

  doc.blocks.forEach((block, i) => {
    const passage = startOf.get(i) ?? 0;
    if (block.kind !== 'row') roles = null;

    if (block.kind === 'row' && block.cells && block.cells.filter(Boolean).length >= 2) {
      const cells = block.cells.map((c) => c.trim());
      if (cells.every((c) => !c || HEADER_WORDS.test(c))) {
        roles = {};
        cells.forEach((c, idx) => {
          if (idx === 0 || !roles) return;
          if (/meaning|definition|sens|signification|définition|معنى|المعنى|تعريف/i.test(c)) roles.definition = idx;
          else if (/translation|traduction|ترجمة|الترجمة|french|arabic|english|français|arabe|anglais/i.test(c)) roles.translation = idx;
          else if (/example|exemple|مثال|أمثلة/i.test(c)) roles.example = idx;
        });
        return;
      }
      const term = cleanSide(cells[0] ?? '');
      if (!isTermLike(term, lang)) return;
      const entry: GlossaryEntry = { term, passage };
      const r = roles as { definition?: number; translation?: number; example?: number } | null;
      cells.slice(1).forEach((cell, k) => {
        const idx = k + 1;
        if (!cell || idx === r?.example) return;
        if (idx === r?.definition) entry.definition ??= cleanSide(cell);
        else if (idx === r?.translation) entry.translation ??= cleanSide(cell);
        else {
          const c = classifyMeaning(term, cell);
          entry.definition ??= c.definition;
          entry.translation ??= c.translation;
        }
      });
      if (entry.definition || entry.translation) entries.push(entry);
      return;
    }

    if (block.kind === 'item' || block.kind === 'paragraph') {
      // "term – meaning" / "term: meaning" on its own line.
      const pair = PAIR.exec(block.text);
      if (pair && wordCount(block.text) <= 40) {
        const term = cleanSide(pair[1] ?? '');
        if (isTermLike(term, lang) && !NOT_SUBJECTS.test(term)) {
          const meaning = classifyMeaning(term, pair[2] ?? '');
          if (meaning.definition || meaning.translation) {
            entries.push({ term, passage, ...meaning });
            return;
          }
        }
      }
      // Bold terms are key vocabulary even without a stated meaning.
      for (const strong of block.strong ?? []) {
        const term = cleanSide(strong);
        if (isTermLike(term, lang)) entries.push({ term, passage });
      }
    }
  });

  // "X means Y" style definitions inside running text.
  for (const p of passages) {
    if (p.kind === 'row') continue;
    for (const re of SENTENCE_PATTERNS[lang]) {
      const m = re.exec(p.text);
      if (!m) continue;
      const term = cleanSide(m[1] ?? '');
      if (!isTermLike(term, lang) || NOT_SUBJECTS.test(term) || wordCount(term) > 3) continue;
      entries.push({ term, definition: cleanSide(m[2] ?? ''), passage: p.id });
      break;
    }
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/* Terms                                                               */
/* ------------------------------------------------------------------ */

interface CompromiseTerm {
  text: string;
  normal?: string;
  root?: string;
  tags: string[];
}
interface CompromiseSentence {
  terms: CompromiseTerm[];
}
interface CompromiseVerb {
  text: string;
  verb?: { infinitive?: string; auxiliary?: string };
}

const PARTICLES = 'up|out|off|on|in|down|over|back|away|through|around|along|about|into|across|forward';
const PHRASAL_RE = new RegExp(`^[a-z]+ (?:${PARTICLES})$`);
const SKIP_TAGS = ['ProperNoun', 'Pronoun', 'Determiner', 'Auxiliary', 'Copula', 'Modal', 'Value', 'Date', 'Possessive'];

interface Draft {
  key: string;
  surfaces: Map<string, number>;
  posVotes: Map<Pos, number>;
  occurrences: Occurrence[];
  multiword: boolean;
  display?: string;
}

function posFromTags(tags: readonly string[]): Pos | undefined {
  if (tags.includes('Verb')) return 'verb';
  if (tags.includes('Noun')) return 'noun';
  if (tags.includes('Adjective')) return 'adjective';
  if (tags.includes('Adverb')) return 'adverb';
  return undefined;
}

const stripPunct = (s: string): string => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

function addOccurrence(drafts: Map<string, Draft>, key: string, occ: Occurrence, pos: Pos | undefined, multiword: boolean, display?: string): void {
  let d = drafts.get(key);
  if (!d) {
    d = { key, surfaces: new Map(), posVotes: new Map(), occurrences: [], multiword, display };
    drafts.set(key, d);
  }
  d.occurrences.push(occ);
  d.surfaces.set(occ.surface, (d.surfaces.get(occ.surface) ?? 0) + 1);
  if (pos) d.posVotes.set(pos, (d.posVotes.get(pos) ?? 0) + 1);
}

function englishTerms(passages: readonly Passage[], drafts: Map<string, Draft>): void {
  for (const p of passages.slice(0, 2500)) {
    const doc = nlp(p.text);
    doc.compute('root');
    const sentences = doc.json({ terms: { normal: true } }) as unknown as CompromiseSentence[];
    for (const s of sentences) {
      for (const t of s.terms) {
        if (SKIP_TAGS.some((tag) => t.tags.includes(tag))) continue;
        const pos = posFromTags(t.tags);
        if (!pos) continue;
        const surface = stripPunct(t.text);
        const key = normalise(stripPunct(t.root ?? t.normal ?? surface));
        if (key.length < 3 || !isWordToken(key) || isStopword(key, 'en') || /\d/.test(key)) continue;
        addOccurrence(drafts, key, { passage: p.id, surface, tags: t.tags }, pos, false, key);
      }
    }
    for (const vb of doc.verbs().json() as unknown as CompromiseVerb[]) {
      const inf = vb.verb?.infinitive?.toLowerCase().trim();
      if (!inf || !PHRASAL_RE.test(inf)) continue;
      const [verb = '', particle = ''] = inf.split(' ');
      const re = new RegExp(`(?<![\\p{L}])(${escapeRegExp(verb.slice(0, Math.max(2, verb.length - 1)))}\\p{L}*)\\s+(${particle})(?![\\p{L}])`, 'iu');
      const m = re.exec(p.text) ?? new RegExp(`(?<![\\p{L}])(\\p{L}+)\\s+(${particle})(?![\\p{L}])`, 'iu').exec(vb.text);
      if (!m) continue;
      addOccurrence(drafts, inf, { passage: p.id, surface: `${m[1]} ${m[2]}`, tags: ['Verb', 'PhrasalVerb'] }, 'phrasal', true, inf);
    }
  }
}

function tokenTerms(passages: readonly Passage[], lang: Lang, drafts: Map<string, Draft>): void {
  for (const p of passages) {
    p.tokens.forEach((t, i) => {
      if (t.norm.length < 3 || !isWordToken(t.norm) || isStopword(t.norm, lang)) return;
      addOccurrence(drafts, p.stems[i] ?? t.norm, { passage: p.id, surface: t.text, tags: [] }, undefined, false);
    });
  }
}

/** Two-word terms that recur ("past tense", "phrasal verb"). */
function bigramTerms(passages: readonly Passage[], lang: Lang, drafts: Map<string, Draft>, lexicon: Lexicon | null): void {
  const counts = new Map<string, Occurrence[]>();
  for (const p of passages) {
    for (let i = 0; i + 1 < p.tokens.length; i++) {
      const a = p.tokens[i];
      const b = p.tokens[i + 1];
      if (!a || !b || p.text.slice(a.end, b.start) !== ' ') continue;
      if ([a, b].some((t) => t.norm.length < 3 || !isWordToken(t.norm) || isStopword(t.norm, lang))) continue;
      const key = `${p.stems[i]} ${p.stems[i + 1]}`;
      const list = counts.get(key) ?? [];
      list.push({ passage: p.id, surface: `${a.text} ${b.text}`, tags: [] });
      counts.set(key, list);
    }
  }
  for (const [key, occs] of counts) {
    const surface = occs[0]?.surface.toLowerCase() ?? key;
    const known = lang === 'en' && !!lexicon?.define(surface);
    if (occs.length >= 3 || (occs.length >= 2 && known)) {
      for (const o of occs) addOccurrence(drafts, `2:${key}`, o, known ? 'noun' : undefined, true);
    }
  }
}

const ARTICLES: Record<Lang, RegExp> = {
  en: /^(?:a|an|the|to)\s+/i,
  fr: /^(?:le|la|les|un|une|des|du|de la|l')\s*/i,
  ar: /^$/,
};

/** Term without a leading article ("la pomme" -> "pomme"). */
export function stripArticle(term: string, lang: Lang): string {
  const stripped = term.replace(ARTICLES[lang], '').trim();
  return stripped || term;
}

function glossaryKey(rawTerm: string, lang: Lang): string {
  const term = stripArticle(rawTerm, lang);
  if (lang === 'en' && !term.includes(' ')) {
    const doc = nlp(term);
    doc.compute('root');
    const t = (doc.json({ terms: { normal: true } }) as unknown as CompromiseSentence[])[0]?.terms[0];
    return normalise(stripPunct(t?.root ?? t?.normal ?? term));
  }
  if (term.includes(' ')) return lang === 'en' ? normalise(term) : `2:${tokenize(term).map((t) => stem(t.norm, lang)).join(' ')}`;
  return stem(normalise(term), lang);
}

const mostCommon = <K>(m: Map<K, number>): K | undefined => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

export function analyze(doc: SourceDocument, lexicon: Lexicon | null, query = ''): Analysis {
  const fullText = doc.blocks.map((b) => b.text).join('\n');
  const lang = detectLang(fullText);
  const { passages, sections, blockStarts } = buildPassages(doc, lang);
  const { focus, matched } = computeFocus(query, passages, sections, lang);
  const focusPassages = passages.filter((p) => focus.has(p.id));
  const glossary = extractGlossary(doc, blockStarts, passages, lang).filter((g) => focus.has(g.passage));

  const drafts = new Map<string, Draft>();
  if (lang === 'en') englishTerms(focusPassages, drafts);
  else tokenTerms(focusPassages, lang, drafts);
  bigramTerms(focusPassages, lang, drafts, lexicon);

  // Glossary terms join (or create) their term.
  const glossaryByKey = new Map<string, GlossaryEntry>();
  for (const g of glossary) {
    const key = glossaryKey(g.term, lang);
    const prev = glossaryByKey.get(key);
    if (!prev || (!prev.definition && g.definition) || (!prev.translation && g.translation)) {
      glossaryByKey.set(key, { ...g, ...prev, definition: prev?.definition ?? g.definition, translation: prev?.translation ?? g.translation, term: prev?.term ?? g.term, passage: prev?.passage ?? g.passage });
    }
    const existing = drafts.get(key);
    const winner = glossaryByKey.get(key)?.term ?? g.term;
    if (existing && !existing.multiword && winner.length <= 40) existing.display = winner;
    if (!existing) {
      addOccurrence(drafts, key, { passage: g.passage, surface: g.term, tags: [] }, g.term.includes(' ') && lang === 'en' && PHRASAL_RE.test(g.term.toLowerCase()) ? 'phrasal' : undefined, g.term.includes(' '), g.term);
    }
  }

  const strongKeys = new Set(doc.blocks.flatMap((b) => b.strong ?? []).map((s) => glossaryKey(s, lang)));
  const headingKeys = new Set(sections.flatMap((s) => tokenize(s.heading).map((t) => (lang === 'en' ? t.norm : stem(t.norm, lang)))));
  const n = Math.max(1, focusPassages.length);

  const terms: Term[] = [];
  for (const d of drafts.values()) {
    const surface = mostCommon(d.surfaces) ?? d.key;
    const latin = scriptOf(surface) === 'latin';
    // Mostly capitalised mid-sentence → probably a name; skip unless the document calls it out.
    const capitalised = d.occurrences.filter((o) => /^\p{Lu}/u.test(o.surface) && (passages[o.passage]?.text.indexOf(o.surface) ?? 0) > 0).length;
    const g = glossaryByKey.get(d.key);
    if (latin && !g && !strongKeys.has(d.key) && capitalised / d.occurrences.length >= 0.7) continue;

    const display = d.display ?? (lang === 'en' ? surface.toLowerCase() : lang === 'fr' ? surface.toLocaleLowerCase() : surface);
    const pos = mostCommon(d.posVotes);
    const tf = d.occurrences.length;
    const df = new Set(d.occurrences.map((o) => o.passage)).size;
    let rarity: number;
    if (lang === 'en' && lexicon) {
      const ranks = display.split(' ').map((w) => lexicon.rank(w) ?? 25000);
      const r = ranks.reduce((a, b) => a + b, 0) / ranks.length;
      rarity = Math.min(6, Math.max(0.15, Math.log2(r / 300)));
    } else {
      rarity = Math.log(1 + n / df) + 0.25 * Math.min(3, display.length / 4);
    }
    let score = (1 + Math.log(tf)) * rarity;

    let definition = g?.definition;
    let definitionSource: Term['definitionSource'] = definition ? 'document' : undefined;
    let finalPos = pos;
    if (!definition && lang === 'en' && lexicon) {
      const picked = pickDefinition(lexicon.define(display), pos);
      if (picked) {
        definition = picked.gloss;
        definitionSource = 'dictionary';
        finalPos = pos ?? picked.pos;
        score *= 1.15;
      }
    }
    const onlyInGlossaryLines = d.occurrences.every((o) => {
      const p = passages[o.passage];
      return p ? p.kind === 'row' || (p.kind === 'item' && PAIR.test(p.text)) : true;
    });
    if (!g && onlyInGlossaryLines) score *= 0.3;
    if (g) score *= 3;
    if (strongKeys.has(d.key)) score *= 1.7;
    if (headingKeys.has(d.key) || display.split(' ').some((w) => headingKeys.has(w))) score *= 1.4;
    if (d.multiword) score *= 1.2;

    terms.push({
      key: d.key,
      display,
      pos: finalPos,
      score,
      occurrences: d.occurrences,
      definition,
      definitionSource,
      definitionPassage: g?.definition ? g.passage : undefined,
      translation: g?.translation,
      multiword: d.multiword,
      fromGlossary: !!g,
      stems: tokenize(stripArticle(display, lang)).map((t) => stem(t.norm, lang)),
    });
  }
  terms.sort((a, b) => b.score - a.score || a.display.localeCompare(b.display));

  return { name: doc.name, lang, passages, sections, glossary, terms, focus, matchedQuery: matched, lexicon };
}
