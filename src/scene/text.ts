import { roundRectPath } from './shapes';
import type { Ctx, Direction } from './types';

/* ------------------------------------------------------------------ */
/* Markup: "wrap a word in *stars* to colour it"                       */
/* ------------------------------------------------------------------ */

export interface Run {
  text: string;
  emph: boolean;
}

const ESCAPED_STAR = '\u0000';

/** Splits `*emphasised*` spans out of a string. `\*` gives a literal star. */
export function parseMarkup(src: string): Run[] {
  const s = src.replace(/\\\*/g, ESCAPED_STAR);
  const runs: Run[] = [];
  const push = (text: string, emph: boolean): void => {
    if (!text) return;
    const restored = text.split(ESCAPED_STAR).join('*');
    const prev = runs[runs.length - 1];
    if (prev && prev.emph === emph) prev.text += restored;
    else runs.push({ text: restored, emph });
  };
  const re = /\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) push(s.slice(last, m.index), false);
    push(m[1] ?? '', true);
    last = m.index + m[0].length;
  }
  if (last < s.length) push(s.slice(last), false);
  return runs;
}

export function stripMarkup(src: string): string {
  return parseMarkup(src)
    .map((r) => r.text)
    .join('');
}

/* ------------------------------------------------------------------ */
/* Direction                                                           */
/* ------------------------------------------------------------------ */

/** L = strong left-to-right, R = strong right-to-left, D = digits, N = neutral. */
export type CharClass = 'L' | 'R' | 'D' | 'N';

// Arabic comma, semicolon, question mark, percent and full stop are punctuation, not letters.
const ARABIC_PUNCT_RE = /[،؛؟٪-٭۔]/;
const DIGIT_RE = /[0-9\u0660-\u0669\u06F0-\u06F9]/;
const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR_RE = /[A-Za-z\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0370-\u03FF\u0400-\u052F\u1E00-\u1FFF]/;

export function charClass(ch: string): CharClass {
  if (DIGIT_RE.test(ch)) return 'D';
  if (ARABIC_PUNCT_RE.test(ch)) return 'N';
  if (RTL_RE.test(ch)) return 'R';
  if (LTR_RE.test(ch)) return 'L';
  return 'N';
}

export const hasRtl = (text: string): boolean => RTL_RE.test(text);

/** Paragraph direction from the first strong character (Unicode bidi rule P2). */
export function detectDirection(text: string, fallback: Direction = 'ltr'): Direction {
  for (const ch of text) {
    const c = charClass(ch);
    if (c === 'L') return 'ltr';
    if (c === 'R') return 'rtl';
  }
  return fallback;
}

function wordClass(text: string): CharClass {
  let sawDigit = false;
  for (const ch of text) {
    const c = charClass(ch);
    if (c === 'L' || c === 'R') return c;
    if (c === 'D') sawDigit = true;
  }
  return sawDigit ? 'D' : 'N';
}

/* ------------------------------------------------------------------ */
/* Fonts                                                               */
/* ------------------------------------------------------------------ */

export type FontWeight = 400 | 600 | 800;

