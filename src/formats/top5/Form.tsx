import { PaceField } from '@/components/PaceField';
import { Field, TextArea, TextInput } from '@/components/ui/fields';
import { AddButton, ListRow, moveItem } from '@/components/ui/list';
import { useMessages, useT } from '@/i18n';
import type { FormProps } from '../types';
import { ITEM_SECONDS, type RankItem, type Top5Data } from './schema';

const messages = {
  en: {
    title: 'Title',
    items: 'Ranking',
    itemsHint: 'Write #1 first. The video counts down from the last item to #1.',
    item: 'Item',
    detail: 'One-line detail (optional)',
    add: 'Add item',
    pace: 'Time per item',
  },
  fr: {
    title: 'Titre',
    items: 'Classement',
    itemsHint: 'Écrivez le n°1 en premier. La vidéo révèle du dernier au n°1.',
    item: 'Élément',
    detail: 'Détail sur une ligne (facultatif)',
    add: 'Ajouter un élément',
    pace: 'Durée par élément',
  },
  ar: {
    title: 'العنوان',
    items: 'الترتيب',
    itemsHint: 'اكتب رقم 1 أولًا. يعرض الفيديو العناصر من الأخير حتى رقم 1.',
    item: 'عنصر',
    detail: 'تفصيل في سطر واحد (اختياري)',
    add: 'أضف عنصرًا',
    pace: 'مدة كل عنصر',
  },
};

export function Top5Form({ value, onChange, errors }: FormProps<Top5Data>) {
  const m = useMessages(messages);
  const t = useT();
  const set = <K extends keyof Top5Data>(key: K, v: Top5Data[K]): void => onChange({ ...value, [key]: v });
  const setItem = (i: number, patch: Partial<RankItem>): void =>
    set(
      'items',
      value.items.map((it, j) => (j === i ? { ...it, ...patch } : it)),
    );

  return (
    <div className="space-y-5">
      <Field label={m.title} hint={t('markup.hint')} error={errors.title}>
        {(id) => <TextArea id={id} rows={2} value={value.title} maxLength={100} invalid={!!errors.title} onChange={(v) => set('title', v)} />}
      </Field>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink">{m.items}</legend>
        <p className={`-mt-1 text-xs ${errors.items ? 'font-medium text-rose-600' : 'text-ink/50'}`}>{errors.items ?? m.itemsHint}</p>
        {value.items.map((item, i) => (
          <ListRow
            key={i}
            index={i}
            count={value.items.length}
            minItems={3}
            onRemove={() => set('items', value.items.filter((_, j) => j !== i))}
            onMove={(d) => set('items', moveItem(value.items, i, d))}
            badge={
              <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-extrabold ${i === 0 ? 'bg-amber text-ink' : 'bg-ink/8 text-ink/60'}`}>{i + 1}</span>
            }
          >
            <TextInput value={item.text} maxLength={60} placeholder={`${m.item} ${i + 1}`} invalid={!!errors[`items.${i}.text`]} onChange={(v) => setItem(i, { text: v })} />
            <TextInput value={item.detail} maxLength={90} placeholder={m.detail} onChange={(v) => setItem(i, { detail: v })} />
          </ListRow>
        ))}
        <AddButton label={m.add} disabled={value.items.length >= 5} onClick={() => set('items', [...value.items, { text: '', detail: '' }])} />
      </fieldset>
      <PaceField label={m.pace} seconds={ITEM_SECONDS} value={value.pace} onChange={(v) => set('pace', v)} />
    </div>
  );
}
