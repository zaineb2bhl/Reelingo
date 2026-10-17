/** Product name lives here so it is trivial to rename. */
export const APP_NAME = 'Reelingo';

export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
} as const;

/**
 * Area that stays clear of the platform UI overlays (captions, buttons,
 * profile row) on Reels / TikTok / Shorts. Formats keep key content inside it.
 */
export const SAFE = {
  top: 230,
  bottom: VIDEO.height - 400,
  left: 90,
  right: VIDEO.width - 90,
} as const;

export const SAFE_WIDTH = SAFE.right - SAFE.left;
export const SAFE_HEIGHT = SAFE.bottom - SAFE.top;

/**
 * Role of a known generation model in the settings dropdown.
 * Models not listed here (e.g. a later `qwen2.5:7b`) still work; they are shown as "other".
 */
export type ModelRole = 'default' | 'light' | 'comparison' | 'not-recommended';

/**
 * Local LLM settings (Ollama). Everything model-specific lives here so that
 * adding a bigger model later is a one-line change, or no change at all.
 */
export const OLLAMA = {
  baseUrl: 'http://localhost:11434',
  /** Generation models we know about, in dropdown order. */
  models: [
    { id: 'qwen2.5:3b', role: 'default' },
    { id: 'qwen2.5:1.5b', role: 'light' },
    { id: 'llama3.2:1b', role: 'comparison' },
    { id: 'tinyllama:1.1b', role: 'not-recommended' },
  ] as const satisfies readonly { id: string; role: ModelRole }[],
  defaultModel: 'qwen2.5:3b',
  /** Embedding model, reserved for optional hybrid retrieval (/api/embed). Never used to generate text. */
  embeddingModel: 'nomic-embed-text',
  /** Model families that only produce embeddings; filtered out of the generation dropdown. */
  embeddingFamilies: ['bert', 'nomic-bert'] as const,
  generation: {
    temperature: 0.2,
    /** Items requested per call. Small models stay reliable with 1-3. */
    batchSize: 2,
    minBatchSize: 1,
    maxBatchSize: 3,
    /** Retrieved passages sent per request (never the whole document). */
    maxPassages: 6,
    /** Few-shot examples per format in each prompt. */
    fewShotExamples: 1,
    /** One retry with the validation errors, then the rule-based fallback. */
    retries: 1,
    requestTimeoutMs: 90_000,
  },
  /** Models compared against the rule-based baseline by `npm run eval`. */
  evalModels: ['qwen2.5:3b', 'qwen2.5:1.5b', 'llama3.2:1b'] as const,
} as const;

/** Document path: how many videos one instruction can ask for. */
export const DOCUMENT_GENERATION = {
  defaultCount: 3,
  maxCount: 5,
  /** Passages retrieved per run; each request sends at most OLLAMA.generation.maxPassages of them. */
  retrievedPassages: 12,
} as const;
