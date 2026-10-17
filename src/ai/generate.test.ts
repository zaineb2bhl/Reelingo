import { beforeEach, describe, expect, it, vi } from 'vitest';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { allFormats, getFormat } from '@/formats/registry';
import { quizDefaults } from '@/formats/quiz/schema';
import { AiError, generateFormatData } from './generate';

const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class RateLimitError extends APIError {}
  class InternalServerError extends APIError {}
  class APIConnectionError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    static PermissionDeniedError = PermissionDeniedError;
    static RateLimitError = RateLimitError;
    static InternalServerError = InternalServerError;
    static APIConnectionError = APIConnectionError;
    beta = { messages: { parse: parseMock } };
  }
  return { default: Anthropic };
});

const quiz = getFormat('quiz');
if (!quiz) throw new Error('quiz format missing');
const opts = { apiKey: 'sk-test', model: 'claude-opus-5-5' as const };
const reply = (parsed_output: unknown, stop_reason = 'end_turn') => ({ parsed_output, stop_reason, stop_details: null });

describe('AI fill', () => {
  beforeEach(() => parseMock.mockReset());

  it('returns validated data on the first try', async () => {
    parseMock.mockResolvedValueOnce(reply(quizDefaults));
    await expect(generateFormatData(quiz, 'present simple', opts)).resolves.toEqual(quizDefaults);
    expect(parseMock).toHaveBeenCalledTimes(1);
    const params = parseMock.mock.calls[0]?.[0] as { model: string; fallbacks: string; output_config: { format: unknown } };
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.fallbacks).toBe('default');
    expect(params.output_config.format).toBeTruthy();
  });

  it('retries once with the validation errors', async () => {
    const noCorrect = { ...quizDefaults, options: quizDefaults.options.map((o) => ({ ...o, correct: false })) };
    parseMock.mockResolvedValueOnce(reply(noCorrect)).mockResolvedValueOnce(reply(quizDefaults));
    await expect(generateFormatData(quiz, 'present simple', opts)).resolves.toEqual(quizDefaults);
    expect(parseMock).toHaveBeenCalledTimes(2);
    const retry = parseMock.mock.calls[1]?.[0] as { messages: Array<{ content: string }> };
    expect(retry.messages[0]?.content).toContain('did not pass validation');
    expect(retry.messages[0]?.content).toContain('options');
  });

  it('retries when the SDK cannot parse the output', async () => {
    parseMock.mockRejectedValueOnce(new SyntaxError('Unexpected token')).mockResolvedValueOnce(reply(quizDefaults));
    await expect(generateFormatData(quiz, 'x', opts)).resolves.toEqual(quizDefaults);
  });

  it('gives up after the retry', async () => {
    parseMock.mockResolvedValue(reply({ question: '' }));
    await expect(generateFormatData(quiz, 'x', opts)).rejects.toMatchObject({ kind: 'invalid' });
    expect(parseMock).toHaveBeenCalledTimes(2);
  });

  it('reports refusals and missing keys', async () => {
    parseMock.mockResolvedValueOnce(reply(null, 'refusal'));
    await expect(generateFormatData(quiz, 'x', opts)).rejects.toMatchObject({ kind: 'refusal' });
    await expect(generateFormatData(quiz, 'x', { ...opts, apiKey: '' })).rejects.toBeInstanceOf(AiError);
  });

  it('can express every format schema as a structured output format', () => {
    for (const format of allFormats) expect(() => betaZodOutputFormat(format.schema)).not.toThrow();
  });
});
