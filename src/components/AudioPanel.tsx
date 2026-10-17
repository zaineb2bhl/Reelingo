import { useState } from 'react';
import { loadAudioBuffer, useAudioBuffer } from '@/media/hooks';
import { useT } from '@/i18n';
import { useEditor } from '@/state/editor';
import { MEDIA_LIMITS, saveMedia, validateUpload, type MediaKind } from '@/storage/media';
import { FileButton, UploadIcon } from './ui/FileButton';
import { Toggle } from './ui/fields';

interface AudioPanelProps {
  videoDuration: number;
}

const accept = (kind: MediaKind): string => [...MEDIA_LIMITS[kind].types, ...MEDIA_LIMITS[kind].extensions.map((e) => `.${e}`)].join(',');

export function AudioPanel({ videoDuration }: AudioPanelProps) {
  const t = useT();
  const audio = useEditor((s) => s.audio);
  const setAudio = useEditor((s) => s.setAudio);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<MediaKind | null>(null);
  const voice = useAudioBuffer(audio.voiceId);

  const upload = async (kind: 'music' | 'voice', file: File): Promise<void> => {
    setError(null);
    const problem = validateUpload(kind, file);
    if (problem) {
      setError(t(problem === 'tooLarge' ? 'audio.errTooLarge' : 'audio.errType'));
      return;
    }
    setBusy(kind);
    try {
      const rec = await saveMedia(kind, file);
      const decoded = await loadAudioBuffer(rec.id);
      if (!decoded) {
        setError(t('audio.errDecode'));
        return;
      }
      if (kind === 'music') setAudio({ musicId: rec.id, musicName: file.name });
      else setAudio({ voiceId: rec.id, voiceName: file.name });
    } catch (err) {
      console.error(err);
      setError(t('audio.errDecode'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <Track
        title={t('audio.music')}
        hint={t('audio.musicHint')}
        name={audio.musicId ? audio.musicName : null}
        volume={audio.musicVolume}
        busy={busy === 'music'}
        accept={accept('music')}
        onFile={(f) => void upload('music', f)}
        onVolume={(v) => setAudio({ musicVolume: v })}
        onRemove={() => setAudio({ musicId: null, musicName: '' })}
      />
      <Track
        title={t('audio.voice')}
        hint={t('audio.voiceHint')}
        name={audio.voiceId ? audio.voiceName : null}
        volume={audio.voiceVolume}
        busy={busy === 'voice'}
        accept={accept('voice')}
        onFile={(f) => void upload('voice', f)}
        onVolume={(v) => setAudio({ voiceVolume: v })}
        onRemove={() => setAudio({ voiceId: null, voiceName: '' })}
      />
      {voice && voice.duration > videoDuration + 0.05 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('audio.voiceTooLong', { voice: voice.duration.toFixed(1), video: videoDuration.toFixed(1) })}
        </p>
      )}
      {audio.musicId && audio.voiceId && <Toggle checked={audio.duck} onChange={(duck) => setAudio({ duck })} label={t('audio.duck')} />}

      <div className="space-y-2 border-t border-ink/8 pt-4">
        <Toggle checked={audio.sfx} onChange={(sfx) => setAudio({ sfx })} label={t('audio.sfx')} />
        {audio.sfx && <Volume label={t('audio.sfxVolume')} value={audio.sfxVolume} onChange={(v) => setAudio({ sfxVolume: v })} />}
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}
    </div>
  );
}

interface TrackProps {
  title: string;
  hint: string;
  name: string | null;
  volume: number;
  busy: boolean;
  accept: string;
  onFile: (file: File) => void;
  onVolume: (v: number) => void;
  onRemove: () => void;
}

function Track({ title, hint, name, volume, busy, accept: acceptTypes, onFile, onVolume, onRemove }: TrackProps) {
  const t = useT();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {name ? (
          <button type="button" onClick={onRemove} className="text-xs font-semibold text-ink/50 hover:text-rose-600">
            {t('common.remove')}
          </button>
        ) : (
          <FileButton accept={acceptTypes} onFile={onFile} disabled={busy}>
            <UploadIcon />
            {busy ? t('audio.loading') : t('audio.upload')}
          </FileButton>
        )}
      </div>
      {name ? (
        <>
          <p className="truncate rounded-lg bg-ink/[0.04] px-3 py-2 text-xs font-medium" title={name}>
            ♪ {name}
          </p>
          <Volume label={t('audio.volume')} value={volume} onChange={onVolume} />
        </>
      ) : (
        <p className="text-xs text-ink/50">{hint}</p>
      )}
    </div>
  );
}

function Volume({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-xs font-medium text-ink/60">
      <span className="w-20 shrink-0">{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-tangerine" />
      <span className="w-9 text-right font-mono tabular-nums">{Math.round(value * 100)}</span>
    </label>
  );
}

