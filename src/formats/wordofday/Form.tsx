import { PaceField } from '@/components/PaceField';
import { Field, TextArea, TextInput, Toggle } from '@/components/ui/fields';
import { useMessages, useT } from '@/i18n';
import type { FormProps } from '../types';
import type { WordOfDayData } from './schema';

const messages = {
  en: {
    label: 'Top label',
    word: 'Word or expression',
    ipa: 'Pronunciation (IPA)',
    ipaHint: 'Slashes are added automatically.',
    pos: 'Part of speech',
    posPlaceholder: 'noun, verb, phrasal verb…',
    definition: 'Definition',
    example: 'Example sentence',
    translation: 'Translation',
    translationPlaceholder: 'e.g. FR : un heureux hasard',
    highlight: 'Highlight the word in the example',
    pace: 'Reading time at the end',
  },
  fr: {
    label: 'Étiquette',
    word: 'Mot ou expression',
    ipa: 'Prononciation (API)',
    ipaHint: 'Les barres obliques sont ajoutées automatiquement.',
    pos: 'Nature',
    posPlaceholder: 'nom, verbe…',
    definition: 'Définition',
    example: 'Phrase d’exemple',
    translation: 'Traduction',
    translationPlaceholder: 'ex. AR : صدفة سعيدة',
    highlight: 'Surligner le mot dans l’exemple',
    pace: 'Temps de lecture final',
  },
  ar: {
    label: 'الوسم العلوي',
    word: 'الكلمة أو التعبير',
    ipa: 'النطق (IPA)',
    ipaHint: 'تُضاف الشرطتان تلقائيًا.',
    pos: 'نوع الكلمة',
    posPlaceholder: 'اسم، فعل…',
    definition: 'التعريف',
    example: 'جملة مثال',
    translation: 'الترجمة',
    translationPlaceholder: 'مثلًا: صدفة سعيدة',
    highlight: 'إبراز الكلمة في المثال',
    pace: 'وقت القراءة في النهاية',
  },
};

export function WordOfDayForm({ value, onChange, errors }: FormProps<WordOfDayData>) {
  const m = useMessages(messages);
  const t = useT();
  const set = <K extends keyof WordOfDayData>(key: K, v: WordOfDayData[K]): void => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-5">
      <Field label={m.label} optional error={errors.label}>
        {(id) => <TextInput id={id} value={value.label} maxLength={30} onChange={(v) => set('label', v)} />}
      </Field>
      <Field label={m.word} error={errors.word}>
        {(id) => <TextInput id={id} value={value.word} maxLength={40} invalid={!!errors.word} onChange={(v) => set('word', v)} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={m.ipa} optional hint={m.ipaHint} error={errors.ipa}>
          {(id) => <TextInput id={id} value={value.ipa} maxLength={60} onChange={(v) => set('ipa', v)} />}
        </Field>
        <Field label={m.pos} optional error={errors.partOfSpeech}>
          {(id) => <TextInput id={id} value={value.partOfSpeech} maxLength={30} placeholder={m.posPlaceholder} onChange={(v) => set('partOfSpeech', v)} />}
        </Field>
      </div>
      <Field label={m.definition} hint={t('markup.hint')} error={errors.definition}>
        {(id) => <TextArea id={id} rows={3} value={value.definition} maxLength={220} invalid={!!errors.definition} onChange={(v) => set('definition', v)} />}
      </Field>
      <Field label={m.example} optional error={errors.example}>
        {(id) => <TextArea id={id} rows={2} value={value.example} maxLength={220} onChange={(v) => set('example', v)} />}
      </Field>
      <Toggle checked={value.highlight} onChange={(v) => set('highlight', v)} label={m.highlight} />
      <Field label={m.translation} optional error={errors.translation}>
        {(id) => <TextInput id={id} value={value.translation} maxLength={140} placeholder={m.translationPlaceholder} onChange={(v) => set('translation', v)} />}
      </Field>
      <PaceField label={m.pace} value={value.pace} onChange={(v) => set('pace', v)} />
    </div>
  );
}
