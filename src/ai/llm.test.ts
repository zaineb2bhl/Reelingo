import { describe, expect, it } from 'vitest';
import { OLLAMA } from '@/config';
import { parseTextBlocks } from '@/engine/reader';
import { getFormat, visibleFormats } from '@/formats/registry';
import { useDraft } from '@/state/editor';
import { ENGLISH_LESSON } from '../../tests/fixtures/lessons';
import { checkItem, cleanSupport, isGrounded, parseModelJson, stripFences } from './checks';
import { OllamaGenerator, type AttemptLog } from './ollamaGenerator';
import type { FetchLike } from './ollama';
import { runGeneration } from './pipeline';
import { prepareDocument } from './prepare';
import { buildMessages } from './prompts';
import { llmJsonSchema, llmWrapper } from './schemas';
import type { RetrievedPassage } from './types';

const P = (text: string, id = 0): RetrievedPassage => ({ id, text, heading: 'Reading', score: 1 });
const passages = [
  P('Sarah checks her schedule and answers her emails quickly.', 1),
  P('Today the team must finish the report before the deadline.', 2),
  P('The meeting was put off until Friday because the manager was ill.', 3),
];
const ctx = (formatId: 'quiz' | 'true-false' | 'word-of-the-day' | 'top5') => ({ formatId, passages, lang: 'en' as const, ipa: (w: string) => (w === 'deadline' ? 'ˈdɛdˌlaɪn' : undefined) });

const goodQuiz = {
  supporting_sentence: 'Today the team must finish the report before the deadline.',
  content: {
    question: 'Today the team must finish the report before the _____.',
    options: [
      { text: 'deadline', correct: true },
      { text: 'meeting', correct: false },
      { text: 'schedule', correct: false },
    ],
    explanation: 'The text says the report is due before the deadline.',
  },
};

describe('prompt builders', () => {
  it('builds short English prompts with the rules, one example and numbered passages', () => {
    const [system, user] = buildMessages({ formatId: 'quiz', passages, count: 2, instructions: '2 questions on deadlines', lang: 'fr', level: 'A2' });
    expect(system?.role).toBe('system');
    expect(system?.content).toContain('Use ONLY facts and words from the numbered passages');
    expect(system?.content).toContain('Write every field in French');
    expect(system?.content).toContain('CEFR level A2');
    expect(system?.content.match(/Example answer:/g)).toHaveLength(OLLAMA.generation.fewShotExamples);
    expect(user?.content).toContain('Write 2 multiple-choice quiz questions.');
    expect(user?.content).toContain('Exactly ONE has "correct": true');
    expect(user?.content).toContain('[3] The meeting was put off');
    expect(user?.content).toContain("Teacher's instructions: 2 questions on deadlines");
  });

  it('adds the RTL rule for Arabic and the errors on retry', () => {
    const [system, user] = buildMessages({ formatId: 'true-false', passages, count: 1, instructions: '', lang: 'ar', level: 'B1', errors: ['item 1: supporting_sentence is invented'] });
    expect(system?.content).toContain('right to left');
    expect(user?.content).toContain('Do not just add "not"');
    expect(user?.content).toContain('- item 1: supporting_sentence is invented');
  });

  it('has a builder for every document format', () => {
    for (const id of ['quiz', 'true-false', 'word-of-the-day', 'top5'] as const) {
      expect(buildMessages({ formatId: id, passages, count: 1, instructions: '', lang: 'en', level: 'B1' })).toHaveLength(2);
    }
  });
});

describe('structured output schema', () => {
  it('derives the Ollama JSON schema from Zod, supporting sentence first', () => {
    const schema = llmJsonSchema('quiz', 2) as { properties: { items: { maxItems: number; items: { properties: Record<string, unknown> } } } };
    expect(schema.properties.items.maxItems).toBe(2);
    expect(Object.keys(schema.properties.items.items.properties)).toEqual(['supporting_sentence', 'content']);
    expect(llmWrapper('quiz', 2).safeParse({ items: [goodQuiz] }).success).toBe(true);
  });
});

describe('fence stripping', () => {
  it('extracts JSON from fences and chatter', () => {
    expect(stripFences('```json\n{"items": []}\n```')).toBe('{"items": []}');
    expect(stripFences('Here you go: {"items": [1]} hope it helps')).toBe('{"items": [1]}');
    expect(parseModelJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => parseModelJson('not json')).toThrow();
  });
});

