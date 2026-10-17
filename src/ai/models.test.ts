import { describe, expect, it } from 'vitest';
import { OLLAMA } from '@/config';
import { clampBatchSize, generationModelOptions, isEmbeddingModel, resolveModel, type OllamaTag } from './models';

// What `/api/tags` returns on the development machine.
const INSTALLED: OllamaTag[] = [
  { name: 'nomic-embed-text:latest', details: { family: 'nomic-bert', families: ['nomic-bert'], parameter_size: '137M' } },
  { name: 'qwen2.5:3b', details: { family: 'qwen2', families: ['qwen2'], parameter_size: '3.1B' } },
  { name: 'qwen2.5:1.5b', details: { family: 'qwen2', families: ['qwen2'], parameter_size: '1.5B' } },
  { name: 'llama3.2:1b', details: { family: 'llama', families: ['llama'], parameter_size: '1.2B' } },
  { name: 'tinyllama:1.1b', details: { family: 'llama', families: ['llama'], parameter_size: '1B' } },
];

describe('model configuration', () => {
  it('defaults to qwen2.5:3b with the agreed options', () => {
    expect(OLLAMA.defaultModel).toBe('qwen2.5:3b');
    expect(OLLAMA.models.map((m) => [m.id, m.role])).toEqual([
      ['qwen2.5:3b', 'default'],
      ['qwen2.5:1.5b', 'light'],
      ['llama3.2:1b', 'comparison'],
      ['tinyllama:1.1b', 'not-recommended'],
    ]);
    expect(OLLAMA.evalModels).toEqual(['qwen2.5:3b', 'qwen2.5:1.5b', 'llama3.2:1b']);
    expect(OLLAMA.embeddingModel).toBe('nomic-embed-text');
  });

  it('keeps generation settings suited to small models', () => {
    const g = OLLAMA.generation;
    expect(g.batchSize).toBeGreaterThanOrEqual(g.minBatchSize);
    expect(g.batchSize).toBeLessThanOrEqual(g.maxBatchSize);
    expect(g.maxBatchSize).toBeLessThanOrEqual(3);
    expect(g.fewShotExamples).toBe(1);
    expect(g.temperature).toBeCloseTo(0.2);
  });
});

describe('generation model dropdown', () => {
  it('filters out the embedding model', () => {
    expect(isEmbeddingModel(INSTALLED[0] as OllamaTag)).toBe(true);
    expect(isEmbeddingModel({ name: 'mxbai-embed-large' })).toBe(true);
    expect(isEmbeddingModel(INSTALLED[1] as OllamaTag)).toBe(false);
    expect(generationModelOptions(INSTALLED).map((o) => o.id)).not.toContain('nomic-embed-text');
  });

  it('lists known models in order with their role, not-recommended last', () => {
    expect(generationModelOptions(INSTALLED)).toEqual([
      { id: 'qwen2.5:3b', role: 'default', size: '3.1B' },
      { id: 'qwen2.5:1.5b', role: 'light', size: '1.5B' },
      { id: 'llama3.2:1b', role: 'comparison', size: '1.2B' },
      { id: 'tinyllama:1.1b', role: 'not-recommended', size: '1B' },
    ]);
  });

  it('still offers a bigger model added later, without code changes', () => {
    const options = generationModelOptions([...INSTALLED, { name: 'qwen2.5:7b', details: { family: 'qwen2', parameter_size: '7.6B' } }]);
    expect(options.find((o) => o.id === 'qwen2.5:7b')).toEqual({ id: 'qwen2.5:7b', role: 'other', size: '7.6B' });
    expect(options.at(-1)?.id).toBe('tinyllama:1.1b');
    expect(resolveModel('qwen2.5:7b', options)).toBe('qwen2.5:7b');
  });
});

describe('choosing a model', () => {
  const options = generationModelOptions(INSTALLED);

  it('uses the saved choice when installed, else the default', () => {
    expect(resolveModel('llama3.2:1b', options)).toBe('llama3.2:1b');
    expect(resolveModel('llama3.1:8b', options)).toBe('qwen2.5:3b');
    expect(resolveModel(undefined, options)).toBe('qwen2.5:3b');
  });

  it('falls back to the best installed model, avoiding not-recommended ones', () => {
    const noDefault = options.filter((o) => o.id !== 'qwen2.5:3b');
    expect(resolveModel(undefined, noDefault)).toBe('qwen2.5:1.5b');
    expect(resolveModel(undefined, options.filter((o) => o.id === 'tinyllama:1.1b'))).toBe('tinyllama:1.1b');
    expect(resolveModel(undefined, [])).toBeUndefined();
  });

  it('keeps batches to 1-3 items', () => {
    expect(clampBatchSize(0)).toBe(1);
    expect(clampBatchSize(2)).toBe(2);
    expect(clampBatchSize(10)).toBe(3);
    expect(clampBatchSize(Number.NaN)).toBe(OLLAMA.generation.batchSize);
  });
});
