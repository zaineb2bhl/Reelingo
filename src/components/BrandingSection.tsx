import { useState } from 'react';
import { loadLogo } from '@/media/hooks';
import { useT } from '@/i18n';
import { BRAND_POSITIONS, LOGO_SIZES, type BrandPosition, type LogoSize } from '@/render/branding';
import { useEditor } from '@/state/editor';
import { MEDIA_LIMITS, saveMedia, validateUpload } from '@/storage/media';
import { FileButton, UploadIcon } from './ui/FileButton';
import { Field, Segmented, TextInput } from './ui/fields';

export function BrandingSection() {
  const t = useT();
  const branding = useEditor((s) => s.branding);
  const setBranding = useEditor((s) => s.setBranding);
  const [error, setError] = useState<string | null>(null);

  const uploadLogo = async (file: File): Promise<void> => {
    setError(null);
    const problem = validateUpload('logo', file);
    if (problem) {
      setError(t(problem === 'tooLarge' ? 'brand.errTooLarge' : 'brand.errType'));
      return;
    }
    const rec = await saveMedia('logo', file);
    if (!(await loadLogo(rec.id))) {
      setError(t('brand.errType'));
      return;
    }
    setBranding({ logoId: rec.id, logoName: file.name });
  };

  const sizes = (Object.keys(LOGO_SIZES) as LogoSize[]).map((s) => ({ value: s, label: t(`brand.size.${s}`) }));

  return (
    <div className="space-y-5">
      <Field label={t('brand.watermark')} optional hint={t('brand.watermarkHint')}>
        {(id) => (
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <TextInput id={id} value={branding.watermark} maxLength={40} placeholder="@yourhandle" onChange={(v) => setBranding({ watermark: v })} />
            </div>
            <PositionPicker value={branding.watermarkPos} onChange={(p) => setBranding({ watermarkPos: p })} />
          </div>
        )}
      </Field>

      <Field label={t('brand.logo')} optional hint={branding.logoId ? undefined : t('brand.logoHint')} error={error ?? undefined}>
        {() =>
          branding.logoId ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate rounded-lg bg-ink/[0.04] px-3 py-2 text-xs font-medium">{branding.logoName}</p>
                <PositionPicker value={branding.logoPos} onChange={(p) => setBranding({ logoPos: p })} />
                <button type="button" onClick={() => setBranding({ logoId: null, logoName: '' })} className="px-1 text-xs font-semibold text-ink/50 hover:text-rose-600">
                  {t('common.remove')}
                </button>
              </div>
              <Segmented ariaLabel={t('brand.logoSize')} value={branding.logoSize} options={sizes} onChange={(s) => setBranding({ logoSize: s })} />
            </div>
          ) : (
            <FileButton accept={[...MEDIA_LIMITS.logo.types, ...MEDIA_LIMITS.logo.extensions.map((e) => `.${e}`)].join(',')} onFile={(f) => void uploadLogo(f)}>
              <UploadIcon />
              {t('brand.uploadLogo')}
            </FileButton>
          )
        }
      </Field>
    </div>
  );
}

function PositionPicker({ value, onChange }: { value: BrandPosition; onChange: (p: BrandPosition) => void }) {
  const t = useT();
  return (
    <div className="grid h-[42px] w-[42px] shrink-0 grid-cols-2 gap-[3px] rounded-lg bg-ink/[0.06] p-[3px]" role="radiogroup" aria-label={t('brand.position')}>
      {BRAND_POSITIONS.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          aria-label={t(`brand.pos.${p}`)}
          title={t(`brand.pos.${p}`)}
          onClick={() => onChange(p)}
          className={`rounded-[4px] transition ${value === p ? 'bg-tangerine' : 'bg-white hover:bg-ink/10'}`}
        />
      ))}
    </div>
  );
}
