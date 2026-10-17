import type { Lang } from '@/engine/types';
import type { LlmFormatId } from './schemas';
import type { CefrLevel, RetrievedPassage } from './types';

/**
 * Prompt builders, one per format. Written for small local models: short,
 * concrete rules, one few-shot example, and always in English (the output
 * language is stated explicitly, even for French or Arabic content).
 */

export interface PromptInput {
  formatId: LlmFormatId;
  passages: readonly RetrievedPassage[];
  count: number;
  instructions: string;
  lang: Lang;
  level: CefrLevel;
  /** Supporting sentences already used in earlier batches (to avoid repeats). */
  avoid?: readonly string[];
  /** Validation errors from the previous attempt, for the retry. */
  errors?: readonly string[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const LANGUAGE: Record<Lang, string> = { en: 'English', fr: 'French', ar: 'Arabic' };

function systemPrompt(lang: Lang, level: CefrLevel): string {
  const rules = [
    'You write content for short language-learning videos.',
    'Rules:',
    '- Use ONLY facts and words from the numbered passages. Never add outside facts.',
    '- For every item, copy one sentence from the passages EXACTLY into "supporting_sentence" (without the [number]).',
    '- If the passages are not enough, return fewer items. An empty list is allowed.',
    `- Write every field in ${LANGUAGE[lang]}.`,
    `- Learners are at CEFR level ${level}: short, clear sentences.`,
    '- Answer with JSON only.',
  ];
  if (lang === 'ar') rules.splice(6, 0, '- Arabic is written right to left. Use Arabic script; never transliterate.');
  return rules.join('\n');
}

interface FormatPrompt {
  task: (count: number) => string;
  rules: string[];
  example: { passages: string[]; answer: unknown };
}

const FORMATS: Record<LlmFormatId, FormatPrompt> = {
  quiz: {
    task: (n) => `Write ${n} multiple-choice quiz question${n === 1 ? '' : 's'}.`,
    rules: [
      '- "question": natural wording, max 120 characters. For a gap question, write "_____" for the missing word.',
      '- "options": 3 or 4 options. Exactly ONE has "correct": true.',
      '- Wrong options: same part of speech and same grammatical form as the answer, similar difficulty, and clearly wrong according to the passage. Never two correct options.',
      '- "explanation": one sentence saying why the answer is right, based on the supporting sentence.',
    ],
    example: {
      passages: ['Sarah checks her schedule every morning.', 'A schedule is a plan of when things will happen.'],
      answer: {
        items: [
          {
            supporting_sentence: 'Sarah checks her schedule every morning.',
            content: {
              question: 'Sarah checks her _____ every morning.',
              options: [
                { text: 'schedule', correct: true },
                { text: 'deadline', correct: false },
                { text: 'colleague', correct: false },
              ],
              explanation: 'The text says Sarah checks her schedule every morning.',
            },
          },
        ],
      },
    },
  },
  'true-false': {
    task: (n) => `Write ${n} true-or-false statement${n === 1 ? '' : 's'}. Mix true and false.`,
    rules: [
      '- "statement": one sentence about the passage, max 150 characters.',
      '- A FALSE statement changes ONE detail of the passage (who, when, where, how many, which). Do not just add "not".',
      '- A TRUE statement says the same thing as the passage, in simple words.',
      '- "explanation": one sentence that cites the supporting sentence and says why the statement is true or false.',
    ],
    example: {
      passages: ['The train leaves from platform three at nine o\'clock.'],
      answer: {
        items: [
          {
            supporting_sentence: 'The train leaves from platform three at nine o\'clock.',
            content: { statement: 'The train leaves from platform five at nine o\'clock.', answer: false, explanation: 'The text says the train leaves from platform three, not five.' },
          },
        ],
      },
    },
  },
  'word-of-the-day': {
    task: (n) => `Choose ${n} useful word${n === 1 ? '' : 's'} or expression${n === 1 ? '' : 's'} from the passages for a "word of the day" card.`,
    rules: [
      '- "word": a word or short expression that appears in the supporting sentence.',
      '- "part_of_speech": noun, verb, adjective, adverb or phrasal verb (in the output language).',
      '- "definition": short and learner-friendly, max 120 characters.',
      '- "example": a NEW natural sentence that uses the word (do not copy the passage).',
      '- "translation": "" unless the passages give a translation.',
    ],
    example: {
      passages: ['We usually buy a ticket at the station before the journey.'],
      answer: {
        items: [
          {
            supporting_sentence: 'We usually buy a ticket at the station before the journey.',
            content: { word: 'journey', part_of_speech: 'noun', definition: 'A trip from one place to another.', example: 'The journey to the coast takes two hours.', translation: '' },
          },
        ],
      },
    },
  },
  top5: {
    task: (n) => `Write ${n} "top 5" ranking${n === 1 ? '' : 's'} of key words or ideas from the passages, ranked for the teacher's instructions.`,
    rules: [
      '- "title": short, max 80 characters. You may wrap one key phrase in *stars*.',
      '- "items": 3 to 5 entries, the most important FIRST. "text": a word or phrase from the passages (max 40 characters). "detail": max 80 characters.',
      '- "supporting_sentence": the passage sentence the ranking is mostly based on.',
    ],
    example: {
      passages: ['platform – the place where you get on a train', 'ticket – a piece of paper that lets you travel', 'delay – a time when something happens later than planned'],
      answer: {
        items: [
          {
            supporting_sentence: 'ticket – a piece of paper that lets you travel',
            content: {
              title: 'Top 3 *train words*',
              items: [
                { text: 'ticket', detail: 'lets you travel' },
                { text: 'platform', detail: 'where you get on the train' },
                { text: 'delay', detail: 'when the train is late' },
              ],
            },
          },
        ],
      },
    },
  },
};

const numbered = (passages: readonly string[]): string => passages.map((p, i) => `[${i + 1}] ${p}`).join('\n');

export function buildMessages(input: PromptInput): ChatMessage[] {
  const f = FORMATS[input.formatId];
  const exampleBlock = ['Example passages:', numbered(f.example.passages), 'Example answer:', JSON.stringify(f.example.answer)].join('\n');
  const user = [
    f.task(input.count),
    ...f.rules,
    '',
    `Teacher's instructions: ${input.instructions.trim() || '(none)'}`,
  ];
  if (input.avoid?.length) user.push(`Already used, choose other sentences: ${input.avoid.map((a) => `"${a}"`).join('; ')}`);
  if (input.errors?.length) user.push('', 'Your previous answer had these problems. Fix them:', ...input.errors.map((e) => `- ${e}`));
  user.push('', 'Passages:', numbered(input.passages.map((p) => p.text)));
  return [
    { role: 'system', content: `${systemPrompt(input.lang, input.level)}\n\n${exampleBlock}` },
    { role: 'user', content: user.join('\n') },
  ];
}
