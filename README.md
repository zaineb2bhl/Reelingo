# Reelingo

Make short vertical videos (9:16, 1080×1920) for Instagram Reels, TikTok and YouTube Shorts from language-lesson templates. Pick a template, fill in a form, watch the live preview, and download an MP4. Everything runs in the browser: no account, no server, nothing uploaded.

The name is a placeholder: change `APP_NAME` in [src/config.ts](src/config.ts), the `<title>` in [index.html](index.html), and the `name` in `package.json`.

## Features

- **Four templates**: Quiz, Top 5 ranking, True or False, Word of the day.
- **Live preview** in a phone frame with play, pause, scrub and a toggle that shows the platform safe zones.
- **Real MP4 export** (H.264 + AAC) via WebCodecs and `mp4-muxer`. Frames are rendered offline, so a 7-second clip renders in about 5 seconds on a laptop. Browsers without WebCodecs fall back to `MediaRecorder` (real time, usually WebM), and the export dialog says so.
- **Audio**:
  - Synthesised sound effects (tick, pop, whoosh, correct and wrong chimes, reveal), so there's nothing to license.
  - Uploads for background music (MP3/WAV, 10 MB) and a voiceover.
  - Music loops if it's shorter than the video, fades in and out, and is lowered while the voiceover plays.
  - Mixed with `OfflineAudioContext` for export.
- **Themes**: six built-in themes, plus a custom accent colour.
- **Branding**: a watermark or handle and a logo (PNG, JPG, WebP or SVG), each placeable in any corner.
- **Languages**:
  - Full Unicode text rendering with bundled Inter and Cairo fonts (Latin, accented French, Arabic, IPA).
  - Right-to-left layout for Arabic, including mixed Arabic and English text.
  - The UI is available in English, French and Arabic, with an RTL interface for Arabic.
- **`*Star*` markup**: wrap a word in `*stars*` to colour it on screen.
- **Projects** are saved in IndexedDB, with thumbnails. Once a project has been saved, it autosaves.
- **Turn a document into a series**: upload a PDF, Word (.docx), TXT or Markdown lesson, choose how many of each template you want, and the app's own content engine builds up to 10 videos from that document: no AI service, no API key, nothing leaves the browser. Each video is saved as a project with a note showing where in the document it came from.

## Getting started

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type-check and build static files into `dist/` (deploy anywhere) |
| `npm run check` | Type-check, lint (no `any`) and unit tests |
| `npm test` | Unit tests plus a smoke test that renders frames of every format in Node |
| `npm run sheet -- <formatId> <themeId> out.png ['{json data}']` | Renders a strip of 8 frames to PNG, handy for checking timing and layout |
| `npm run e2e:export -- [formatId\|all] [outDir]` | Exports each format in a real Chrome, reports render time, and validates the MP4 (H.264 track, audio track, duration, non-silent audio) |
| `npm run e2e:series -- [outDir] [extra documents…]` | Generates a sample PDF and Markdown lesson, runs the document-to-series flow on each in Chrome (plus any extra files), checks the projects and that no external network request is made |
| `npm run engine:demo -- [file.md\|file.txt] [instructions]` | Runs the content engine in Node on a file (or the bundled English, French and Arabic sample lessons) and prints the generated videos |
| `npm run lexicon` | Rebuilds the English lexicon (runs automatically before `dev`, `build` and `test`) |
| `npm run e2e:ui -- [outDir]` | Clicks through the app in Chrome (home, editors, export, save, uploads, Arabic UI, mobile) and saves screenshots |

The `e2e:*` scripts need the dev server running and a local Chrome or Edge. Set `CHROME_PATH` if yours isn't found automatically.

## How it works

```
src/
  config.ts          video size, fps, platform safe zone
  formats/           one folder per format (auto-discovered)
    registry.ts      import.meta.glob('./*/index.ts')
    types.ts         FormatModule interface + defineFormat()
    kit.ts           shared pieces (tag pill, progress line, timing helpers)
    quiz/ top5/ truefalse/ wordofday/ starter/
  scene/             drawing toolkit: text (wrap, RTL, markup), easing, timeline,
                     countdown ring, progress bar, confetti, shapes, backgrounds
  themes/            the 6 themes + accent override
  render/            renderFrame() (background → format → branding), thumbnails
  audio/             synthesised SFX, mixer (live + offline), preview controller
  export/            WebCodecs + mp4-muxer exporter, MediaRecorder fallback
  storage/           IndexedDB: projects and uploaded media
  state/             zustand stores (editor, settings, series)
  engine/            document → videos content engine (runs in a Web Worker)
  i18n/              en (source of truth), fr, ar
  app/, components/  React UI
```

**One renderer.** Every frame is `render(ctx, data, t, theme)` on a 1080×1920 canvas, and it is a pure function of `t`. The preview calls it from `requestAnimationFrame` on a scaled canvas. Export calls it for `t = i / 30` on an `OffscreenCanvas` and hands each frame to `VideoEncoder`. Preview and export therefore use the same drawing code at the same timestamps. Confetti and noise use a seeded PRNG, so any frame can be drawn on its own (needed for scrubbing).

