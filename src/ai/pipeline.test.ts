import { describe, expect, it, vi } from 'vitest';
import { OLLAMA } from '@/config';
import { analyze } from '@/engine/analyze';
import { parseTextBlocks } from '@/engine/reader';
import { getFormat } from '@/formats/registry';
import { migrateSettings, useSettings } from '@/state/settings';
import { ENGLISH_LESSON, FRENCH_LESSON } from '../../tests/fixtures/lessons';
import { corsCommands, pullCommand } from './help';
import { defaultCountFor, parseInstructions } from './instructions';
import { MockGenerator } from './mockGenerator';
import { listModels, OllamaError, testConnection, type FetchLike } from './ollama';
import { runGeneration } from './pipeline';
import { prepareDocument } from './prepare';
import { retrievePassages } from './retrieval';
import { RuleBasedGenerator } from './ruleBasedGenerator';
import type { GeneratedItem } from './types';

const doc = (text: string, name = 'lesson.md') => ({ name, blocks: parseTextBlocks(text, true) });

describe('instructions', () => {
  it('extracts the count and keeps the topic words', () => {
    expect(parseInstructions('5 quiz questions on the past tense')).toEqual({ count: 5, topic: 'past tense' });
    expect(parseInstructions('three true or false statements about deadlines')).toEqual({ count: 3, topic: 'or deadlines' });
    expect(parseInstructions('cinq questions sur le marché')).toEqual({ count: 5, topic: 'marché' });
    expect(parseInstructions('phrasal verbs')).toEqual({ count: 3, topic: 'phrasal verbs' });
  });

  it('reads "top 5" as the ranking length, not the number of videos', () => {
    expect(parseInstructions('top 5 words about the train', defaultCountFor('top5'))).toEqual({ count: 1, topic: 'train' });
    expect(parseInstructions('2 top 5 lists about travel', defaultCountFor('top5'))).toEqual({ count: 2, topic: 'lists travel' });
    expect(defaultCountFor('quiz')).toBe(3);
  });

  it('caps the count', () => {
    expect(parseInstructions('50 questions').count).toBe(5);
    expect(parseInstructions('').count).toBe(3);
  });
});

describe('retrieval', () => {
  const a = analyze(doc(ENGLISH_LESSON), null);

  it('selects the section named in the topic first', () => {
    const passages = retrievePassages(a, 'phrasal verbs', 6);
    expect(passages.length).toBeGreaterThan(0);
    expect(passages.every((p) => p.heading === 'Phrasal verbs')).toBe(true);
  });

  it('ranks passages by BM25 for a free-text topic', () => {
    const passages = retrievePassages(a, 'deadline', 3);
    expect(passages[0]?.text.toLowerCase()).toContain('deadline');
  });

  it('returns key-term passages when there is no topic, never more than k', () => {
    const passages = retrievePassages(a, '', 4);
    expect(passages).toHaveLength(4);
    expect(new Set(passages.map((p) => p.id)).size).toBe(4);
  });
});

describe('rule-based generator', () => {
  it('prepares valid fallback candidates with their supporting sentence', () => {
    const prepared = prepareDocument(doc(ENGLISH_LESSON), { formatId: 'quiz', count: 3, topic: '' }, null);
    const passages = new Set(analyze(doc(ENGLISH_LESSON), null).passages.map((p) => p.text));
    expect(prepared.lang).toBe('en');
    expect(prepared.ruleItems.length).toBeGreaterThanOrEqual(3);
    const quiz = getFormat('quiz');
    for (const item of prepared.ruleItems) {
      expect(quiz?.schema.safeParse(item.data).success).toBe(true);
      expect(item.origin).toBe('rules');
      if (item.supportingSentence) expect(passages.has(item.supportingSentence)).toBe(true);
    }
  });

  it('reports what it could not make', async () => {
    const gen = new RuleBasedGenerator([]);
    const outcome = await gen.generate({ formatId: 'quiz', count: 2, instructions: '', topic: '', passages: [], lang: 'en', level: 'B1' });
    expect(outcome).toEqual({ items: [], failures: ['insufficient', 'insufficient'] });
  });
});

