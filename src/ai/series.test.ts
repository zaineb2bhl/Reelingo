import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFormat } from '@/formats/registry';
import { quizDefaults } from '@/formats/quiz/schema';
import { DocumentError, documentBlock, documentKindOf, prepareDocument, toBase64 } from './document';
import { buildSeriesPrompt, generateSeriesForFormat } from './series';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

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
    beta = { messages: { create: createMock } };
  }
  return { default: Anthropic };
});

const quiz = getFormat('quiz');
if (!quiz) throw new Error('quiz format missing');
const opts = { apiKey: 'sk-test', model: 'claude-opus-5-5' as const };
const doc = { name: 'unit3.txt', kind: 'text' as const, data: 'Unit 3: present simple. He/she/it takes -s.' };
const reply = (videos: unknown[], stop_reason = 'end_turn') => ({ stop_reason, stop_details: null, content: [{ type: 'text', text: JSON.stringify({ videos }) }] });
const video = (question: string, source = 'p. 4') => ({ source, content: { ...quizDefaults, question } });

const textFile = (name: string, text: string, type = 'text/plain') => {
  const blob = new Blob([text], { type });
  return { name, type, size: blob.size, arrayBuffer: () => blob.arrayBuffer(), text: () => blob.text() };
};

describe('document preparation', () => {
  it('recognises supported files', () => {
    expect(documentKindOf({ name: 'a.PDF', type: '' })).toBe('pdf');
    expect(documentKindOf({ name: 'notes.docx', type: '' })).toBe('docx');
    expect(documentKindOf({ name: 'notes.md', type: '' })).toBe('text');
    expect(documentKindOf({ name: 'photo.png', type: 'image/png' })).toBeNull();
  });

  it('reads text files and normalises whitespace', async () => {
    const prepared = await prepareDocument(textFile('n.txt', 'Line 1\r\n\r\n\r\n\r\nLine 2  '));
    expect(prepared).toEqual({ name: 'n.txt', kind: 'text', data: 'Line 1\n\nLine 2' });
  });

  it('sends PDFs as base64', async () => {
    const prepared = await prepareDocument(textFile('a.pdf', '%PDF-1.4 test', 'application/pdf'));
    expect(prepared.kind).toBe('pdf');
    expect(atob(prepared.data)).toBe('%PDF-1.4 test');
    expect(documentBlock(prepared).source).toMatchObject({ type: 'base64', media_type: 'application/pdf' });
  });

  it('rejects empty, unsupported and oversized files', async () => {
    await expect(prepareDocument(textFile('e.txt', '   '))).rejects.toMatchObject({ code: 'empty' });
    await expect(prepareDocument(textFile('x.png', 'x', 'image/png'))).rejects.toBeInstanceOf(DocumentError);
    await expect(prepareDocument({ ...textFile('big.pdf', 'x'), size: 50 * 1024 * 1024 })).rejects.toMatchObject({ code: 'tooLarge' });
  });

  it('marks the document for prompt caching', () => {
    expect(documentBlock(doc).cache_control).toEqual({ type: 'ephemeral' });
    expect(toBase64(new TextEncoder().encode('hi').buffer)).toBe('aGk=');
  });
});

describe('series generation', () => {
  beforeEach(() => createMock.mockReset());

  it('returns the requested number of validated videos with sources', async () => {
    createMock.mockResolvedValueOnce(reply([video('Q1'), video('Q2', 'Section 2')]));
    const items = await generateSeriesForFormat(quiz, 2, doc, 'B1', opts);
    expect(items.map((i) => (i.data as { question: string }).question)).toEqual(['Q1', 'Q2']);
    expect(items[1]?.source).toBe('Section 2');
    const params = createMock.mock.calls[0]?.[0] as { messages: Array<{ content: Array<{ type: string }> }>; fallbacks: string };
    expect(params.messages[0]?.content[0]?.type).toBe('document');
    expect(params.fallbacks).toBe('default');
  });

  it('keeps valid items and asks again only for the missing ones', async () => {
    const bad = { source: 'p. 1', content: { ...quizDefaults, options: [] } };
    createMock.mockResolvedValueOnce(reply([video('Q1'), bad])).mockResolvedValueOnce(reply([video('Q2')]));
    const items = await generateSeriesForFormat(quiz, 2, doc, '', opts);
    expect(items).toHaveLength(2);
    const retryText = (createMock.mock.calls[1]?.[0] as { messages: Array<{ content: Array<{ text?: string }> }> }).messages[0]?.content[1]?.text ?? '';
    expect(retryText).toContain('Create 1 video');
    expect(retryText).toContain('Video 2');
    expect(retryText).toContain('Already created');
  });

  it('never returns more than requested', async () => {
    createMock.mockResolvedValueOnce(reply([video('Q1'), video('Q2'), video('Q3')]));
    await expect(generateSeriesForFormat(quiz, 2, doc, '', opts)).resolves.toHaveLength(2);
  });

  it('returns a partial series rather than nothing', async () => {
    createMock.mockResolvedValueOnce(reply([video('Q1')])).mockResolvedValueOnce(reply([]));
    await expect(generateSeriesForFormat(quiz, 3, doc, '', opts)).resolves.toHaveLength(1);
  });

  it('fails when nothing valid comes back, and on refusals', async () => {
    createMock.mockResolvedValue(reply([{ source: '', content: {} }]));
    await expect(generateSeriesForFormat(quiz, 2, doc, '', opts)).rejects.toMatchObject({ kind: 'invalid' });
    createMock.mockReset();
    createMock.mockResolvedValueOnce(reply([], 'refusal'));
    await expect(generateSeriesForFormat(quiz, 2, doc, '', opts)).rejects.toMatchObject({ kind: 'refusal' });
  });

  it('includes the teacher instructions in the prompt', () => {
    expect(buildSeriesPrompt(quiz, 3, 'Unit 3 only', [], '')).toContain("Teacher's instructions: Unit 3 only");
  });
});