describe('grounding check', () => {
  it('accepts exact, re-spaced, re-cased or numbered copies of a passage sentence', () => {
    expect(isGrounded('Today the team must finish the report before the deadline.', passages)).toBe(true);
    expect(isGrounded('  today the team   must finish the report before the DEADLINE ', passages)).toBe(true);
    expect(isGrounded('[2] Today the team must finish the report before the deadline.', passages)).toBe(true);
    expect(cleanSupport('[2] “Hello there”')).toBe('Hello there');
  });

  it('rejects sentences the model invented or paraphrased', () => {
    expect(isGrounded('The team always misses its deadlines.', passages)).toBe(false);
    expect(isGrounded('Today the team must finish the essay before the deadline.', passages)).toBe(false);
    expect(isGrounded('deadline', passages)).toBe(false);
  });

  it('never accepts an item whose supporting sentence is invented', () => {
    const invented = { ...goodQuiz, supporting_sentence: 'Deadlines are set by the government every year.' };
    expect(checkItem(invented, ctx('quiz'))).toMatchObject({ ok: false, failure: 'ungrounded', failedAt: 'grounding' });
  });
});

describe('per-format checks', () => {
  it('accepts a good quiz and fills labels', () => {
    const result = checkItem(goodQuiz, ctx('quiz'));
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ label: 'Fill the gap', question: 'Today the team must finish the report before the *_____*.', pace: 'standard' });
    expect(getFormat('quiz')?.schema.safeParse(result.data).success).toBe(true);
  });

  it('rejects two correct options, duplicates, and an answer not in the sentence', () => {
    const twoCorrect = { ...goodQuiz, content: { ...goodQuiz.content, options: goodQuiz.content.options.map((o) => ({ ...o, correct: true })) } };
    expect(checkItem(twoCorrect, ctx('quiz')).errors.join()).toContain('exactly one option must be correct');
    const dup = { ...goodQuiz, content: { ...goodQuiz.content, options: [{ text: 'deadline', correct: true }, { text: 'Deadline', correct: false }] } };
    expect(checkItem(dup, ctx('quiz')).errors.join()).toContain('options must all be different');
    const wrongAnswer = { ...goodQuiz, content: { ...goodQuiz.content, options: [{ text: 'weekend', correct: true }, { text: 'deadline', correct: false }] } };
    expect(checkItem(wrongAnswer, ctx('quiz')).errors.join()).toContain('must be the missing word');
  });

  it('checks true/false statements against the sentence', () => {
    const goodFalse = { supporting_sentence: passages[2]?.text, content: { statement: 'The meeting was put off until Monday because the manager was ill.', answer: false, explanation: 'The text says the meeting was put off until Friday.' } };
    expect(checkItem(goodFalse, ctx('true-false')).ok).toBe(true);
    const copiedAsFalse = { ...goodFalse, content: { ...goodFalse.content, statement: passages[2]?.text } };
    expect(checkItem(copiedAsFalse, ctx('true-false')).errors.join()).toContain('must change one detail');
    const unrelatedTrue = { ...goodFalse, content: { statement: 'Dogs like to play in the park.', answer: true, explanation: 'The meeting was put off.' } };
    expect(checkItem(unrelatedTrue, ctx('true-false')).ok).toBe(false);
  });

  it('keeps dictionary IPA for word of the day and requires the word in the sentence', () => {
    const wotd = { supporting_sentence: passages[1]?.text, content: { word: 'deadline', part_of_speech: 'noun', definition: 'the time by which something must be done', example: 'The deadline for the project is Monday.', translation: '' } };
    const ok = checkItem(wotd, ctx('word-of-the-day'));
    expect(ok.data).toMatchObject({ ipa: 'ˈdɛdˌlaɪn', definition: 'The time by which something must be done.' });
    const absent = { ...wotd, content: { ...wotd.content, word: 'holiday' } };
    expect(checkItem(absent, ctx('word-of-the-day')).errors.join()).toContain('must appear in the supporting sentence');
  });

  it('requires top 5 items to come from the passages', () => {
    const top = { supporting_sentence: passages[0]?.text, content: { title: 'Top words', items: [{ text: 'schedule', detail: '' }, { text: 'deadline', detail: '' }, { text: 'astronaut', detail: '' }] } };
    expect(checkItem(top, ctx('top5')).errors.join()).toContain('"astronaut" does not come from the passages');
  });

  it('treats Arabic options that differ only by diacritics as duplicates', () => {
    const arPassages = [P('بعد الدرس، يذهب أحمد إلى المكتبة ليقرأ كتابًا.')];
    const item = {
      supporting_sentence: 'بعد الدرس، يذهب أحمد إلى المكتبة ليقرأ كتابًا.',
      content: { question: 'بعد الدرس، يذهب أحمد إلى المكتبة ليقرأ _____.', options: [{ text: 'كتابًا', correct: true }, { text: 'كتاباً', correct: false }, { text: 'قلمًا', correct: false }], explanation: 'يقول النص إن أحمد يذهب إلى المكتبة ليقرأ كتابًا.' },
    };
    expect(checkItem(item, { ...ctx('quiz'), passages: arPassages, lang: 'ar' }).errors.join()).toContain('options must all be different');
  });

  it('rejects a FALSE statement that repeats another passage verbatim', () => {
    const item = { supporting_sentence: passages[0]?.text, content: { statement: passages[2]?.text, answer: false, explanation: 'The meeting was put off, says the text about Sarah checking her schedule.' } };
    expect(checkItem(item, ctx('true-false')).errors.join()).toContain('must not repeat a sentence from the passages');
  });

  it('rejects leaked passage markers', () => {
    const item = { ...goodQuiz, content: { ...goodQuiz.content, question: '<<1>> Today the team must finish the report before the _____ <<2>>.' } };
    expect(checkItem(item, ctx('quiz')).errors.join()).toContain('remove passage numbers and markers');
  });

  it('clears translations that are not in the passages', () => {
    const wotd = { supporting_sentence: passages[1]?.text, content: { word: 'deadline', part_of_speech: 'noun', definition: 'the time by which something must be done', example: 'The deadline is Monday.', translation: 'deadline' } };
    expect(checkItem(wotd, ctx('word-of-the-day')).data).toMatchObject({ translation: '' });
  });

  it('checks the language of each long field', () => {
    const fr = [P("Elle achète des pommes, des carottes et des tomates au marché.")];
    const wotd = { supporting_sentence: fr[0]?.text, content: { word: 'pommes', part_of_speech: 'nom', definition: 'A type of fruit with a round shape and a red or yellow colour.', example: 'Elle achète des pommes, des carottes et des tomates au marché chaque samedi.', translation: '' } };
    expect(checkItem(wotd, { ...ctx('word-of-the-day'), passages: fr, lang: 'fr' }).errors.join()).toContain('write "definition" in the language of the passages');
  });

  it('rejects content in the wrong language', () => {
    const arabic = { ...goodQuiz, content: { ...goodQuiz.content, explanation: 'يقول النص إن التقرير يجب أن ينتهي قبل الموعد النهائي اليوم.' } };
    expect(checkItem(arabic, ctx('quiz')).errors.join()).toContain('language of the passages');
  });
});