describe('generation pipeline (primary + fallback)', () => {
  const prepared = prepareDocument(doc(ENGLISH_LESSON), { formatId: 'quiz', count: 3, topic: 'deadline' }, null);
  const base = { prepared, formatId: 'quiz', count: 3, instructions: '3 questions on deadlines', topic: 'deadline', level: 'B1' as const };
  const llmItem = (n: number): GeneratedItem => ({
    formatId: 'quiz',
    data: { ...(prepared.ruleItems[0]?.data as object), question: `LLM question ${n}?` },
    supportingSentence: prepared.passages[0]?.text ?? '',
    source: 'p. 1',
    origin: 'llm',
    attempts: 1,
    model: 'mock-model',
  });

  it('uses only the rule-based engine when no model is configured, and says why', async () => {
    const result = await runGeneration({ ...base, primary: null });
    expect(result.items).toHaveLength(3);
    expect(result.items.every((i) => i.origin === 'rules' && i.fallbackReason === 'not-configured')).toBe(true);
    expect(result.usedFallback).toBe(true);
  });

  it('keeps model items and fills the gaps from the fallback with the reason', async () => {
    const primary = new MockGenerator([{ items: [llmItem(1)], failures: ['ungrounded', 'invalid'] }]);
    const seen: GeneratedItem[] = [];
    const result = await runGeneration({ ...base, primary, onItem: (i) => seen.push(i) });
    expect(result.items.map((i) => i.origin)).toEqual(['llm', 'rules', 'rules']);
    expect(result.items.slice(1).map((i) => i.fallbackReason)).toEqual(['ungrounded', 'invalid']);
    expect(seen).toHaveLength(3);
    expect(primary.calls[0]?.passages).toEqual(prepared.passages);
  });

  it('falls back entirely when the model is unreachable', async () => {
    const primary = new MockGenerator([new OllamaError('not-running', 'down')]);
    const result = await runGeneration({ ...base, primary });
    expect(result.primaryError).toBe('not-running');
    expect(result.items.every((i) => i.fallbackReason === 'not-running')).toBe(true);
  });

  it('does not add fallback items when the model delivers everything', async () => {
    const primary = new MockGenerator([{ items: [llmItem(1), llmItem(2), llmItem(3)], failures: [] }]);
    const result = await runGeneration({ ...base, primary });
    expect(result.usedFallback).toBe(false);
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    const primary = new MockGenerator([
      () => {
        controller.abort();
        throw new DOMException('Cancelled', 'AbortError');
      },
    ]);
    await expect(runGeneration({ ...base, primary, signal: controller.signal })).rejects.toThrow();
  });

  it('works for French documents too', async () => {
    const fr = prepareDocument(doc(FRENCH_LESSON), { formatId: 'word-of-the-day', count: 2, topic: '' }, null);
    const result = await runGeneration({ ...base, prepared: fr, formatId: 'word-of-the-day', count: 2, primary: null });
    expect(fr.lang).toBe('fr');
    expect(result.items).toHaveLength(2);
  });
});

describe('Ollama client', () => {
  const tags = { models: [{ name: 'nomic-embed-text:latest', details: { family: 'nomic-bert' } }, { name: 'qwen2.5:3b', details: { family: 'qwen2', parameter_size: '3.1B' } }] };
  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('lists models and picks the default', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => json(tags));
    expect((await listModels({ fetchImpl })).map((m) => m.name)).toEqual(['nomic-embed-text:latest', 'qwen2.5:3b']);
    const result = await testConnection('qwen2.5:3b', { fetchImpl });
    expect(result).toMatchObject({ ok: true, model: 'qwen2.5:3b' });
    expect(result.options.map((o) => o.id)).toEqual(['qwen2.5:3b']);
  });

  it('reports a missing saved model with the pull command available', async () => {
    const result = await testConnection('llama3.2:1b', { fetchImpl: async () => json(tags) });
    expect(result).toMatchObject({ ok: true, model: 'qwen2.5:3b', missingModel: 'llama3.2:1b' });
    expect(pullCommand('llama3.2:1b')).toBe('ollama pull llama3.2:1b');
  });

  it('tells "not running" apart from "blocked by CORS"', async () => {
    const down: FetchLike = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await testConnection('qwen2.5:3b', { fetchImpl: down })).toMatchObject({ ok: false, error: 'not-running' });

    const blocked: FetchLike = async (_url, init) => {
      if (init?.mode === 'no-cors') return new Response(null, { status: 200 });
      throw new TypeError('Failed to fetch');
    };
    expect(await testConnection('qwen2.5:3b', { fetchImpl: blocked })).toMatchObject({ ok: false, error: 'cors' });
  });

  it('times out', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    await expect(listModels({ fetchImpl: hang, timeoutMs: 20 })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('reports when only embedding models are installed', async () => {
    const result = await testConnection('qwen2.5:3b', { fetchImpl: async () => json({ models: [tags.models[0]] }) });
    expect(result).toMatchObject({ ok: false, error: 'model-missing' });
  });

  it('gives exact CORS commands for each platform', () => {
    const c = corsCommands('http://localhost:5173');
    expect(c.windows).toContain('setx OLLAMA_ORIGINS "http://localhost:5173"');
    expect(c.macos).toContain('launchctl setenv OLLAMA_ORIGINS "http://localhost:5173"');
    expect(c.linux).toContain('Environment="OLLAMA_ORIGINS=http://localhost:5173"');
  });
});

describe('settings', () => {
  it('defaults to the configured Ollama server, model and B1', () => {
    const s = useSettings.getState();
    expect(s.ollamaUrl).toBe(OLLAMA.baseUrl);
    expect(s.ollamaModel).toBe(OLLAMA.defaultModel);
    expect(s.level).toBe('B1');
  });

  it('migrates old settings and drops the old API key', () => {
    const migrated = migrateSettings({ locale: 'fr', apiKey: 'sk-ant-old', aiModel: 'claude-opus-5-5' });
    expect(migrated).toEqual({ locale: 'fr', ollamaUrl: OLLAMA.baseUrl, ollamaModel: OLLAMA.defaultModel, level: 'B1' });
  });
});