**Timelines.** Each format builds a `Timeline` of named segments (`intro`, `question`, `countdown`, `reveal`…) from its data. `duration()`, `render()` and `cues()` all read the same timeline, so the video length, the animation and the sound effects can't drift apart.

**Text.** `scene/text.ts` handles the text layout:
- It parses `*star*` markup and wraps words to the line width.
- It shrinks text to fit a box, and prefers a smaller size over breaking a word.
- It supports a typewriter reveal.
- It orders words with a simplified Unicode bidi algorithm: paragraph direction comes from the first strong character, digits and punctuation follow their neighbours, and paired brackets resolve together.

The browser shapes each word (Arabic joining, accents), so drawing word by word stays correct.

## Adding a new format

Add one folder under `src/formats/`. Nothing else needs to change: the registry picks it up, it appears on the home grid, and the existing tests run it automatically (defaults validate against the schema, the duration is finite, cues fall inside the video, and a frame renders in Node).

```ts
// src/formats/flashcard/index.ts
import { z } from 'zod';
import { buildTimeline, drawText, fitText, riseIn, withTransform } from '@/scene';
import { SAFE, SAFE_WIDTH } from '@/config';
import { CX, drawTimeline } from '../kit';
import { defineFormat } from '../types';
import { FlashcardForm } from './Form';

export const flashcardSchema = z.object({
  front: z.string().trim().min(1).max(60),
  back: z.string().trim().min(1).max(120),
});
export type FlashcardData = z.infer<typeof flashcardSchema>;

const timeline = (d: FlashcardData) =>
  buildTimeline([
    { id: 'front', duration: 2.5 },
    { id: 'back', duration: 3 },
  ]);

export default defineFormat<FlashcardData>({
  id: 'flashcard',                    // used in URLs and saved projects
  order: 5,                           // position on the home grid
  title: { en: 'Flashcard', fr: 'Carte mémoire', ar: 'بطاقة' },
  description: { en: 'A word on the front, its meaning on the back.' },
  schema: flashcardSchema,
  defaults: { front: 'to *nail* it', back: 'to do something perfectly' },
  Form: FlashcardForm,                // receives { value, onChange, errors }
  duration: (d) => timeline(d).total,
  render(ctx, d, t, theme) {          // 1080×1920 logical pixels
    const tl = timeline(d);
    const front = fitText(ctx, d.front, { maxWidth: SAFE_WIDTH, maxHeight: 400, maxSize: 120 });
    drawText(ctx, front, { x: CX, y: SAFE.top + 200, align: 'center', color: theme.text, emphColor: theme.accent });
    const back = fitText(ctx, d.back, { maxWidth: SAFE_WIDTH, maxHeight: 400, maxSize: 64, weight: 400 });
    withTransform(ctx, riseIn(tl.p('back', t)), () =>
      drawText(ctx, back, { x: CX, y: SAFE.top + 700, align: 'center', color: theme.textMuted }),
    );
    drawTimeline(ctx, theme, t, tl.total);
  },
  cues: (d) => [{ t: timeline(d).get('back').start, sfx: 'pop' }], // optional
});
```

