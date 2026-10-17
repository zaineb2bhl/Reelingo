import { OLLAMA, type ModelRole } from '@/config';

/** The parts of an Ollama `/api/tags` entry we use. */
export interface OllamaTag {
  name: string;
  details?: {
    family?: string;
    families?: string[] | null;
    parameter_size?: string;
  };
}

export interface ModelOption {
  id: string;
  /** Known role from config, or 'other' for models we don't list (e.g. a bigger model added later). */
  role: ModelRole | 'other';
  /** e.g. "3.1B", when Ollama reports it. */
  size?: string;
}

const EMBEDDING_FAMILIES: ReadonlySet<string> = new Set(OLLAMA.embeddingFamilies);

/** Names without the default ":latest" tag, so "nomic-embed-text" matches "nomic-embed-text:latest". */
export const baseName = (name: string): string => name.replace(/:latest$/, '');

/** Embedding-only models can't generate text, so they never appear in the generation dropdown. */
export function isEmbeddingModel(tag: OllamaTag): boolean {
  const families = [tag.details?.family, ...(tag.details?.families ?? [])].filter((f): f is string => !!f);
  if (families.some((f) => EMBEDDING_FAMILIES.has(f.toLowerCase()))) return true;
  const name = baseName(tag.name).toLowerCase();
  return name === OLLAMA.embeddingModel || /(^|[-_/])embed/.test(name);
}

const ROLE_ORDER: Record<ModelOption['role'], number> = { default: 0, light: 1, comparison: 2, other: 3, 'not-recommended': 4 };

function roleOf(name: string): ModelOption['role'] {
  const id = baseName(name);
  return OLLAMA.models.find((m) => m.id === id)?.role ?? 'other';
}

/** Generation models from `/api/tags`: embeddings removed, known models first, unknown ones still usable. */
export function generationModelOptions(tags: readonly OllamaTag[]): ModelOption[] {
  const known = OLLAMA.models.map((m) => m.id as string);
  return tags
    .filter((t) => !isEmbeddingModel(t))
    .map((t) => ({ id: baseName(t.name), role: roleOf(t.name), size: t.details?.parameter_size }))
    .sort((a, b) => {
      const byRole = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      if (byRole) return byRole;
      const ia = known.indexOf(a.id);
      const ib = known.indexOf(b.id);
      if (ia !== -1 && ib !== -1) return ia - ib;
      return a.id.localeCompare(b.id);
    });
}

/**
 * The model to use: the user's choice if installed, else the configured
 * default, else the best installed option. Undefined when none is installed.
 */
export function resolveModel(preferred: string | undefined, options: readonly ModelOption[]): string | undefined {
  const installed = (id: string | undefined): boolean => !!id && options.some((o) => o.id === baseName(id));
  if (preferred && installed(preferred)) return baseName(preferred);
  if (installed(OLLAMA.defaultModel)) return OLLAMA.defaultModel;
  return options.find((o) => o.role !== 'not-recommended')?.id ?? options[0]?.id;
}

/** Keeps the per-request batch within what small models handle reliably. */
export function clampBatchSize(n: number): number {
  const { minBatchSize, maxBatchSize } = OLLAMA.generation;
  if (!Number.isFinite(n)) return OLLAMA.generation.batchSize;
  return Math.min(maxBatchSize, Math.max(minBatchSize, Math.round(n)));
}