export function fontFor(size: number, weight: FontWeight = 600, dir: Direction = 'ltr'): string {
  // Cairo carries the Arabic glyphs; put it first for RTL so embedded Latin matches its style.
  const families = dir === 'rtl' ? 'Cairo, Inter' : 'Inter, Cairo';
  return `${weight} ${Math.round(size)}px ${families}, system-ui, sans-serif`;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export interface Piece {
  chars: string[];
  emph: boolean;
  width: number;
}

export interface Word {
  text: string;
  pieces: Piece[];
  cls: CharClass;
  /** Direction the word itself is drawn in. */
  dir: Direction;
  /** True when the word belongs to a run against the paragraph direction. */
  flip: boolean;
  width: number;
  /** Index of the first character in logical (typing) order. */
  charStart: number;
  length: number;
  /** Attached to the previous token with no space (split-off punctuation). */
  glue: boolean;
}

export interface Line {
  words: Word[];
  /** Word indices in left-to-right visual order. */
  order: number[];
  width: number;
}

export interface TextLayout {
  lines: Line[];
  dir: Direction;
  size: number;
  weight: FontWeight;
  font: string;
  lineHeight: number;
  spaceWidth: number;
  width: number;
  height: number;
  totalChars: number;
  /** True when a word was too wide and had to be broken across lines. */
  broken: boolean;
}

export interface TextStyle {
  size: number;
  weight?: FontWeight;
  /** Multiplier of font size. */
  lineHeight?: number;
  direction?: Direction | 'auto';
}

interface RawWord {
  pieces: Array<{ text: string; emph: boolean }>;
}

function tokenize(runs: Run[]): RawWord[][] {
  const paragraphs: RawWord[][] = [[]];
  let word: RawWord | null = null;
  const endWord = (): void => {
    if (word && word.pieces.length) paragraphs[paragraphs.length - 1]?.push(word);
    word = null;
  };
  for (const run of runs) {
    for (const ch of run.text) {
      if (ch === '\n') {
        endWord();
        paragraphs.push([]);
      } else if (/\s/.test(ch)) {
        endWord();
      } else {
        const w: RawWord = word ?? { pieces: [] };
        word = w;
        const last = w.pieces[w.pieces.length - 1];
        if (last && last.emph === run.emph) last.text += ch;
        else w.pieces.push({ text: ch, emph: run.emph });
      }
    }
  }
  endWord();
  return paragraphs;
}

function measurePieces(ctx: Ctx, pieces: Array<{ text: string; emph: boolean }>): Piece[] {
  return pieces.map((p) => ({ chars: Array.from(p.text), emph: p.emph, width: ctx.measureText(p.text).width }));
}

type MeasuredWord = Omit<Word, 'dir' | 'flip' | 'charStart'>;

function makeWord(pieces: Piece[], glue = false): MeasuredWord {
  const text = pieces.map((p) => p.chars.join('')).join('');
  return {
    text,
    pieces,
    cls: wordClass(text),
    width: pieces.reduce((sum, p) => sum + p.width, 0),
    length: pieces.reduce((sum, p) => sum + p.chars.length, 0),
    glue,
  };
}

function piecesFromChars(ctx: Ctx, chars: Array<{ ch: string; emph: boolean }>): Piece[] {
  const raw: Array<{ text: string; emph: boolean }> = [];
  for (const c of chars) {
    const last = raw[raw.length - 1];
    if (last && last.emph === c.emph) last.text += c.ch;
    else raw.push({ text: c.ch, emph: c.emph });
  }
  return measurePieces(ctx, raw);
}

/**
 * Splits leading / trailing punctuation off a word so that it can follow the
 * paragraph direction (e.g. the "؟" after an English word in Arabic text).
 */
function splitAffixes(ctx: Ctx, word: MeasuredWord): MeasuredWord[] {
  const chars: Array<{ ch: string; emph: boolean }> = [];
  for (const p of word.pieces) for (const ch of p.chars) chars.push({ ch, emph: p.emph });
  let first = -1;
  let last = -1;
  chars.forEach((c, i) => {
    if (charClass(c.ch) !== 'N') {
      if (first < 0) first = i;
      last = i;
    }
  });
  if (first < 0 || (first === 0 && last === chars.length - 1)) return [word];
  const parts = [chars.slice(0, first), chars.slice(first, last + 1), chars.slice(last + 1)].filter((part) => part.length > 0);
  return parts.map((part, i) => makeWord(piecesFromChars(ctx, part), word.glue || i > 0));
}

/** Space between two visually adjacent tokens. */
function gapBetween(words: readonly Word[], a: number, b: number, spaceWidth: number): number {
  if (Math.abs(a - b) === 1 && words[Math.max(a, b)]?.glue) return 0;
  return spaceWidth;
}

function visualWidth(words: readonly Word[], order: readonly number[], spaceWidth: number): number {
  let width = 0;
  order.forEach((idx, k) => {
    width += words[idx]?.width ?? 0;
    const next = order[k + 1];
    if (next !== undefined) width += gapBetween(words, idx, next, spaceWidth);
  });
  return width;
}

/** Breaks a single word that is wider than the line into character chunks. */
function splitLongWord(ctx: Ctx, pieces: Piece[], maxWidth: number): Piece[][] {
  const chars: Array<{ ch: string; emph: boolean }> = [];
  for (const p of pieces) for (const ch of p.chars) chars.push({ ch, emph: p.emph });
  const chunks: Array<Array<{ ch: string; emph: boolean }>> = [[]];
  let width = 0;
  for (const c of chars) {
    const w = ctx.measureText(c.ch).width;
    const current = chunks[chunks.length - 1];
    if (current && current.length > 0 && width + w > maxWidth) {
      chunks.push([c]);
      width = w;
    } else {
      current?.push(c);
      width += w;
    }
  }
  return chunks.map((chunk) => piecesFromChars(ctx, chunk));
}

/**
 * Resolves which words run against the paragraph direction. A simplified
 * version of the Unicode bidi algorithm that is good enough for short
 * headline-style text: digits follow the preceding strong word, neutral words
 * join a run only when both neighbours belong to it.
 */
function resolveFlips(classes: CharClass[], dir: Direction): boolean[] {
  const opposite: CharClass = dir === 'ltr' ? 'R' : 'L';
  const flips = new Array<boolean>(classes.length).fill(false);
  let prevStrong: CharClass | null = null;
  for (let i = 0; i < classes.length; i++) {
    const c = classes[i];
    if (c === 'L' || c === 'R') {
      flips[i] = c === opposite;
      prevStrong = c;
    } else if (c === 'D') {
      flips[i] = prevStrong === opposite;
    } else {
      let nextStrong: CharClass | null = null;
      for (let j = i + 1; j < classes.length; j++) {
        const cj = classes[j];
        if (cj === 'L' || cj === 'R') {
          nextStrong = cj;
          break;
        }
      }
      flips[i] = prevStrong === opposite && nextStrong === opposite;
    }
  }
  return flips;
}

const OPENERS = '([{«';
const CLOSERS = ')]}»';

/** Paired brackets resolve together (simplified Unicode bidi rule N0). */
function pairBrackets(texts: readonly string[], flips: boolean[]): boolean[] {
  const stack: Array<{ index: number; kind: number }> = [];
  texts.forEach((text, i) => {
    for (const ch of text) {
      const open = OPENERS.indexOf(ch);
      const close = CLOSERS.indexOf(ch);
      if (open >= 0) stack.push({ index: i, kind: open });
      else if (close >= 0) {
        const top = stack[stack.length - 1];
        if (top && top.kind === close) {
          stack.pop();
          if (top.index !== i) flips[i] = flips[top.index] ?? false;
        }
      }
    }
  });
  return flips;
}

export function visualOrder(words: readonly Pick<Word, 'flip'>[], dir: Direction): number[] {
  const units: number[][] = [];
  for (let i = 0; i < words.length; i++) {
    const last = units[units.length - 1];
    const prevFlip = i > 0 && words[i - 1]?.flip;
    if (words[i]?.flip && prevFlip && last) last.push(i);
    else units.push([i]);
  }
  if (dir === 'ltr') {
    // Right-to-left clusters inside an LTR line read right to left.
    return units.flatMap((u) => (u.length > 1 ? [...u].reverse() : u));
  }
  // RTL line: units are placed right to left; LTR clusters keep their order.
  return [...units].reverse().flatMap((u) => u);
}

const layoutCache = new Map<string, TextLayout>();

export function clearTextCache(): void {
  layoutCache.clear();
}

export function layoutText(ctx: Ctx, text: string, maxWidth: number, style: TextStyle): TextLayout {
  const weight = style.weight ?? 600;
  const plain = stripMarkup(text);
  const dir = !style.direction || style.direction === 'auto' ? detectDirection(plain) : style.direction;
  const font = fontFor(style.size, weight, dir);
  const lineHeight = style.size * (style.lineHeight ?? 1.18);
  const key = `${font}|${lineHeight}|${maxWidth}|${dir}|${text}`;
  const cached = layoutCache.get(key);
  if (cached) return cached;

  ctx.save();
  ctx.font = font;
  const spaceWidth = ctx.measureText(' ').width;
  const lines: Line[] = [];
  let charCursor = 0;
  let broken = false;

  for (const para of tokenize(parseMarkup(text))) {
    // Measure (and split over-long words) before resolving direction.
    const measured: MeasuredWord[] = [];
    for (const raw of para) {
      const pieces = measurePieces(ctx, raw.pieces);
      const word = makeWord(pieces);
      if (word.width > maxWidth && word.length > 1) {
        broken = true;
        for (const chunk of splitLongWord(ctx, pieces, maxWidth)) measured.push(makeWord(chunk));
      } else {
        measured.push(...splitAffixes(ctx, word));
      }
    }
    const flips = pairBrackets(measured.map((w) => w.text), resolveFlips(measured.map((w) => w.cls), dir));
    const words: Word[] = measured.map((w, i) => {
      const flip = flips[i] ?? false;
      const own: Direction | null = w.cls === 'L' ? 'ltr' : w.cls === 'R' ? 'rtl' : null;
      const fallback: Direction = flip ? (dir === 'ltr' ? 'rtl' : 'ltr') : dir;
      if (w.glue && i > 0) charCursor -= 1;
      const word: Word = { ...w, flip, dir: own ?? fallback, charStart: charCursor };
      charCursor += w.length + 1;
      return word;
    });
    if (words.length === 0) charCursor += 1;

    // Wrap whole groups (a word plus its glued punctuation) so they never split.
    let current: Word[] = [];
    let width = 0;
    const flush = (): void => {
      const order = visualOrder(current, dir);
      lines.push({ words: current, order, width: visualWidth(current, order, spaceWidth) });
      current = [];
      width = 0;
    };
    let i = 0;
    while (i < words.length) {
      const group: Word[] = [];
      do {
        const w = words[i];
        if (w) group.push(w);
        i++;
      } while (i < words.length && words[i]?.glue);
      const groupWidth = group.reduce((sum, w) => sum + w.width, 0);
      const extra = current.length ? spaceWidth + groupWidth : groupWidth;
      if (current.length && width + extra > maxWidth) {
        flush();
        current.push(...group);
        width = groupWidth;
      } else {
        current.push(...group);
        width += extra;
      }
    }
    flush();
  }
  ctx.restore();

  const layout: TextLayout = {
    lines,
    dir,
    size: style.size,
    weight,
    font,
    lineHeight,
    spaceWidth,
    width: lines.reduce((m, l) => Math.max(m, l.width), 0),
    height: lines.length * lineHeight,
    totalChars: Math.max(0, charCursor - 1),
    broken,
  };
  if (layoutCache.size > 400) layoutCache.clear();
  layoutCache.set(key, layout);
  return layout;
}

export interface FitOptions {
  maxWidth: number;
  maxHeight: number;
  maxSize: number;
  minSize?: number;
  maxLines?: number;
  weight?: FontWeight;
  lineHeight?: number;
  direction?: Direction | 'auto';
}

/** Largest font size (down to `minSize`) at which the text fits the box. */
export function fitText(ctx: Ctx, text: string, opts: FitOptions): TextLayout {
  const minSize = opts.minSize ?? 28;
  let size = opts.maxSize;
  let layout = layoutText(ctx, text, opts.maxWidth, { ...opts, size });
  while (size > minSize) {
    const fits =
      !layout.broken && layout.height <= opts.maxHeight && (opts.maxLines === undefined || layout.lines.length <= opts.maxLines);
    if (fits) break;
    size = Math.max(minSize, size - Math.max(2, Math.round(size * 0.06)));
    layout = layoutText(ctx, text, opts.maxWidth, { ...opts, size });
  }
  return layout;
}

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

export type TextAlign = 'start' | 'end' | 'left' | 'right' | 'center';

export interface WordHighlight {
  /** Receives the word without surrounding punctuation, lower-cased. */
  test: (word: string) => boolean;
  fill: string;
  color?: string;
  /** 0..1 grow-in of the highlight. */
  progress?: number;
}

export interface DrawTextOptions {
  x: number;
  /** Top of the text block. */
  y: number;
  align?: TextAlign;
  color: string;
  emphColor?: string;
  /** Number of characters revealed in logical order (typewriter effect). */
  reveal?: number;
  highlight?: WordHighlight;
  shadow?: { color: string; blur: number; offsetY?: number };
}

export function resolveAlign(align: TextAlign, dir: Direction): 'left' | 'right' | 'center' {
  if (align === 'center' || align === 'left' || align === 'right') return align;
  if (align === 'start') return dir === 'ltr' ? 'left' : 'right';
  return dir === 'ltr' ? 'right' : 'left';
}

export const normaliseWord = (word: string): string =>
  word.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '').toLocaleLowerCase();

