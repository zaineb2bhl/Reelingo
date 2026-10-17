import { detectLang, isStopword, normalise, stem, tokenize } from '@/engine/text';
import type { Lang } from '@/engine/types';
import { getFormat } from '@/formats/registry';
import { normaliseForMatch } from './retrieval';
import { llmContent, toTemplateData, type LlmFormatId, type MapContext } from './schemas';
import type { RetrievedPassage } from './types';

/**
 * Programmatic guardrails for model output. Nothing the model says is trusted:
 * every item must parse, validate against the template's Zod schema, cite a
 * sentence that really is in the retrieved passages, and pass format checks.
 */

/** Removes ```json fences and any chatter around the JSON object. */
export function stripFences(text: string): string {
  let t = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fenced?.[1]) t = fenced[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  return start >= 0 && end > start ? t.slice(start, end + 1) : t;
}

export function parseModelJson(text: string): unknown {
  return JSON.parse(stripFences(text));
}

const MIN_SUPPORT_CHARS = 15;

/** Strips the "[2] " passage number some models copy along with the sentence. */
export const cleanSupport = (s: string): string => s.replace(/^\s*\[\d+\]\s*/, '').replace(/^["“«]|["”»]$/g, '').trim();

/** True when the sentence appears (whitespace/case/quotes-insensitive) in one of the retrieved passages. */
export function isGrounded(sentence: string, passages: readonly RetrievedPassage[]): boolean {
  const s = normaliseForMatch(cleanSupport(sentence)).replace(/[.!?؟…]+$/, '');
  if (s.length < MIN_SUPPORT_CHARS) return false;
  return passages.some((p) => normaliseForMatch(p.text).includes(s));
}

function contentStems(text: string, lang: Lang): string[] {
  return tokenize(text)
    .filter((t) => !isStopword(t.norm, lang) && /\p{L}/u.test(t.norm))
    .map((t) => stem(t.norm, lang));
}

/** Share of `part`'s content words that also occur in `whole`. */
export function overlap(part: string, whole: string, lang: Lang): number {
  const p = contentStems(part, lang);
  if (!p.length) return 0;
  const w = new Set(contentStems(whole, lang));
  return p.filter((x) => w.has(x)).length / p.length;
}

function languageOk(text: string, lang: Lang): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (lang === 'ar') return (text.match(/\p{Script=Arabic}/gu) ?? []).length >= letters * 0.6;
  if ((text.match(/\p{Script=Arabic}/gu) ?? []).length > letters * 0.3) return false;
  // French/English detection needs enough text to be meaningful.
  return letters < 60 || detectLang(text) === lang;
}

export type CheckFailure = 'invalid' | 'ungrounded';

export interface CheckResult {
  ok: boolean;
  data?: unknown;
  supportingSentence: string;
  /** Human-readable problems, sent back to the model on retry. */
  errors: string[];
  failure?: CheckFailure;
  /** Which stage rejected the item. */
  failedAt?: 'schema' | 'grounding' | 'format';
}

export interface CheckContext extends MapContext {
  formatId: LlmFormatId;
  passages: readonly RetrievedPassage[];
}

const norm = (s: string): string =>
  normaliseForMatch(normalise(s))
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[.!?؟]+$/, '');

function formatChecks(formatId: LlmFormatId, data: Record<string, unknown>, support: string, ctx: CheckContext): string[] {
  const errors: string[] = [];
  const { lang, passages } = ctx;
  const allPassages = passages.map((p) => p.text).join('\n');
  if (formatId === 'quiz') {
    const options = data.options as Array<{ text: string; correct: boolean }>;
    const correct = options.filter((o) => o.correct);
    if (correct.length !== 1) errors.push(`exactly one option must be correct (found ${correct.length})`);
    const texts = options.map((o) => norm(o.text));
    if (new Set(texts).size !== texts.length) errors.push('options must all be different');
    const answer = correct[0]?.text ?? '';
    const question = String(data.question);
    if (answer) {
      if (question.includes('_____')) {
        if (!norm(support).includes(norm(answer))) errors.push(`the correct answer "${answer}" must be the missing word from the supporting sentence`);
        for (const o of options) if (!o.correct && norm(question.replace('*_____*', o.text)) === norm(support)) errors.push(`wrong option "${o.text}" also fits the sentence`);
      } else if (overlap(answer, `${support}\n${allPassages}`, lang) < 0.5) {
        errors.push(`the correct answer "${answer}" is not supported by the passages`);
      }
    }
  }
  if (formatId === 'true-false') {
    const statement = String(data.statement);
    if (data.answer === true && overlap(statement, support, lang) < 0.5) errors.push('a TRUE statement must say what the supporting sentence says');
    if (data.answer === false && norm(statement) === norm(support)) errors.push('a FALSE statement must change one detail of the supporting sentence');
    if (data.answer === false && passages.some((p) => norm(p.text).includes(norm(statement)))) errors.push('a FALSE statement must not repeat a sentence from the passages');
    if (overlap(statement, allPassages, lang) < 0.3) errors.push('the statement must be about the passages');
    if (overlap(String(data.explanation), `${support}\n${statement}`, lang) < 0.25) errors.push('the explanation must refer to the supporting sentence');
  }
  if (formatId === 'word-of-the-day') {
    const word = String(data.word);
    if (overlap(word, support, lang) < 1) errors.push(`the word "${word}" must appear in the supporting sentence`);
    if (data.example && norm(String(data.example)) === norm(String(data.definition))) errors.push('the example must be different from the definition');
  }
  if (formatId === 'top5') {
    const items = data.items as Array<{ text: string }>;
    const texts = items.map((i) => norm(i.text));
    if (new Set(texts).size !== texts.length) errors.push('ranking items must all be different');
    for (const i of items) if (overlap(i.text, allPassages, lang) < 0.5) errors.push(`"${i.text}" does not come from the passages`);
  }
  return errors;
}

