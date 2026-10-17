import type { Block, SourceDocument } from './types';

/**
 * Reads PDF, Word (.docx), Markdown and plain-text files into a list of
 * structural blocks (headings, paragraphs, list items, table rows) so the
 * analysis can use the document's own structure: sections, glossaries,
 * bold key terms. Everything happens in the browser.
 */

export type DocumentErrorCode = 'badType' | 'tooLarge' | 'tooLong' | 'empty' | 'unreadable';

export class DocumentError extends Error {
  constructor(readonly code: DocumentErrorCode) {
    super(`Document error: ${code}`);
    this.name = 'DocumentError';
  }
}

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_DOCUMENT_CHARS = 1_500_000;
export const DOCUMENT_ACCEPT = '.pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';

export interface FileLike {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
}

const extensionOf = (name: string): string => name.split('.').pop()?.toLowerCase() ?? '';

export function documentKindOf(file: Pick<FileLike, 'name' | 'type'>): 'pdf' | 'docx' | 'markdown' | 'text' | null {
  const ext = extensionOf(file.name);
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (ext === 'docx' || file.type.includes('wordprocessingml')) return 'docx';
  if (ext === 'md' || ext === 'markdown' || file.type === 'text/markdown') return 'markdown';
  if (ext === 'txt' || file.type.startsWith('text/')) return 'text';
  return null;
}

export async function readDocument(file: FileLike): Promise<SourceDocument> {
  const kind = documentKindOf(file);
  if (!kind) throw new DocumentError('badType');
  if (file.size > MAX_DOCUMENT_BYTES) throw new DocumentError('tooLarge');
  let blocks: Block[];
  try {
    if (kind === 'pdf') blocks = await readPdf(await file.arrayBuffer());
    else if (kind === 'docx') {
      const { default: mammoth } = await import('mammoth');
      const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      blocks = parseHtmlBlocks(value);
    } else blocks = parseTextBlocks(await file.text(), kind === 'markdown');
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    console.error(err);
    throw new DocumentError('unreadable');
  }
  const chars = blocks.reduce((n, b) => n + b.text.length, 0);
  if (chars < 20) throw new DocumentError('empty');
  if (chars > MAX_DOCUMENT_CHARS) throw new DocumentError('tooLong');
  return { name: file.name, blocks };
}

/* ------------------------------------------------------------------ */
/* HTML (from mammoth)                                                 */
/* ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const stripTags = (html: string): string =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

function strongTerms(html: string): string[] {
  return [...html.matchAll(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => stripTags(m[2] ?? '')).filter((s) => s.length > 0 && s.length <= 60);
}

export function parseHtmlBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const re = /<table\b[\s\S]*?<\/table>|<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of html.matchAll(re)) {
    if (m[0].toLowerCase().startsWith('<table')) {
      for (const row of m[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
        const cells = [...row[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => stripTags(c[1] ?? ''));
        if (cells.some((c) => c)) blocks.push({ kind: 'row', text: cells.filter(Boolean).join(' — '), cells, strong: strongTerms(row[0]) });
      }
      continue;
    }
    const tag = (m[1] ?? '').toLowerCase();
    const inner = m[2] ?? '';
    const text = stripTags(inner);
    if (!text) continue;
    const kind = tag.startsWith('h') ? 'heading' : tag === 'li' ? 'item' : 'paragraph';
    const strong = strongTerms(inner);
    blocks.push(strong.length ? { kind, text, strong } : { kind, text });
  }
  return blocks;
}

/* ------------------------------------------------------------------ */
/* Markdown / plain text                                               */
/* ------------------------------------------------------------------ */

const BULLET_RE = /^\s*(?:[-*+•▪●◦–]|\d{1,3}[.)]|[a-z][.)])\s+/i;
const PAIR_RE = /^[^.!?;]{1,40}?\s(?:[–—=:→]|-{1,2})\s\S/;

function inlineMarkdown(line: string): { text: string; strong: string[] } {
  const strong: string[] = [];
  let text = line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, (_, _m: string, inner: string) => {
      strong.push(inner.trim());
      return inner;
    });
  text = text.replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,;:!?])/g, '$1$2');
  return { text: text.replace(/\s+/g, ' ').trim(), strong };
}

function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && t.length <= 70 && !/[.!?,;:]$/.test(t) && /\p{L}/u.test(t) && t.split(/\s+/).length <= 10;
}