function setDirection(ctx: Ctx, dir: Direction): void {
  if ('direction' in ctx) ctx.direction = dir;
}

export function drawText(ctx: Ctx, layout: TextLayout, opts: DrawTextOptions): void {
  const align = resolveAlign(opts.align ?? 'start', layout.dir);
  const reveal = opts.reveal ?? Number.POSITIVE_INFINITY;
  const emphColor = opts.emphColor ?? opts.color;

  ctx.save();
  ctx.font = layout.font;
  ctx.textBaseline = 'middle';
  if (opts.shadow) {
    ctx.shadowColor = opts.shadow.color;
    ctx.shadowBlur = opts.shadow.blur;
    ctx.shadowOffsetY = opts.shadow.offsetY ?? 0;
  }

  layout.lines.forEach((line, li) => {
    const cy = opts.y + li * layout.lineHeight + layout.lineHeight / 2;
    let cursor = align === 'left' ? opts.x : align === 'right' ? opts.x - line.width : opts.x - line.width / 2;
    line.order.forEach((idx, k) => {
      const word = line.words[idx];
      if (!word) return;
      const visible = Math.max(0, Math.min(word.length, Math.floor(reveal - word.charStart)));
      if (visible > 0) {
        const hl = opts.highlight;
        const norm = normaliseWord(word.text);
        const highlighted = hl && norm ? hl.test(norm) : false;
        if (hl && highlighted) {
          const p = hl.progress ?? 1;
          const padX = layout.size * 0.18;
          const h = layout.size * 1.12;
          ctx.save();
          ctx.shadowColor = 'transparent';
          ctx.fillStyle = hl.fill;
          const w = (word.width + padX * 2) * p;
          const x0 = word.dir === 'rtl' ? cursor + word.width + padX - w : cursor - padX;
          roundRectPath(ctx, x0, cy - h / 2, w, h, h * 0.28);
          ctx.fill();
          ctx.restore();
        }
        drawWord(ctx, word, cursor, cy, visible, highlighted && hl?.color ? hl.color : opts.color, highlighted && hl?.color ? hl.color : emphColor);
      }
      const next = line.order[k + 1];
      cursor += word.width + (next === undefined ? 0 : gapBetween(line.words, idx, next, layout.spaceWidth));
    });
  });
  ctx.restore();
}