const fieldsText = (formatId: LlmFormatId, data: Record<string, unknown>): string => {
  if (formatId === 'quiz') return [data.question, ...(data.options as Array<{ text: string }>).map((o) => o.text), data.explanation].join(' ');
  if (formatId === 'true-false') return [data.statement, data.explanation].join(' ');
  if (formatId === 'word-of-the-day') return [data.definition, data.example].join(' ');
  return [data.title, ...(data.items as Array<{ text: string; detail: string }>).flatMap((i) => [i.text, i.detail])].join(' ');
};

const EN_WORDS = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'with', 'is', 'are', 'that', 'for', 'in', 'on', 'it', 'you', 'this']);
const FR_WORDS = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'est', 'pour', 'avec', 'dans', 'que', 'qui', 'sur', 'au']);

/** Language check for one short field: only decides when there is evidence either way. */
function fieldLanguageOk(text: string, lang: Lang): boolean {
  if (lang === 'ar' || /\p{Script=Arabic}/u.test(text)) return languageOk(text, lang);
  let en = 0;
  let fr = 0;
  for (const t of tokenize(text)) {
    if (EN_WORDS.has(t.norm)) en++;
    if (FR_WORDS.has(t.norm)) fr++;
  }
  if (/[éèêàçùûôîœ]/i.test(text)) fr++;
  if (en === fr) return true;
  return lang === 'fr' ? fr > en : en > fr;
}

/** Fields long enough for a reliable per-field language check. */
function longFields(formatId: LlmFormatId, data: Record<string, unknown>): Array<[string, string]> {
  const names: Record<LlmFormatId, string[]> = {
    quiz: ['question', 'explanation'],
    'true-false': ['statement', 'explanation'],
    'word-of-the-day': ['definition', 'example'],
    top5: ['title'],
  };
  return names[formatId]
    .map((f): [string, string] => [f, typeof data[f] === 'string' ? (data[f] as string) : ''])
    .filter(([, text]) => (text.match(/\p{L}/gu) ?? []).length >= 30);
}

/** Validates one `{ supporting_sentence, content }` item from the model. */
export function checkItem(raw: unknown, ctx: CheckContext): CheckResult {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const supportingSentence = typeof record.supporting_sentence === 'string' ? cleanSupport(record.supporting_sentence) : '';
  const content = llmContent[ctx.formatId].safeParse(record.content);
  if (!content.success) {
    return { ok: false, supportingSentence, failure: 'invalid', failedAt: 'schema', errors: content.error.issues.slice(0, 4).map((i) => `${i.path.join('.') || 'content'}: ${i.message}`) };
  }
  const data = toTemplateData(ctx.formatId, content.data, ctx);
  const template = getFormat(ctx.formatId)?.schema.safeParse(data);
  if (!template?.success) {
    return { ok: false, supportingSentence, failure: 'invalid', failedAt: 'schema', errors: (template?.error.issues ?? []).slice(0, 4).map((i) => `${i.path.join('.') || 'content'}: ${i.message}`) };
  }
  // Grounding first: an item citing an invented sentence is never shown.
  if (!isGrounded(supportingSentence, ctx.passages)) {
    return { ok: false, supportingSentence, failure: 'ungrounded', failedAt: 'grounding', errors: [`supporting_sentence "${supportingSentence.slice(0, 80)}" is not copied exactly from the passages`] };
  }
  const values = { ...(template.data as Record<string, unknown>) };
  if (ctx.formatId === 'word-of-the-day' && typeof values.translation === 'string' && values.translation) {
    const t = values.translation;
    const allText = ctx.passages.map((p) => p.text).join('\n');
    if (norm(t) === norm(String(values.word)) || !normaliseForMatch(allText).includes(normaliseForMatch(t))) values.translation = '';
  }
  const errors = formatChecks(ctx.formatId, values, supportingSentence, ctx);
  if (!languageOk(fieldsText(ctx.formatId, values), ctx.lang)) errors.push(`write the content in the language of the passages`);
  for (const [field, text] of longFields(ctx.formatId, values)) {
    if (!fieldLanguageOk(text, ctx.lang)) errors.push(`write "${field}" in the language of the passages`);
  }
  if (/<<\s*\d+\s*>>|\[\d+\]/.test(fieldsText(ctx.formatId, values))) errors.push('remove passage numbers and markers like [1] or <<1>> from the text');
  if (errors.length) return { ok: false, supportingSentence, failedAt: 'format', failure: errors.some((e) => /supported|passages|missing word|supporting sentence/.test(e)) ? 'ungrounded' : 'invalid', errors };
  return { ok: true, data: values, supportingSentence, errors: [] };
}

/** The passage a supporting sentence came from (for the source note). */
export function passageFor(sentence: string, passages: readonly RetrievedPassage[]): RetrievedPassage | undefined {
  const s = normaliseForMatch(cleanSupport(sentence)).replace(/[.!?؟…]+$/, '');
  return passages.find((p) => normaliseForMatch(p.text).includes(s));
}
