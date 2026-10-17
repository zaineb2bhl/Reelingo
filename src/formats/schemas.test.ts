import { describe, expect, it } from 'vitest';
import { quizCues, quizDuration } from './quiz/render';
import { quizDefaults, quizSchema } from './quiz/schema';
import { top5Cues, top5Duration } from './top5/render';
import { top5Defaults, top5Schema } from './top5/schema';
import { trueFalseCues, trueFalseDuration } from './truefalse/render';
import { trueFalseDefaults, trueFalseSchema } from './truefalse/schema';
import { targetMatcher, wordOfDayDuration } from './wordofday/render';
import { wordOfDayDefaults, wordOfDaySchema } from './wordofday/schema';

describe('quiz schema', () => {
  it('accepts the sample', () => {
    expect(quizSchema.safeParse(quizDefaults).success).toBe(true);
  });

  it('requires 2–4 options and at least one correct answer', () => {
    expect(quizSchema.safeParse({ ...quizDefaults, options: [{ text: 'Only one', correct: true }] }).success).toBe(false);
    const five = Array.from({ length: 5 }, (_, i) => ({ text: `Option ${i}`, correct: i === 0 }));
    expect(quizSchema.safeParse({ ...quizDefaults, options: five }).success).toBe(false);
    const noneCorrect = quizDefaults.options.map((o) => ({ ...o, correct: false }));
    const res = quizSchema.safeParse({ ...quizDefaults, options: noneCorrect });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.path).toEqual(['options']);
  });

  it('rejects empty questions and options, and unknown paces', () => {
    expect(quizSchema.safeParse({ ...quizDefaults, question: '   ' }).success).toBe(false);
    expect(quizSchema.safeParse({ ...quizDefaults, options: [{ text: '', correct: true }, { text: 'b', correct: false }] }).success).toBe(false);
    expect(quizSchema.safeParse({ ...quizDefaults, pace: 'slow' }).success).toBe(false);
  });

  it('allows several correct answers', () => {
    const opts = quizDefaults.options.map((o) => ({ ...o, correct: true }));
    expect(quizSchema.safeParse({ ...quizDefaults, options: opts }).success).toBe(true);
  });
});

describe('quiz duration', () => {
  it('grows with the countdown length', () => {
    const quick = quizDuration({ ...quizDefaults, pace: 'quick' });
    const standard = quizDuration({ ...quizDefaults, pace: 'standard' });
    const relaxed = quizDuration({ ...quizDefaults, pace: 'relaxed' });
    expect(standard - quick).toBeCloseTo(2, 5);
    expect(relaxed - standard).toBeCloseTo(3, 5);
  });

  it('adds a scene for the explanation only when there is one', () => {
    expect(quizDuration(quizDefaults)).toBeGreaterThan(quizDuration({ ...quizDefaults, explanation: '' }) + 2);
  });

  it('ticks once per countdown second', () => {
    const ticks = quizCues({ ...quizDefaults, pace: 'standard' }).filter((c) => c.sfx === 'tick');
    expect(ticks).toHaveLength(7);
  });
});

describe('true / false', () => {
  it('validates labels and statement', () => {
    expect(trueFalseSchema.safeParse(trueFalseDefaults).success).toBe(true);
    expect(trueFalseSchema.safeParse({ ...trueFalseDefaults, trueLabel: '' }).success).toBe(false);
    expect(trueFalseSchema.safeParse({ ...trueFalseDefaults, statement: '' }).success).toBe(false);
    expect(trueFalseSchema.safeParse({ ...trueFalseDefaults, answer: 'yes' }).success).toBe(false);
  });

  it('duration follows pace and explanation', () => {
    expect(trueFalseDuration({ ...trueFalseDefaults, pace: 'relaxed' }) - trueFalseDuration({ ...trueFalseDefaults, pace: 'quick' })).toBeCloseTo(5, 5);
    expect(trueFalseDuration({ ...trueFalseDefaults, explanation: '' })).toBeLessThan(trueFalseDuration(trueFalseDefaults));
    expect(trueFalseCues(trueFalseDefaults).some((c) => c.sfx === 'correct')).toBe(true);
  });
});

describe('top 5', () => {
  it('needs 3–5 items', () => {
    expect(top5Schema.safeParse(top5Defaults).success).toBe(true);
    expect(top5Schema.safeParse({ ...top5Defaults, items: top5Defaults.items.slice(0, 2) }).success).toBe(false);
    expect(top5Schema.safeParse({ ...top5Defaults, items: [...top5Defaults.items, { text: 'x', detail: '' }] }).success).toBe(false);
  });

  it('gets longer with each item and with a slower pace', () => {
    const three = { ...top5Defaults, items: top5Defaults.items.slice(0, 3) };
    expect(top5Duration(top5Defaults)).toBeGreaterThan(top5Duration(three));
    expect(top5Duration({ ...top5Defaults, pace: 'relaxed' })).toBeGreaterThan(top5Duration({ ...top5Defaults, pace: 'quick' }));
  });

  it('reveals the winner last', () => {
    const cues = top5Cues(top5Defaults);
    const reveal = cues.find((c) => c.sfx === 'reveal');
    expect(reveal?.t).toBe(Math.max(...cues.filter((c) => c.sfx !== 'correct').map((c) => c.t)));
  });
});

describe('word of the day', () => {
  it('validates required fields', () => {
    expect(wordOfDaySchema.safeParse(wordOfDayDefaults).success).toBe(true);
    expect(wordOfDaySchema.safeParse({ ...wordOfDayDefaults, word: '' }).success).toBe(false);
    expect(wordOfDaySchema.safeParse({ ...wordOfDayDefaults, definition: '' }).success).toBe(false);
  });

  it('skips optional layers in the duration', () => {
    const minimal = { ...wordOfDayDefaults, ipa: '', partOfSpeech: '', example: '', translation: '' };
    expect(wordOfDayDuration(minimal)).toBeLessThan(wordOfDayDuration(wordOfDayDefaults));
  });

  it('matches the target word and simple inflections', () => {
    const run = targetMatcher('make');
    expect(run('make')).toBe(true);
    expect(run('making')).toBe(true);
    expect(run('makes')).toBe(true);
    expect(run('mark')).toBe(false);
    const study = targetMatcher('study');
    expect(study('studied')).toBe(true);
    expect(targetMatcher('give up')('up')).toBe(true);
    expect(targetMatcher('يتعلّم')('يتعلّم')).toBe(true);
  });
});