function drawWord(ctx: Ctx, word: Word, x: number, cy: number, visible: number, color: string, emphColor: string): void {
  setDirection(ctx, word.dir);
  let remaining = visible;
  if (word.dir === 'ltr') {
    ctx.textAlign = 'left';
    let px = x;
    for (const piece of word.pieces) {
      if (remaining <= 0) break;
      const text = piece.chars.slice(0, remaining).join('');
      ctx.fillStyle = piece.emph ? emphColor : color;
      ctx.fillText(text, px, cy);
      remaining -= piece.chars.length;
      px += piece.width;
    }
  } else {
    ctx.textAlign = 'right';
    let px = x + word.width;
    for (const piece of word.pieces) {
      if (remaining <= 0) break;
      const text = piece.chars.slice(0, remaining).join('');
      ctx.fillStyle = piece.emph ? emphColor : color;
      ctx.fillText(text, px, cy);
      remaining -= piece.chars.length;
      px -= piece.width;
    }
  }
}

export interface LabelOptions {
  size: number;
  weight?: FontWeight;
  color: string;
  align?: 'left' | 'right' | 'center';
  direction?: Direction | 'auto';
}

/** Single line of plain text, centred vertically on `y`. Returns its width. */
export function drawLabel(ctx: Ctx, text: string, x: number, y: number, opts: LabelOptions): number {
  const dir = !opts.direction || opts.direction === 'auto' ? detectDirection(text) : opts.direction;
  ctx.save();
  ctx.font = fontFor(opts.size, opts.weight ?? 600, dir);
  setDirection(ctx, dir);
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = opts.color;
  ctx.fillText(text, x, y);
  const width = ctx.measureText(text).width;
  ctx.restore();
  return width;
}

export function measureLabel(ctx: Ctx, text: string, size: number, weight: FontWeight = 600): number {
  ctx.save();
  ctx.font = fontFor(size, weight, detectDirection(text));
  const width = ctx.measureText(text).width;
  ctx.restore();
  return width;
}
