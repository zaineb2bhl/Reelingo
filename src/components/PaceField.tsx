import { useT } from '@/i18n';
import { PACES, PACE_SECONDS, type Pace } from '@/formats/shared';
import { Field, Segmented } from './ui/fields';

interface PaceFieldProps {
  value: Pace;
  onChange: (pace: Pace) => void;
  /** Seconds shown next to each preset; defaults to the countdown lengths. */
  seconds?: Record<Pace, number>;
  label?: string;
}

export function PaceField({ value, onChange, seconds = PACE_SECONDS, label }: PaceFieldProps) {
  const t = useT();
  const options = PACES.map((p) => ({ value: p, label: `${t(`pace.${p}`)} · ${t('common.seconds', { n: seconds[p] })}` }));
  const title = label ?? t('pace.label');
  return (
    <Field label={title}>
      {() => <Segmented ariaLabel={title} value={value} options={options} onChange={onChange} />}
    </Field>
  );
}
