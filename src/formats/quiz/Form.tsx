import { PaceField } from '@/components/PaceField';
import { Field, TextArea, TextInput } from '@/components/ui/fields';
import { AddButton, ListRow, moveItem } from '@/components/ui/list';
import { useMessages, useT } from '@/i18n';
import type { FormProps } from '../types';
import type { QuizData, QuizOption } from './schema';

const messages = {
  en: {
    label: 'Top label',
    question: 'Question',
    options: 'Answer options',
    optionsHint: 'Tick every correct answer.',
    option: 'Option',
    correct: 'Correct answer',
    addOption: 'Add option',
    timer: 'Countdown',
    explanation: 'Explanation',
    explanationHint: 'Shown after the reveal. Leave empty to skip this scene.',
  },
  fr: {
    label: 'Étiquette',
    question: 'Question',
    options: 'Réponses',
    optionsHint: 'Cochez chaque bonne réponse.',
    option: 'Réponse',
    correct: 'Bonne réponse',
    addOption: 'Ajouter une réponse',
    timer: 'Compte à rebours',
    explanation: 'Explication',
    explanationHint: 'Affichée après la révélation. Laissez vide pour la passer.',
  },
  ar: {
    label: 'الوسم العلوي',
    question: 'السؤال',
    options: 'الخيارات',
    optionsHint: 'حدّد كل إجابة صحيحة.',
    option: 'خيار',
    correct: 'إجابة صحيحة',
    addOption: 'أضف خيارًا',
    timer: 'العد التنازلي',
    explanation: 'الشرح',
    explanationHint: 'يظهر بعد كشف الإجابة. اتركه فارغًا لتخطيه.',
  },
};

export function QuizForm({ value, onChange, errors }: FormProps<QuizData>) {
  const m = useMessages(messages);
  const t = useT();
  const set = <K extends keyof QuizData>(key: K, v: QuizData[K]): void => onChange({ ...value, [key]: v });
  const setOption = (i: number, patch: Partial<QuizOption>): void =>
    set(
      'options',
      value.options.map((o, j) => (j === i ? { ...o, ...patch } : o)),
    );

  return (
    <div className="space-y-5">
      <Field label={m.label} optional error={errors.label}>
        {(id) => <TextInput id={id} value={value.label} maxLength={30} onChange={(v) => set('label', v)} />}
      </Field>
      <Field label={m.question} hint={t('markup.hint')} error={errors.question}>
        {(id) => <TextArea id={id} rows={2} value={value.question} maxLength={160} invalid={!!errors.question} onChange={(v) => set('question', v)} />}
      </Field>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink">{m.options}</legend>
        <p className={`-mt-1 text-xs ${errors.options ? 'font-medium text-rose-600' : 'text-ink/50'}`}>{errors.options ?? m.optionsHint}</p>
        {value.options.map((opt, i) => (
          <ListRow
            key={i}
            index={i}
            count={value.options.length}
            minItems={2}
            onRemove={() => set('options', value.options.filter((_, j) => j !== i))}
            onMove={(d) => set('options', moveItem(value.options, i, d))}
            badge={
              <button
                type="button"
                role="checkbox"
                aria-checked={opt.correct}
                aria-label={`${m.correct} ${i + 1}`}
                title={m.correct}
                onClick={() => setOption(i, { correct: !opt.correct })}
                className={`grid h-7 w-7 place-items-center rounded-full border-2 transition ${
                  opt.correct ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink/20 text-transparent hover:border-emerald-400'
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3.2"><path d="m5 12 5 5 9-10" /></svg>
              </button>
            }
          >
            <TextInput
              value={opt.text}
              maxLength={80}
              placeholder={`${m.option} ${i + 1}`}
              invalid={!!errors[`options.${i}.text`]}
              onChange={(v) => setOption(i, { text: v })}
            />
          </ListRow>
        ))}
        <AddButton
          label={m.addOption}
          disabled={value.options.length >= 4}
          onClick={() => set('options', [...value.options, { text: '', correct: false }])}
        />
      </fieldset>

      <PaceField label={m.timer} value={value.pace} onChange={(v) => set('pace', v)} />

      <Field label={m.explanation} optional hint={m.explanationHint} error={errors.explanation}>
        {(id) => <TextArea id={id} rows={3} value={value.explanation} maxLength={240} onChange={(v) => set('explanation', v)} />}
      </Field>
    </div>
  );
}
