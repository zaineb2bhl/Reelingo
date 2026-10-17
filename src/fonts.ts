import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/800.css';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/800.css';
import { clearTextCache } from '@/scene/text';

const WEIGHTS = [400, 600, 800] as const;

/**
 * Canvas text silently falls back to system fonts if a web font has not
 * loaded yet, so every render waits for these first.
 */
export async function loadFonts(timeoutMs = 4000): Promise<void> {
  const loads = WEIGHTS.flatMap((w) => [
    document.fonts.load(`${w} 40px Inter`, 'Aa Éé'),
    // IPA symbols live in the latin-ext subset, which only loads on demand.
    document.fonts.load(`${w} 40px Inter`, 'ə ɪ ˈ ŋ ʃ œ'),
    document.fonts.load(`${w} 40px Cairo`, 'عربي'),
    document.fonts.load(`${w} 40px Cairo`, 'Aa'),
  ]);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([Promise.allSettled(loads).then(() => undefined), timeout]);
  clearTextCache();
}
