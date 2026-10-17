import { useEffect, useMemo, useState } from 'react';
import { previewAudio } from '@/audio/preview';
import type { AudioPlan } from '@/audio/mix';
import type { AnyFormat } from '@/formats/types';
import type { FrameBranding, LogoImage } from '@/render/branding';
import { safeDuration } from '@/render/duration';
import { useEditor } from '@/state/editor';
import { getMedia } from '@/storage/media';

const audioCache = new Map<string, Promise<AudioBuffer | null>>();
const imageCache = new Map<string, Promise<LogoImage | null>>();

export function loadAudioBuffer(id: string): Promise<AudioBuffer | null> {
  let p = audioCache.get(id);
  if (!p) {
    p = (async () => {
      const rec = await getMedia(id);
      if (!rec) return null;
      return previewAudio.decode(await rec.blob.arrayBuffer());
    })().catch((err: unknown) => {
      console.error('Could not decode audio', err);
      return null;
    });
    audioCache.set(id, p);
  }
  return p;
}

export function loadLogo(id: string): Promise<LogoImage | null> {
  let p = imageCache.get(id);
  if (!p) {
    p = (async () => {
      const rec = await getMedia(id);
      if (!rec) return null;
      const url = URL.createObjectURL(rec.blob);
      const img = new Image();
      img.src = url;
      await img.decode();
      // SVGs without intrinsic size report 0; give them a sensible box.
      const width = img.naturalWidth || 512;
      const height = img.naturalHeight || 512;
      return { image: img, width, height };
    })().catch((err: unknown) => {
      console.error('Could not load logo', err);
      return null;
    });
    imageCache.set(id, p);
  }
  return p;
}

function useAsync<T>(id: string | null, load: (id: string) => Promise<T | null>): T | null {
  const [state, setState] = useState<{ id: string | null; value: T | null }>({ id: null, value: null });
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void load(id).then((value) => {
      if (alive) setState({ id, value });
    });
    return () => {
      alive = false;
    };
  }, [id, load]);
  return id && state.id === id ? state.value : null;
}

export function useAudioBuffer(id: string | null): AudioBuffer | null {
  return useAsync(id, loadAudioBuffer);
}

export function useLogo(id: string | null): LogoImage | null {
  return useAsync(id, loadLogo);
}

/** Branding as the renderer needs it, with the logo image resolved. */
export function useFrameBranding(): FrameBranding {
  const branding = useEditor((s) => s.branding);
  const logo = useLogo(branding.logoId);
  return useMemo(
    () => ({ watermark: branding.watermark, watermarkPos: branding.watermarkPos, logo, logoPos: branding.logoPos, logoSize: branding.logoSize }),
    [branding, logo],
  );
}

/** Soundtrack description for the current format and data. */
export function useAudioPlan(format: AnyFormat, data: unknown): AudioPlan {
  const audio = useEditor((s) => s.audio);
  const music = useAudioBuffer(audio.musicId);
  const voice = useAudioBuffer(audio.voiceId);
  return useMemo(() => {
    let cues: AudioPlan['cues'] = [];
    try {
      cues = format.cues?.(data) ?? [];
    } catch {
      cues = [];
    }
    return {
      duration: safeDuration(format, data),
      cues,
      sfxEnabled: audio.sfx,
      sfxVolume: audio.sfxVolume,
      music: music ? { buffer: music, volume: audio.musicVolume } : null,
      voice: voice ? { buffer: voice, volume: audio.voiceVolume } : null,
      duck: audio.duck,
    };
  }, [format, data, audio, music, voice]);
}
