import { describe, expect, it } from 'vitest';
import { ar } from './ar';
import { en } from './en';
import { fr } from './fr';
import { pickText, translate } from './index';

describe('i18n', () => {
  it('has every key translated in French and Arabic', () => {
    const keys = Object.keys(en).sort();
    expect(Object.keys(fr).sort()).toEqual(keys);
    expect(Object.keys(ar).sort()).toEqual(keys);
  });

  it('keeps placeholders in translations', () => {
    for (const [key, value] of Object.entries(en)) {
      const vars = value.match(/\{\w+\}/g) ?? [];
      for (const v of vars) {
        expect(fr[key as keyof typeof en], `${key} (fr)`).toContain(v);
        expect(ar[key as keyof typeof en], `${key} (ar)`).toContain(v);
      }
    }
  });

  it('interpolates variables and falls back to English for format text', () => {
    expect(translate('en', 'export.renderedIn', { s: '4.2' })).toBe('Rendered in 4.2s');
    expect(pickText('fr', { en: 'Quiz' })).toBe('Quiz');
    expect(pickText('ar', { en: 'Quiz', ar: 'اختبار' })).toBe('اختبار');
  });
});
