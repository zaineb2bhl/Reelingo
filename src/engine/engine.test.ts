import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { getFormat } from '@/formats/registry';
import { ARABIC_LESSON, ENGLISH_LESSON, FRENCH_LESSON } from '../../tests/fixtures/lessons';
import { analyze, computeFocus, stripArticle } from './analyze';
import { generateSeries } from './index';
import { createLexicon, type Lexicon } from './lexicon';
import { parseHtmlBlocks, parseTextBlocks, pdfLinesToBlocks } from './reader';
import { Bm25 } from './search';
import { detectLang, splitSentences, stem } from './text';
import type { SourceDocument } from './types';

let lexicon: Lexicon;

beforeAll(() => {
  const dir = join(process.cwd(), 'public', 'lexicon');
  if (!existsSync(join(dir, 'en-defs.json'))) execFileSync('node', ['scripts/build-lexicon.mjs']);
  lexicon = createLexicon({
    freq: readFileSync(join(dir, 'en-freq.txt'), 'utf8'),
    ipa: JSON.parse(readFileSync(join(dir, 'en-ipa.json'), 'utf8')) as Record<string, string>,
    defs: JSON.parse(readFileSync(join(dir, 'en-defs.json'), 'utf8')) as Record<string, Record<string, string>>,
  });
}, 120_000);

const md = (name: string, text: string): SourceDocument => ({ name, blocks: parseTextBlocks(text, true) });
const ALL = { quiz: 3, top5: 1, 'true-false': 2, 'word-of-the-day': 2 };

describe('reading documents', () => {
  it('parses markdown structure: headings, tables, list items, bold', () => {
    const blocks = parseTextBlocks('# Unit 1\n\n| Word | Meaning |\n|---|---|\n| cat | a small pet |\n\n- **run** – move fast\n\nPlain text here.', true);
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'row', 'row', 'item', 'paragraph']);
    expect(blocks[2]?.cells).toEqual(['cat', 'a small pet']);
    expect(blocks[3]?.strong).toEqual(['run']);
  });

  it('treats a run of "term – meaning" lines in plain text as list items, not headings', () => {
    const blocks = parseTextBlocks('Vocabulary\n\napple – pomme\npear – poire\n\nWe eat fruit every day.', false);
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'item', 'item', 'paragraph']);
  });

  it('parses Word HTML (mammoth output) including tables and bold terms', () => {
    const html = '<h1>Unit 2</h1><p>The <strong>deadline</strong> is Friday.</p><table><tr><td><p>colleague</p></td><td><p>a person you work with</p></td></tr></table><ul><li>set up – arrange</li></ul>';
    const blocks = parseHtmlBlocks(html);
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'row', 'item']);
    expect(blocks[1]?.strong).toEqual(['deadline']);
    expect(blocks[2]?.cells).toEqual(['colleague', 'a person you work with']);
  });

  it('rebuilds PDF paragraphs from lines and spots headings by size', () => {
    const blocks = pdfLinesToBlocks([
      { text: 'Unit 4: Travel', y: 800, height: 20, page: 1 },
      { text: 'We travel by train because it is fast and com-', y: 760, height: 11, page: 1 },
      { text: 'fortable. Trains are often on time.', y: 746, height: 11, page: 1 },
      { text: '• Pack light', y: 720, height: 11, page: 1 },
    ]);
    expect(blocks[0]).toMatchObject({ kind: 'heading', text: 'Unit 4: Travel' });
    expect(blocks[1]?.text).toBe('We travel by train because it is fast and comfortable. Trains are often on time.');
    expect(blocks[2]).toMatchObject({ kind: 'item', text: 'Pack light' });
  });
});

describe('text processing', () => {
  it('detects the document language', () => {
    expect(detectLang(ENGLISH_LESSON)).toBe('en');
    expect(detectLang(FRENCH_LESSON)).toBe('fr');
    expect(detectLang(ARABIC_LESSON)).toBe('ar');
  });

  it('splits sentences without breaking on abbreviations', () => {
    expect(splitSentences('Mr. Smith arrived at 8 a.m. today. He was late! Was he tired?')).toEqual(['Mr. Smith arrived at 8 a.m. today.', 'He was late!', 'Was he tired?']);
    expect(splitSentences('يذهب أحمد إلى المدرسة. هل يحب الدرس؟ نعم.')).toHaveLength(3);
  });

  it('stems inflected forms to the same key', () => {
    expect(stem('deadlines', 'en')).toBe(stem('deadline', 'en'));
    expect(stem('making', 'en')).toBe(stem('make', 'en'));
    expect(stem('carottes', 'fr')).toBe(stem('carotte', 'fr'));
    expect(stem('المكتبة', 'ar')).toBe(stem('مكتبة', 'ar'));
    expect(stripArticle('la pomme', 'fr')).toBe('pomme');
  });

  it('ranks passages with BM25', () => {
    const bm = new Bm25([['cat', 'sat'], ['dog', 'ran', 'dog'], ['cat', 'dog']]);
    expect(bm.search(['dog'])[0]?.[0]).toBe(1);
    expect(bm.search(['bird'])).toEqual([]);
  });
});

