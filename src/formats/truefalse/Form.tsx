import { PaceField } from '@/components/PaceField';
import { Field, Segmented, TextArea, TextInput } from '@/components/ui/fields';
import { useMessages, useT } from '@/i18n';
import type { FormProps } from '../types';
import type { TrueFalseData } from './schema';

const messages = {
  en: {
    label: 'Top label',
    statement: 'Statement',
    answer: 'The statement is…',
    labels: 'Button labels',
    labelsHint: 'Translate them for your audience, e.g. Vrai / Faux or صح / خطأ.',
    timer: 'Countdown',
    explanation: 'Explanation',
    explanationHint: 'Shown after the reveal. Leave empty to skip it.',
  },
  fr: {
    label: 'Étiquette',
    statement: 'Affirmation',
    answer: 'L’affirmation est…',
    labels: 'Libellés des boutons',
    labelsHint: 'Adaptez-les à votre public, ex. Vrai / Faux.',
    timer: 'Compte à rebours',
    explanation: 'Explication',
    explanationHint: 'Affichée après la révélation. Laissez vide pour la passer.',
  },
  ar: {
    label: 'الوسم العلوي',
    statement: 'العبارة',
    answer: 'العبارة…',
    labels: 'نصوص الأزرار',
    labelsHint: 'ترجمها لجمهورك، مثل صح / خطأ.',
    timer: 'العد التنازلي',
    explanation: 'الشرح',
    explanationHint: 'يظهر بعد كشف الإجابة. اتركه فارغًا لتخطيه.',
  },
};

export function TrueFalseForm({ value, onChange, errors }: FormProps<TrueFalseData>) {
  const m = useMessages(messages);
  const t = useT();
  const set = <K extends keyof TrueFalseData>(key: K, v: TrueFalseData[K]): void => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-5">
      <Field label={m.label} optional error={errors.label}>
        {(id) => <TextInput id={id} value={value.label} maxLength={30} onChange={(v) => set('label', v)} />}
      </Field>
      <Field label={m.statement} hint={t('markup.hint')} error={errors.statement}>
        {(id) => <TextArea id={id} rows={3} value={value.statement} maxLength={180} invalid={!!errors.statement} onChange={(v) => set('statement', v)} />}
      </Field>
      <Field label={m.answer}>
        {() => (
          <Segmented
            ariaLabel={m.answer}
            value={value.answer ? 'true' : 'false'}
            options={[
              { value: 'true', label: value.trueLabel || 'True' },
              { value: 'false', label: value.falseLabel || 'False' },
            ]}
            onChange={(v) => set('answer', v === 'true')}
          />
        )}
      </Field>
      <Field label={m.labels} hint={m.labelsHint} error={errors.trueLabel ?? errors.falseLabel}>
        {(id) => (
          <div className="grid grid-cols-2 gap-2">
            <TextInput id={id} value={value.trueLabel} maxLength={14} invalid={!!errors.trueLabel} onChange={(v) => set('trueLabel', v)} />
            <TextInput value={value.falseLabel} maxLength={14} invalid={!!errors.falseLabel} onChange={(v) => set('falseLabel', v)} />
          </div>
        )}
      </Field>
      <PaceField label={m.timer} value={value.pace} onChange={(v) => set('pace', v)} />
      <Field label={m.explanation} optional hint={m.explanationHint} error={errors.explanation}>
        {(id) => <TextArea id={id} rows={3} value={value.explanation} maxLength={240} onChange={(v) => set('explanation', v)} />}
      </Field>
    </div>
  );
}
