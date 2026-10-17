import { Field, TextArea, TextInput } from '@/components/ui/fields';
import { PaceField } from '@/components/PaceField';
import { useMessages, useT } from '@/i18n';
import type { FormProps } from '../types';
import type { StarterData } from './index';

const messages = {
  en: { tag: 'Tag', headline: 'Headline', subtitle: 'Subtitle' },
  fr: { tag: 'Étiquette', headline: 'Titre', subtitle: 'Sous-titre' },
  ar: { tag: 'وسم', headline: 'العنوان', subtitle: 'العنوان الفرعي' },
};

export function StarterForm({ value, onChange, errors }: FormProps<StarterData>) {
  const m = useMessages(messages);
  const t = useT();
  const set = <K extends keyof StarterData>(key: K, v: StarterData[K]): void => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-5">
      <Field label={m.tag} optional error={errors.tag}>
        {(id) => <TextInput id={id} value={value.tag} maxLength={24} onChange={(v) => set('tag', v)} />}
      </Field>
      <Field label={m.headline} hint={t('markup.hint')} error={errors.headline}>
        {(id) => <TextArea id={id} rows={2} value={value.headline} maxLength={120} invalid={!!errors.headline} onChange={(v) => set('headline', v)} />}
      </Field>
      <Field label={m.subtitle} optional error={errors.subtitle}>
        {(id) => <TextInput id={id} value={value.subtitle} maxLength={160} onChange={(v) => set('subtitle', v)} />}
      </Field>
      <PaceField value={value.pace} onChange={(v) => set('pace', v)} />
    </div>
  );
}
