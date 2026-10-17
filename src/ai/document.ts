import type AnthropicSdk from '@anthropic-ai/sdk';

/**
 * Turns an uploaded file into something Claude can read directly: PDFs are
 * sent as-is (Claude sees text, tables and images), Word / text files are
 * converted to plain text in the browser. No chunking or embeddings needed:
 * whole documents fit in the model's context window.
 */

export type DocumentKind = 'pdf' | 'text';

export interface PreparedDocument {
  name: string;
  kind: DocumentKind;
  /** Base64 for PDFs, plain text otherwise. */
  data: string;
}

export type DocumentErrorCode = 'badType' | 'tooLarge' | 'tooLong' | 'empty' | 'unreadable';

export class DocumentError extends Error {
  constructor(readonly code: DocumentErrorCode) {
    super(`Document error: ${code}`);
    this.name = 'DocumentError';
  }
}

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
/** Roughly 400k tokens of text; keeps requests fast and affordable. */
export const MAX_DOCUMENT_CHARS = 1_500_000;
export const DOCUMENT_ACCEPT = '.pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';

interface FileLike {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
}

const extensionOf = (name: string): string => name.split('.').pop()?.toLowerCase() ?? '';

export function documentKindOf(file: Pick<FileLike, 'name' | 'type'>): 'pdf' | 'docx' | 'text' | null {
  const ext = extensionOf(file.name);
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (ext === 'docx' || file.type.includes('wordprocessingml')) return 'docx';
  if (['txt', 'md', 'markdown'].includes(ext) || file.type.startsWith('text/')) return 'text';
  return null;
}

export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function checkText(text: string): string {
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) throw new DocumentError('empty');
  if (clean.length > MAX_DOCUMENT_CHARS) throw new DocumentError('tooLong');
  return clean;
}

export async function prepareDocument(file: FileLike): Promise<PreparedDocument> {
  const kind = documentKindOf(file);
  if (!kind) throw new DocumentError('badType');
  if (file.size > MAX_DOCUMENT_BYTES) throw new DocumentError('tooLarge');
  try {
    if (kind === 'pdf') return { name: file.name, kind: 'pdf', data: toBase64(await file.arrayBuffer()) };
    if (kind === 'docx') {
      const { default: mammoth } = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return { name: file.name, kind: 'text', data: checkText(result.value) };
    }
    return { name: file.name, kind: 'text', data: checkText(await file.text()) };
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    console.error(err);
    throw new DocumentError('unreadable');
  }
}

/** Document content block, cached so several requests about it are cheaper. */
export function documentBlock(doc: PreparedDocument): AnthropicSdk.Beta.BetaRequestDocumentBlock {
  return {
    type: 'document',
    title: doc.name,
    source:
      doc.kind === 'pdf'
        ? { type: 'base64', media_type: 'application/pdf', data: doc.data }
        : { type: 'text', media_type: 'text/plain', data: doc.data },
    cache_control: { type: 'ephemeral' },
  };
}
