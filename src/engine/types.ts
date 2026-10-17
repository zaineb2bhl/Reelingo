/** Languages the engine understands. English gets the full toolset. */
export type Lang = 'en' | 'fr' | 'ar';

export type BlockKind = 'heading' | 'paragraph' | 'item' | 'row';

/** A structural piece of a document: a heading, a paragraph, a list item or a table row. */
export interface Block {
  kind: BlockKind;
  text: string;
  /** Table cells, for rows. */
  cells?: string[];
  /** Words or phrases set in bold / strong in the source. */
  strong?: string[];
  /** 1-based page number (PDFs only). */
  page?: number;
}

export interface SourceDocument {
  name: string;
  blocks: Block[];
}

export type Pos = 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrasal';
