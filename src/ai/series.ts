import { z } from 'zod';
import type { AnyFormat } from '@/formats/types';
import { documentBlock, type PreparedDocument } from './document';
import { AiError, describeIssues, toAiError, type GenerateOptions } from './generate';
import { SYSTEM_PROMPT } from './prompt';

export const MAX_SERIES_VIDEOS = 10;

export const SERIES_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

The teacher has attached a document (course notes, a textbook chapter, a worksheet, a transcript…). Base every video on what that document teaches. Do not introduce facts, vocabulary or rules the document does not support. Pick the most useful points for learners, and make every video in a series cover a different point.

Unless the teacher's instructions say otherwise, write the videos in the language the document teaches, with any explanations in the language the document uses for instructions.

For each video, fill \`source\` with where it comes from in the document: a page number or section heading if one is visible, otherwise a short quote (at most 120 characters). The teacher uses it to check your work; it is not shown in the video.`;

export interface SeriesItem {
  data: unknown;
  source: string;
}

export function buildSeriesPrompt(format: AnyFormat, count: number, instructions: string, avoid: readonly string[], feedback: string): string {
  const lines = [
    `Create ${count} video${count === 1 ? '' : 's'} in the "${format.title.en}" format (${format.description.en}) based on the attached document.`,
    `Return them in \`videos\`, each with \`source\` and \`content\`.`,
  ];
  if (format.aiGuide) lines.push('', `Field guide for \`content\`: ${format.aiGuide}`);
  lines.push('', 'Sample `content` for this format (match its style, not its topic):', JSON.stringify(format.defaults));
  if (instructions.trim()) lines.push('', `Teacher's instructions: ${instructions.trim()}`);
  if (avoid.length) lines.push('', 'Already created (cover different points):', ...avoid.map((a) => `- ${a}`));
  if (feedback) lines.push('', 'Your previous answer had problems:', feedback, 'Fix them in this answer.');
  return lines.join('\n');
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Short description of a generated item, used to steer away from duplicates. */
function summarise(data: unknown): string {
  return JSON.stringify(data).slice(0, 160);
}

/**
 * Generates `count` videos of one format from a document. Items are validated
 * one by one against the format's schema so a single bad item doesn't throw
 * away the rest; missing items are requested once more with the errors.
 */
export async function generateSeriesForFormat(
  format: AnyFormat,
  count: number,
  doc: PreparedDocument,
  instructions: string,
  opts: GenerateOptions,
): Promise<SeriesItem[]> {
  if (!opts.apiKey) throw new AiError('noKey', 'No API key');
  const [{ default: Anthropic }, { betaZodOutputFormat }] = await Promise.all([import('@anthropic-ai/sdk'), import('@anthropic-ai/sdk/helpers/beta/zod')]);
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const wrapper = z.object({ videos: z.array(z.object({ source: z.string(), content: format.schema })) });
  const items: SeriesItem[] = [];
  let feedback = '';

  for (let attempt = 0; attempt < 2 && items.length < count; attempt++) {
    const need = count - items.length;
    let raw: unknown;
    try {
      const response = await client.beta.messages.create(
        {
          model: opts.model,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'medium', format: betaZodOutputFormat(wrapper) },
          system: SERIES_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [documentBlock(doc), { type: 'text', text: buildSeriesPrompt(format, need, instructions, items.map((i) => summarise(i.data)), feedback) }],
            },
          ],
        },
        { signal: opts.signal },
      );
      if (response.stop_reason === 'refusal') throw new AiError('refusal', response.stop_details?.explanation ?? 'Request declined');
      const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      raw = JSON.parse(text);
    } catch (err) {
      const apiError = toAiError(Anthropic, err);
      if (apiError) throw apiError;
      if (opts.signal?.aborted) throw err;
      feedback = '- The answer was not valid JSON for the requested schema.';
      continue;
    }

    const videos = isRecord(raw) && Array.isArray(raw.videos) ? raw.videos : [];
    const problems: string[] = [];
    videos.forEach((video, i) => {
      if (items.length >= count) return;
      const checked = format.schema.safeParse(isRecord(video) ? video.content : undefined);
      if (checked.success) {
        const source = isRecord(video) && typeof video.source === 'string' ? video.source.trim().slice(0, 300) : '';
        items.push({ data: checked.data, source });
      } else {
        problems.push(`Video ${i + 1}:\n${describeIssues(checked.error)}`);
      }
    });
    if (videos.length < need) problems.push(`- Only ${videos.length} of the ${need} requested videos were returned.`);
    feedback = problems.join('\n');
  }

  if (items.length === 0) throw new AiError('invalid', feedback || 'No valid videos');
  return items;
}