export function parseTextBlocks(source: string, markdown: boolean): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let paragraphStrong: string[] = [];

  const flush = (): void => {
    if (paragraph.length) {
      const text = paragraph.join(' ').replace(/\s+/g, ' ').trim();
      if (text) blocks.push(paragraphStrong.length ? { kind: 'paragraph', text, strong: paragraphStrong } : { kind: 'paragraph', text });
    }
    paragraph = [];
    paragraphStrong = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    // Markdown table rows: | a | b |
    if (/^\|.*\|$/.test(line)) {
      flush();
      if (/^\|[\s:|-]+\|$/.test(line)) continue;
      const cells = line.slice(1, -1).split('|').map((c) => inlineMarkdown(c).text);
      blocks.push({ kind: 'row', text: cells.filter(Boolean).join(' — '), cells });
      continue;
    }
    const heading = markdown ? /^(#{1,6})\s+(.*)$/.exec(line) : null;
    if (heading) {
      flush();
      const { text } = inlineMarkdown(heading[2] ?? '');
      if (text) blocks.push({ kind: 'heading', text });
      continue;
    }
    if (BULLET_RE.test(line)) {
      flush();
      const { text, strong } = inlineMarkdown(line.replace(BULLET_RE, ''));
      if (text) blocks.push(strong.length ? { kind: 'item', text, strong } : { kind: 'item', text });
      continue;
    }
    const { text, strong } = inlineMarkdown(line);
    const prevBlank = i === 0 || !(lines[i - 1] ?? '').trim();
    const next = (lines[i + 1] ?? '').trim();
    // Short "term – meaning" lines in a run are glossary items, not headings.
    const pairRun = PAIR_RE.test(text) && (PAIR_RE.test(next) || PAIR_RE.test((lines[i - 1] ?? '').trim()));
    if (pairRun) {
      flush();
      blocks.push(strong.length ? { kind: 'item', text, strong } : { kind: 'item', text });
      continue;
    }
    if (!markdown && prevBlank && paragraph.length === 0 && looksLikeHeading(text) && (!next || !looksLikeHeading(next) || next.length > 70)) {
      blocks.push({ kind: 'heading', text });
      continue;
    }
    paragraph.push(text);
    paragraphStrong.push(...strong);
  }
  flush();
  return blocks;
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

export interface PdfLine {
  text: string;
  /** Baseline y in PDF units (grows upwards). */
  y: number;
  height: number;
  page: number;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  height: number;
  hasEOL: boolean;
}

const isTextItem = (item: unknown): item is PdfTextItem => typeof item === 'object' && item !== null && 'str' in item && 'transform' in item;

async function readPdf(data: ArrayBuffer): Promise<Block[]> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const lines: PdfLine[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let current: PdfLine | null = null;
    for (const item of content.items) {
      if (!isTextItem(item)) continue;
      const y = item.transform[5] ?? 0;
      const height = item.height || Math.abs(item.transform[3] ?? 0);
      if (current && Math.abs(current.y - y) > Math.max(2, height * 0.5)) {
        lines.push(current);
        current = null;
      }
      if (!current) current = { text: '', y, height, page: p };
      current.text += item.str;
      current.height = Math.max(current.height, height);
      if (item.hasEOL) {
        lines.push(current);
        current = null;
      }
    }
    if (current) lines.push(current);
    page.cleanup();
  }
  await pdf.destroy();
  return pdfLinesToBlocks(lines);
}

/** Groups PDF text lines into headings, list items and paragraphs. */
export function pdfLinesToBlocks(input: readonly PdfLine[]): Block[] {
  const lines = input.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text);
  const heights = lines.map((l) => l.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] ?? 10;
  const blocks: Block[] = [];
  let para: { text: string; page: number; y: number; height: number } | null = null;

  const flush = (): void => {
    if (para) blocks.push({ kind: 'paragraph', text: para.text, page: para.page });
    para = null;
  };

  lines.forEach((line, i) => {
    const bigger = line.height >= median * 1.2;
    const allCaps = line.text.length >= 4 && line.text === line.text.toLocaleUpperCase() && /\p{Lu}/u.test(line.text);
    const prev = blocks[blocks.length - 1];
    const open = para as { text: string } | null;
    const prevEnded = open === null && (!prev || prev.kind !== 'paragraph' || /[.!?:؟]$/.test(prev.text));
    const next = lines[i + 1];
    // A short untitled line ("Vocabulary") standing alone before a list or a new paragraph.
    const shortTitle = line.text.split(/\s+/).length <= 4 && !/[.,;:!?]$/.test(line.text) && !PAIR_RE.test(line.text) && prevEnded && !!next && (PAIR_RE.test(next.text) || /^\p{Lu}/u.test(next.text));
    if (((bigger || allCaps) && looksLikeHeading(line.text)) || shortTitle) {
      flush();
      blocks.push({ kind: 'heading', text: line.text, page: line.page });
      return;
    }
    // "term – meaning" lines are glossary entries: keep each one separate.
    if (PAIR_RE.test(line.text) && line.text.length <= 140) {
      flush();
      blocks.push({ kind: 'item', text: line.text, page: line.page });
      return;
    }
    if (BULLET_RE.test(line.text)) {
      flush();
      blocks.push({ kind: 'item', text: line.text.replace(BULLET_RE, ''), page: line.page });
      return;
    }
    const current = para as { text: string; page: number; y: number; height: number } | null;
    const gap = current ? current.y - line.y : 0;
    const continues =
      current !== null && current.page === line.page && gap > 0 && gap < Math.max(current.height, line.height) * 1.9 && (!/[.!?:؟]$/.test(current.text) || /^\p{Ll}/u.test(line.text));
    if (current && continues) {
      current.text = current.text.endsWith('-') && /^\p{Ll}/u.test(line.text) ? current.text.slice(0, -1) + line.text : `${current.text} ${line.text}`;
      current.y = line.y;
      current.height = line.height;
    } else {
      flush();
      para = { text: line.text, page: line.page, y: line.y, height: line.height };
    }
  });
  flush();
  return blocks;
}