describe('analysis', () => {
  it('finds the glossary with definitions and translations from a table', () => {
    const a = analyze(md('en.md', ENGLISH_LESSON), lexicon);
    const deadline = a.terms.find((t) => t.display === 'deadline');
    expect(deadline).toMatchObject({ definition: 'the time by which a task must be finished', translation: 'date limite', definitionSource: 'document' });
    expect(a.terms.find((t) => t.display === 'put off')?.definition).toBe('to delay doing something');
  });

  it('ranks lesson vocabulary above everyday words', () => {
    const a = analyze(md('en.md', ENGLISH_LESSON), lexicon);
    const top = a.terms.slice(0, 10).map((t) => t.display);
    expect(top).toContain('deadline');
    expect(top).not.toContain('team');
  });

  it('uses dictionary definitions and IPA for English words not defined in the text', () => {
    const a = analyze(md('en.md', ENGLISH_LESSON), lexicon);
    expect(a.terms.find((t) => t.display === 'productivity')?.definitionSource).toBe('dictionary');
    expect(lexicon.ipa('computer')).toBe('kəmˈpjutɚ');
  });

  it('focuses on the section named in the instructions', () => {
    const a = analyze(md('en.md', ENGLISH_LESSON), lexicon);
    const { focus, matched } = computeFocus('phrasal verbs', a.passages, a.sections, 'en');
    expect(matched).toBe(true);
    const sections = new Set([...focus].map((id) => a.sections[a.passages[id]?.section ?? 0]?.heading));
    expect([...sections]).toEqual(['Phrasal verbs']);
  });

  it('reports when instructions match nothing', () => {
    const result = generateSeries(md('en.md', ENGLISH_LESSON), { counts: { quiz: 1 }, query: 'astrophysics quasar' }, lexicon);
    expect(result.matchedQuery).toBe(false);
    expect(result.videos.length).toBe(1);
  });
});

describe.each([
  ['English', 'en', ENGLISH_LESSON],
  ['French', 'fr', FRENCH_LESSON],
  ['Arabic', 'ar', ARABIC_LESSON],
])('series from a %s lesson', (_name, lang, text) => {
  it('creates every requested video, each valid for its template', () => {
    const result = generateSeries(md(`${lang}.md`, text), { counts: ALL, query: '' }, lang === 'en' ? lexicon : null);
    expect(result.lang).toBe(lang);
    expect(result.shortfalls).toEqual([]);
    expect(result.videos).toHaveLength(8);
    for (const video of result.videos) {
      const format = getFormat(video.formatId);
      expect(format, video.formatId).toBeDefined();
      expect(format?.schema.safeParse(video.data).success, `${video.formatId}: ${JSON.stringify(video.data)}`).toBe(true);
      expect(video.source.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic and never repeats a word of the day', () => {
    const doc = md(`${lang}.md`, text);
    const a = generateSeries(doc, { counts: ALL, query: '' }, lang === 'en' ? lexicon : null);
    const b = generateSeries(doc, { counts: ALL, query: '' }, lang === 'en' ? lexicon : null);
    expect(JSON.stringify(a.videos)).toBe(JSON.stringify(b.videos));
    const words = a.videos.filter((v) => v.formatId === 'word-of-the-day').map((v) => (v.data as { word: string }).word);
    expect(new Set(words).size).toBe(words.length);
  });

  it('only builds questions from sentences that are in the document', () => {
    const result = generateSeries(md(`${lang}.md`, text), { counts: { quiz: 3 }, query: '' }, lang === 'en' ? lexicon : null);
    for (const v of result.videos) {
      const q = (v.data as { question: string }).question;
      if (!q.includes('_____')) continue;
      const answer = (v.data as { options: Array<{ text: string; correct: boolean }> }).options.find((o) => o.correct)?.text ?? '';
      expect(text).toContain(q.replace('*_____*', answer));
    }
  });
});

describe('small documents', () => {
  it('reports shortfalls instead of inventing content', () => {
    const result = generateSeries(md('tiny.md', 'Cats sleep a lot.'), { counts: { quiz: 3, 'word-of-the-day': 2 }, query: '' }, lexicon);
    expect(result.shortfalls.length).toBeGreaterThan(0);
  });
});
