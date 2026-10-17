import { OLLAMA } from '@/config';
import { generationModelOptions, resolveModel, baseName, type ModelOption, type OllamaTag } from './models';

/**
 * Minimal client for a local Ollama server. Browser fetch failures look the
 * same whether Ollama is down or blocking the page (CORS), so failures are
 * classified with a second, opaque `no-cors` request: if that one succeeds
 * the server is up and the problem is CORS.
 */

export type OllamaErrorKind = 'not-running' | 'cors' | 'model-missing' | 'timeout' | 'bad-response' | 'http';

export class OllamaError extends Error {
  constructor(
    readonly kind: OllamaErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface OllamaClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export const normaliseBaseUrl = (url: string): string => (url.trim() || OLLAMA.baseUrl).replace(/\/+$/, '');

/** fetch with a timeout and an optional outer AbortSignal. */
async function request(url: string, init: RequestInit, opts: OllamaClientOptions, signal?: AbortSignal): Promise<Response> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), opts.timeoutMs ?? OLLAMA.generation.requestTimeoutMs);
  const onAbort = (): void => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (controller.signal.aborted) throw new OllamaError('timeout', 'Ollama did not answer in time');
    // Network-level failure: down, or blocked by CORS?
    const reachable = await fetchImpl(url.replace(/\/api\/.*$/, '/'), { mode: 'no-cors' }).then(
      () => true,
      () => false,
    );
    throw new OllamaError(reachable ? 'cors' : 'not-running', reachable ? 'Ollama blocked this page (CORS)' : 'Ollama is not running');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function listModels(opts: OllamaClientOptions = {}, signal?: AbortSignal): Promise<OllamaTag[]> {
  const base = normaliseBaseUrl(opts.baseUrl ?? OLLAMA.baseUrl);
  const res = await request(`${base}/api/tags`, { method: 'GET' }, { timeoutMs: 8000, ...opts }, signal);
  if (!res.ok) throw new OllamaError('http', `Ollama answered ${res.status}`, res.status);
  const body = (await res.json().catch(() => null)) as { models?: unknown } | null;
  if (!body || !Array.isArray(body.models)) throw new OllamaError('bad-response', 'Unexpected /api/tags response');
  return body.models.filter((m): m is OllamaTag => typeof m === 'object' && m !== null && typeof (m as OllamaTag).name === 'string');
}

export type ConnectionResult =
  | {
      ok: true;
      options: ModelOption[];
      /** Model that will be used. */
      model: string;
      /** Set when the saved model isn't installed (the UI shows the pull command). */
      missingModel?: string;
    }
  | { ok: false; error: OllamaErrorKind; options: ModelOption[] };

/** Lists generation models and picks the one to use. */
export async function testConnection(preferredModel: string, opts: OllamaClientOptions = {}, signal?: AbortSignal): Promise<ConnectionResult> {
  try {
    const options = generationModelOptions(await listModels(opts, signal));
    const model = resolveModel(preferredModel, options);
    if (!model) return { ok: false, error: 'model-missing', options };
    const missing = preferredModel && baseName(preferredModel) !== model ? baseName(preferredModel) : undefined;
    return missing ? { ok: true, options, model, missingModel: missing } : { ok: true, options, model };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { ok: false, error: err instanceof OllamaError ? err.kind : 'not-running', options: [] };
  }
}

export interface ChatRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  /** JSON Schema for structured output. */
  format: Record<string, unknown>;
  temperature?: number;
}

export interface ChatResponse {
  content: string;
  /** Tokens generated, when Ollama reports it. */
  evalCount?: number;
}

/**
 * POST /api/chat with structured output. The body is sent as text/plain so
 * the browser makes a "simple" request (no CORS preflight); Ollama parses it
 * as JSON regardless.
 */
export async function chat(req: ChatRequest, opts: OllamaClientOptions = {}, signal?: AbortSignal): Promise<ChatResponse> {
  const base = normaliseBaseUrl(opts.baseUrl ?? OLLAMA.baseUrl);
  const body = JSON.stringify({
    model: req.model,
    messages: req.messages,
    format: req.format,
    stream: false,
    keep_alive: '5m',
    options: { temperature: req.temperature ?? OLLAMA.generation.temperature },
  });
  const res = await request(`${base}/api/chat`, { method: 'POST', body }, opts, signal);
  const payload = (await res.json().catch(() => null)) as { message?: { content?: unknown }; error?: unknown; eval_count?: unknown } | null;
  if (!res.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `Ollama answered ${res.status}`;
    if (res.status === 404 || /not found|pull/i.test(message)) throw new OllamaError('model-missing', message, res.status);
    throw new OllamaError('http', message, res.status);
  }
  const content = payload?.message?.content;
  if (typeof content !== 'string') throw new OllamaError('bad-response', 'Ollama returned no message');
  return { content, evalCount: typeof payload?.eval_count === 'number' ? payload.eval_count : undefined };
}