Tips:
- Keep important content inside `SAFE` (the area the Reels/TikTok/Shorts overlays don't cover). The preview's "Safe zones" toggle shows it.
- Build forms from the controls in `src/components/ui/` (`Field`, `TextInput`, `TextArea`, `Segmented`, `Toggle`, `ListRow`, `AddButton`) and put form labels in a local `messages` object read with `useMessages()`.
- Use `PaceField` and `paceSchema` if your format has a "time per card" setting.
- `npm run sheet -- flashcard ink out.png` renders frames so you can check the timing.
- `src/formats/starter/` is a small, hidden example format to copy from.

## Documents → series: the content engine

The **From a document** page turns a lesson document into videos using classic information retrieval and rule-based question generation. There is no machine-learning model and no external service: every step is deterministic and runs in the browser (inside a Web Worker, so the page stays responsive). The same document and instructions always give the same videos.

**1. Reading** ([src/engine/reader.ts](src/engine/reader.ts)). The file is turned into structured blocks: headings, paragraphs, list items, table rows and bold terms.
- **PDF:** text is read with `pdf.js`. Lines are regrouped into paragraphs, larger or all-caps lines become headings, and "term – meaning" lines are kept as separate entries.
- **Word (.docx):** converted to HTML with `mammoth`, which keeps headings, lists, tables and bold text.
- **Markdown and plain text:** parsed directly.

**2. Text processing** ([src/engine/text.ts](src/engine/text.ts)). The engine works out:
- the document's language (English, French or Arabic), from the script and common words,
- sentence boundaries, without breaking on abbreviations,
- tokens and stopwords,
- light stems, so inflected forms match ("carottes" ~ "carotte", "deadlines" ~ "deadline", "المكتبة" ~ "مكتبة").

**3. Retrieval** ([src/engine/search.ts](src/engine/search.ts), `computeFocus`). The optional instructions select part of the document:
- a heading containing every instruction word ("Unit 3") selects that section,
- otherwise passages are ranked with **BM25**, the ranking function used by classic search engines.

**4. Analysis** ([src/engine/analyze.ts](src/engine/analyze.ts)):
- **Glossary.** The document's own definitions and translations are found in vocabulary tables (including column roles such as Meaning or Translation), in "term – meaning" / "term: meaning" lines, in "X means Y" / "X signifie Y" / "X تعني Y" sentences, and in bold terms.
- **Key terms.**
  - English is tagged with the rule-based NLP library `compromise`, for part of speech, base forms and phrasal verbs.
  - Terms are ranked by how often they occur in the document compared with everyday English (SUBTLEX word frequency).
  - French and Arabic use the term's spread across the document (TF-IDF) instead.
  - Glossary entries, bold terms and words in headings get a boost, and names are filtered out.
- **Definitions.** The document's own definition comes first. For English words it doesn't define, the app falls back to Princeton WordNet. IPA comes from the CMU Pronouncing Dictionary, converted from ARPAbet.

**5. Generation** ([src/engine/generators.ts](src/engine/generators.ts)). Every output is validated against the template's Zod schema.
- **Quiz:** two kinds, alternated.
  - **Fill the gap:** a real sentence from the document with a key word blanked out. The wrong answers are other key words from the document with the same part of speech and grammatical form (plural, past tense…). For English verbs they're conjugated to match.
  - **What does X mean?** The wrong answers are other definitions from the same source.
- **True or False:** a true statement is a sentence from the document. A false one is a document sentence that has been negated (English), or had a key word swapped for another, or a term paired with the wrong definition. The explanation quotes the original sentence.
- **Word of the day:** word, IPA, part of speech, definition, translation from the glossary, and an example sentence from the document with the word highlighted.
- **Top 5:** the five strongest terms of a section, each with its meaning.

Labels and explanations are written in the document's language. If the document doesn't have enough material for a template, the app says so instead of inventing content.

**Lexicon data.** `scripts/build-lexicon.mjs` builds three files into `public/lexicon/` from npm packages: word frequencies (SUBTLEX-US, 0.5 MB), IPA (CMU Pronouncing Dictionary, 1.1 MB) and definitions (Princeton WordNet 3.1, 5.2 MB). The script runs automatically before `dev`, `build` and `test`, and the output is git-ignored. The files are loaded only for English documents.

Attribution: WordNet 3.1 © Princeton University (WordNet licence); CMU Pronouncing Dictionary © Carnegie Mellon University (BSD); SUBTLEX-US word frequencies (Brysbaert & New); `compromise` (MIT); `pdf.js` (Apache-2.0); `mammoth` (BSD-2); `stopwords-iso` (MIT).

## Browser support

| | Preview | MP4 export |
| --- | --- | --- |
| Chrome / Edge (desktop and Android) | ✅ | ✅ WebCodecs, H.264 + AAC |
| Safari 17+ | ✅ | ✅ WebCodecs (audio codec support varies; falls back to Opus or silent with a warning) |
| Firefox | ✅ | WebCodecs where H.264 encoding is available, otherwise the real-time WebM fallback |

## Known limitations

- **Bidi is simplified.** Mixed Arabic and English text is handled for headline-length content (word order, punctuation, brackets, numbers). Deeply nested embeddings or explicit bidi control characters are not supported.
- **Arabic typewriter reveal** shows letters one at a time, so a letter's joined form can change as the next letter appears. Other animations are unaffected.
- **Fixed output**: 30 fps, 1080×1920, about 8 Mbps. There is no in-app trimming of music or voiceover: music starts at its beginning, and a voiceover longer than the video is cut (the app warns you).
- **The fallback recorder** (no WebCodecs) records in real time, needs the tab to stay visible, and usually produces WebM. Instagram and TikTok accept WebM inconsistently, so use Chrome or Edge for MP4.
- **Uploaded media isn't cleaned up.** Removing a music track or logo from the editor doesn't delete the file from IndexedDB, because saved projects may still use it. Clearing site data removes everything.
- **Storage is per browser.** Projects don't sync between devices or browsers. There is no import/export of projects yet.
- **Safe zones** are a general approximation of the Reels/TikTok/Shorts overlays. Each app's UI changes over time.
- **Preview audio** is scheduled against the Web Audio clock while the picture follows `requestAnimationFrame`. They can drift by a few milliseconds while you're editing, but exports are exact.
- **Document series**:
  - **Generated content is mechanical.** Questions come from the document's real sentences, and distractors are other words from the document, so read each video before posting.
  - **English gets the full toolset:** grammar tagging, dictionary definitions, IPA and verb conjugation. French and Arabic get keywords, retrieval, glossary definitions, fill-the-gap and swaps, but no dictionary fallback, IPA or part of speech unless the document provides them.
  - **Scanned PDFs** (images without a text layer) can't be read, because there's no OCR.
  - **Layout detection is heuristic.** Unusual PDF layouts (multi-column pages, text in images) can produce odd paragraphs.
- **Fonts**: video text uses Inter and Cairo, so scripts they don't cover (for example CJK) fall back to system fonts and may look different on another device.
