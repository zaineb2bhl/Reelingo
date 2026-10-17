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
- **AI fill (optional)**: describe a topic and Claude drafts the template content. This uses your own Anthropic API key (see below).
- **Turn a document into a series (optional)**: upload a PDF, Word (.docx), TXT or Markdown file, choose how many of each template you want, and Claude writes up to 10 videos based only on that document. Each video is saved as a project with a note pointing to where in the document it came from.

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
| `npm run e2e:series -- <document> [outDir]` | Runs the document-to-series flow in Chrome with the Anthropic API stubbed (no credit used) and checks that the projects are created |
| `npm run e2e:ui -- [outDir]` | Clicks through the app in Chrome (home, editors, export, save, uploads, Arabic UI, mobile) and saves screenshots |

The two `e2e:*` scripts need the dev server running and a local Chrome or Edge. Set `CHROME_PATH` if yours isn't found automatically.

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
  state/             zustand stores (editor, settings)
  ai/                AI fill: prompt + validated structured output with retry
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
  cues: (d) => [{ t: timeline(d).get('back').start, sfx: 'pop' }],     // optional
  aiGuide: 'front: ≤60 chars, the word. back: ≤120 chars, its meaning.', // optional, for AI fill
});
```

Tips:
- Keep important content inside `SAFE` (the area the Reels/TikTok/Shorts overlays don't cover). The preview's "Safe zones" toggle shows it.
- Build forms from the controls in `src/components/ui/` (`Field`, `TextInput`, `TextArea`, `Segmented`, `Toggle`, `ListRow`, `AddButton`) and put form labels in a local `messages` object read with `useMessages()`.
- Use `PaceField` and `paceSchema` if your format has a "time per card" setting.
- `npm run sheet -- flashcard ink out.png` renders frames so you can check the timing.
- `src/formats/starter/` is a small, hidden example format to copy from.

## AI fill and your API key

AI fill is optional. In **Settings**, paste an Anthropic API key and choose a model (Claude Opus 5.5 by default; Sonnet 5.5 and Haiku 5.5 are cheaper). The key is stored only in this browser's `localStorage`. Requests go directly from the browser to `api.anthropic.com` using the official SDK's `dangerouslyAllowBrowser` mode. Usage is billed to the key owner's account.

Each request asks for structured output generated from the format's Zod schema (`messages.parse` + `betaZodOutputFormat`). The app then re-validates the result with the same schema. On failure it retries once with the validation errors included in the prompt. Server-side refusal fallback (`fallbacks: "default"`) is enabled.

### Documents → series

The **From a document** page doesn't use classic RAG (chunking, embeddings, vector search), because it doesn't need it. The whole document goes to Claude, which reads it in full:
- **PDFs** are sent as-is, so Claude also sees tables and images.
- **DOCX files** are converted to text in the browser with `mammoth`.
- **TXT and Markdown files** are sent as text.

Limits are 20 MB per file and about 1.5 million characters of text.

The app sends one request per template, and each asks for an array of videos with a `source` note. Items are validated one by one, so one bad item doesn't discard the rest, and the app asks once more for any that are missing. The document block is marked for prompt caching, and the requests run one after another, so after the first request the document is read from the cache (cheaper, for a few minutes). Structured output can't be combined with citations, so instead of citations each video carries a free-text source note (page, section or short quote). The editor shows this note above the form so you can check the content against the document.

The document is stored in the browser (IndexedDB) for reuse, and is sent to Anthropic only when you click Generate.

Because the key sits in the browser, anyone with access to that browser profile can read it. For a public deployment where you supply the key yourself, put a small server-side proxy in front of the API instead.

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
  - Claude's source notes are not verified against the document, so read the videos before you post them.
  - Scanned PDFs without a text layer depend on Claude reading the page images.
  - Very long documents (hundreds of pages) make each request slower and more expensive.
- **Fonts**: video text uses Inter and Cairo, so scripts they don't cover (for example CJK) fall back to system fonts and may look different on another device.
