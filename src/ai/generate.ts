import type AnthropicSdk from '@anthropic-ai/sdk';
import type { z } from 'zod';
import type { AnyFormat } from '@/formats/types';
import type { AiModelId } from '@/state/settings';
import { buildRetryNote, buildUserPrompt, SYSTEM_PROMPT } from './prompt';

export type AiErrorKind = 'noKey' | 'auth' | 'rateLimit' | 'overloaded' | 'network' | 'refusal' | 'invalid' | 'unknown';

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export interface GenerateOptions {
  apiKey: string;
  model: AiModelId;
  signal?: AbortSignal;
}

/** Maps SDK errors to user-facing error kinds; returns null for non-API errors. */
export function toAiError(sdk: typeof AnthropicSdk, err: unknown): AiError | null {
  if (err instanceof AiError) return err;
  if (err instanceof sdk.AuthenticationError || err instanceof sdk.PermissionDeniedError) return new AiError('auth', err.message);
  if (err instanceof sdk.RateLimitError) return new AiError('rateLimit', err.message);
  if (err instanceof sdk.InternalServerError) return new AiError('overloaded', err.message);
  if (err instanceof sdk.APIConnectionError) return new AiError('network', err.message);
  if (err instanceof sdk.APIError) return new AiError('unknown', err.message);
  return null;
}

/** Formats Zod issues as short bullet lines for the retry prompt. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 12)
    .map((i) => `- ${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('\n');
}

/**
 * Asks Claude for content matching the format's Zod schema, validates it with
 * that schema and retries once (with the validation errors) if needed.
 * The SDK is loaded on demand so it never weighs down the main bundle.
 */
export async function generateFormatData(format: AnyFormat, topic: string, opts: GenerateOptions): Promise<unknown> {
  if (!opts.apiKey) throw new AiError('noKey', 'No API key');
  const [{ default: Anthropic }, { betaZodOutputFormat }] = await Promise.all([import('@anthropic-ai/sdk'), import('@anthropic-ai/sdk/helpers/beta/zod')]);

  // The key is the user's own, entered in Settings and kept in this browser.
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const userPrompt = buildUserPrompt(format, topic, format.defaults);
  let feedback: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let candidate: unknown = null;
    try {
      const response = await client.beta.messages.parse(
        {
          model: opts.model,
          max_tokens: 16000,
          // Retry on a fallback model if the request is declined for policy reasons.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'medium', format: betaZodOutputFormat(format.schema) },
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: feedback ? `${userPrompt}\n\n${buildRetryNote(feedback)}` : userPrompt }],
        },
        { signal: opts.signal },
      );
      if (response.stop_reason === 'refusal') throw new AiError('refusal', response.stop_details?.explanation ?? 'Request declined');
      candidate = response.parsed_output;
    } catch (err) {
      const apiError = toAiError(Anthropic, err);
      if (apiError) throw apiError;
      if (opts.signal?.aborted) throw err;
      // Anything else is a parsing / schema failure of the model output: retry.
      feedback = err instanceof Error ? `- ${err.message}` : '- The response was not valid JSON for the schema.';
      continue;
    }

    const checked = format.schema.safeParse(candidate);
    if (checked.success) return checked.data;
    feedback = describeIssues(checked.error);
  }
  throw new AiError('invalid', feedback ?? 'Invalid response');
}
