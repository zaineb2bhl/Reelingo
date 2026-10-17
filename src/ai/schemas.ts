import { z } from 'zod';
import { CONTENT_STRINGS } from '@/engine/strings';
import { capitalise, ensureStop } from '@/engine/text';
import type { Lang } from '@/engine/types';

/**
 * What the model writes, per format. Deliberately smaller than the template
 * data: labels, pace and IPA are filled in by the app (IPA from the CMU
 * dictionary, never from the model). `supporting_sentence` comes first so the
 * model commits to its evidence before writing the content.
 */

export const llmContent = {
  quiz: z.object({
    question: z.string().min(5).max(160),
    options: z
      .array(z.object({ text: z.string().min(1).max(80), correct: z.boolean() }))
      .min(2)
      .max(4),
    explanation: z.string().max(240),
  }),
  'true-false': z.object({
    statement: z.string().min(5).max(180),
    answer: z.boolean(),
    explanation: z.string().min(5).max(240),
  }),
  'word-of-the-day': z.object({
    word: z.string().min(1).max(40),
    part_of_speech: z.string().max(30),
    definition: z.string().min(3).max(220),
    example: z.string().max(220),
    translation: z.string().max(140),
  }),
  top5: z.object({
    title: z.string().min(3).max(100),
    items: z
      .array(z.object({ text: z.string().min(1).max(60), detail: z.string().max(90) }))
      .min(3)
      .max(5),
  }),
} as const;

export type LlmFormatId = keyof typeof llmContent;
export type LlmContent<F extends LlmFormatId> = z.infer<(typeof llmContent)[F]>;

export const isLlmFormat = (id: string): id is LlmFormatId => id in llmContent;

/** `{ items: [{ supporting_sentence, content }] }` for one format. */
export function llmWrapper(formatId: LlmFormatId, maxItems: number) {
  return z.object({
    items: z
      .array(z.object({ supporting_sentence: z.string(), content: llmContent[formatId] }))
      .max(maxItems),
  });
}

/** JSON Schema for Ollama's `format` field, derived from the Zod schema. */
export function llmJsonSchema(formatId: LlmFormatId, maxItems: number): Record<string, unknown> {
  const schema = z.toJSONSchema(llmWrapper(formatId, maxItems)) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

export interface MapContext {
  lang: Lang;
  /** IPA lookup (English dictionary); undefined when unknown. */
  ipa: (word: string) => string | undefined;
}

const blank = (s: string): string => s.replace(/\*?_{3,}\*?/g, '*_____*');

/** Turns model content into template data (then validated with the format's own Zod schema). */
export function toTemplateData(formatId: LlmFormatId, content: unknown, ctx: MapContext): unknown {
  const s = CONTENT_STRINGS[ctx.lang];
  switch (formatId) {
    case 'quiz': {
      const c = content as LlmContent<'quiz'>;
      return {
        label: c.question.includes('___') ? s.gapLabel : s.meaningLabel,
        question: blank(c.question.trim()),
        options: c.options.map((o) => ({ text: o.text.trim(), correct: o.correct })),
        pace: 'standard',
        explanation: c.explanation.trim(),
      };
    }
    case 'true-false': {
      const c = content as LlmContent<'true-false'>;
      return {
        label: s.tfLabel,
        statement: c.statement.trim(),
        answer: c.answer,
        trueLabel: s.trueLabel,
        falseLabel: s.falseLabel,
        pace: 'standard',
        explanation: c.explanation.trim(),
      };
    }
    case 'word-of-the-day': {
      const c = content as LlmContent<'word-of-the-day'>;
      const word = c.word.trim();
      const ipa = word
        .split(/\s+/)
        .map((w) => ctx.ipa(w.toLowerCase()))
        .every(Boolean)
        ? word
            .split(/\s+/)
            .map((w) => ctx.ipa(w.toLowerCase()) ?? '')
            .join(' ')
        : '';
      return {
        label: s.wotdLabel,
        word,
        ipa,
        partOfSpeech: c.part_of_speech.trim(),
        definition: ensureStop(capitalise(c.definition.trim())),
        example: c.example.trim(),
        translation: c.translation.trim(),
        highlight: true,
        pace: 'standard',
      };
    }
    case 'top5': {
      const c = content as LlmContent<'top5'>;
      return { title: c.title.trim(), items: c.items.map((i) => ({ text: i.text.trim(), detail: i.detail.trim() })), pace: 'standard' };
    }
  }
}