describe('OllamaGenerator: retry then fallback (mocked Ollama)', () => {
  const doc = { name: 'lesson.md', blocks: parseTextBlocks(ENGLISH_LESSON, true) };
  const prepared = prepareDocument(doc, { formatId: 'quiz', count: 2, topic: 'deadline' }, null);
  const support = prepared.passages.find((p) => /before the deadline/.test(p.text))?.text ?? '';
  const quizFor = (sentence: string) => ({
    supporting_sentence: sentence,
    content: { question: sentence.replace('deadline', '_____'), options: [{ text: 'deadline', correct: true }, { text: 'meeting', correct: false }, { text: 'colleague', correct: false }], explanation: 'The text says so.' },
  });
  const reply = (items: unknown[], fence = false): Response => {
    const content = JSON.stringify({ items });
    return new Response(JSON.stringify({ message: { content: fence ? `\`\`\`json\n${content}\n\`\`\`` : content } }), { status: 200 });
  };
  const scripted = (responses: Response[]): { fetchImpl: FetchLike; bodies: string[] } => {
    const bodies: string[] = [];
    let i = 0;
    return {
      bodies,
      fetchImpl: async (_url, init) => {
        bodies.push(String(init?.body));
        return responses[Math.min(i++, responses.length - 1)] as Response;
      },
    };
  };

  it('accepts grounded items on the first try, even inside code fences', async () => {
    const { fetchImpl, bodies } = scripted([reply([quizFor(support)], true)]);
    const logs: AttemptLog[] = [];
    const gen = new OllamaGenerator({ model: 'qwen2.5:3b', fetchImpl, batchSize: 1, onAttempt: (l) => logs.push(l) });
    const outcome = await gen.generate({ formatId: 'quiz', count: 1, instructions: '', topic: 'deadline', passages: prepared.passages, lang: 'en', level: 'B1' });
    expect(outcome.items).toHaveLength(1);
    expect(outcome.items[0]).toMatchObject({ origin: 'llm', model: 'qwen2.5:3b', attempts: 1, supportingSentence: support });
    const body = JSON.parse(bodies[0] ?? '{}') as { stream: boolean; format: unknown; options: { temperature: number }; messages: Array<{ content: string }> };
    expect(body.stream).toBe(false);
    expect(body.format).toBeTruthy();
    expect(body.options.temperature).toBeCloseTo(0.2);
    expect((body.messages[1]?.content.match(/^\[\d+\]/gm) ?? []).length).toBeLessThanOrEqual(OLLAMA.generation.maxPassages);
    expect(logs[0]).toMatchObject({ attempt: 1, returned: 1, valid: 1, grounded: 1, accepted: 1 });
  });

  it('retries once with the errors when the model invents a sentence, then succeeds', async () => {
    const { fetchImpl, bodies } = scripted([reply([quizFor('The deadline was moved to next year by the board.')]), reply([quizFor(support)])]);
    const gen = new OllamaGenerator({ model: 'qwen2.5:3b', fetchImpl, batchSize: 1 });
    const outcome = await gen.generate({ formatId: 'quiz', count: 1, instructions: '', topic: '', passages: prepared.passages, lang: 'en', level: 'B1' });
    expect(outcome.items[0]?.attempts).toBe(2);
    expect(bodies[1]).toContain('not copied exactly from the passages');
  });

  it('falls back to the rule-based engine when the retry fails too, and says why', async () => {
    const invented = reply([quizFor('The deadline was moved to next year by the board.')]);
    const { fetchImpl } = scripted([invented, reply([quizFor('Another made-up deadline sentence for the test.')])]);
    const primary = new OllamaGenerator({ model: 'qwen2.5:3b', fetchImpl, batchSize: 1 });
    const result = await runGeneration({ prepared, formatId: 'quiz', count: 1, instructions: '', topic: 'deadline', level: 'B1', primary });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ origin: 'rules', fallbackReason: 'ungrounded' });
    // The invented item is never shown.
    expect(JSON.stringify(result.items)).not.toContain('moved to next year');
  });

  it('falls back with "not-running" when Ollama is down', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('Failed to fetch');
    };
    const primary = new OllamaGenerator({ model: 'qwen2.5:3b', fetchImpl });
    const result = await runGeneration({ prepared, formatId: 'quiz', count: 2, instructions: '', topic: '', level: 'B1', primary });
    expect(result.primaryError).toBe('not-running');
    expect(result.items.every((i) => i.origin === 'rules')).toBe(true);
  });

  it('reports a missing model', async () => {
    const fetchImpl: FetchLike = async () => new Response(JSON.stringify({ error: "model 'qwen2.5:3b' not found, try pulling it first" }), { status: 404 });
    const primary = new OllamaGenerator({ model: 'qwen2.5:3b', fetchImpl });
    const result = await runGeneration({ prepared, formatId: 'quiz', count: 1, instructions: '', topic: '', level: 'B1', primary });
    expect(result.primaryError).toBe('model-missing');
  });

  it('handles non-JSON answers as invalid and retries', async () => {
    const { fetchImpl } = scripted([new Response(JSON.stringify({ message: { content: 'Sorry, I cannot help.' } })), reply([quizFor(support)])]);
    const gen = new OllamaGenerator({ model: 'qwen2.5:3b', fetchImpl, batchSize: 1 });
    const outcome = await gen.generate({ formatId: 'quiz', count: 1, instructions: '', topic: '', passages: prepared.passages, lang: 'en', level: 'B1' });
    expect(outcome.items).toHaveLength(1);
  });
});

describe('manual path is unchanged', () => {
  it('every template still starts from its sample data, valid for its schema, with no AI involved', () => {
    expect(typeof useDraft).toBe('function');
    for (const format of visibleFormats) {
      expect(format.schema.safeParse(format.defaults).success).toBe(true);
      expect(format.duration(format.defaults)).toBeGreaterThan(0);
    }
  });
});
