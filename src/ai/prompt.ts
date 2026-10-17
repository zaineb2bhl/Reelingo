import type { AnyFormat } from '@/formats/types';

export const SYSTEM_PROMPT = `You write content for short vertical videos (Instagram Reels, TikTok, YouTube Shorts) made by language teachers for their learners.

Content must be accurate, level-appropriate and natural. Prefer everyday, useful language over rare trivia. Keep every text short enough to read on a phone in a few seconds. Write the on-screen text in the language the topic asks for; if it does not say, use English. When the teacher's audience reads Arabic, write Arabic naturally (right-to-left is handled by the app).

The app supports one formatting trick: wrapping a word or short phrase in *stars* colours it on screen. Use it at most once or twice per text, only on the key word.

Return only the JSON object for the requested video format.`;

export function buildUserPrompt(format: AnyFormat, topic: string, sample: unknown): string {
  const lines = [
    `Video format: ${format.title.en} (${format.description.en})`,
    '',
    `Topic from the teacher: ${topic.trim()}`,
  ];
  if (format.aiGuide) lines.push('', `Field guide: ${format.aiGuide}`);
  lines.push('', `For reference, this is the sample content for this format (match its style, not its topic):`, JSON.stringify(sample));
  return lines.join('\n');
}

export function buildRetryNote(problems: string): string {
  return `Your previous answer did not pass validation:\n${problems}\nReturn a corrected JSON object that fixes every problem.`;
}
