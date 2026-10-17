import { useState } from 'react';
import { corsCommands, detectPlatform, pullCommand, startCommand, type Platform } from '@/ai/help';
import type { OllamaErrorKind } from '@/ai/ollama';
import { useT } from '@/i18n';

interface OllamaHelpProps {
  error: OllamaErrorKind | 'missing-model';
  baseUrl: string;
  model: string;
}

/** Explains what went wrong talking to Ollama and gives the exact command to fix it. */
export function OllamaHelp({ error, baseUrl, model }: OllamaHelpProps) {
  const t = useT();
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform(navigator.userAgent));
  const origin = window.location.origin;

  if (error === 'model-missing' || error === 'missing-model') {
    return (
      <HelpBox title={t('ollama.err.modelMissing', { model })}>
        <p>{t('ollama.help.pull')}</p>
        <Code>{pullCommand(model)}</Code>
      </HelpBox>
    );
  }
  if (error === 'cors') {
    const commands = corsCommands(origin);
    return (
      <HelpBox title={t('ollama.err.cors')}>
        <p>{t('ollama.help.cors', { origin })}</p>
        <div className="flex gap-1" role="tablist">
          {(['windows', 'macos', 'linux'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={platform === p}
              onClick={() => setPlatform(p)}
              className={`rounded-md px-2 py-1 text-xs font-semibold ${platform === p ? 'bg-amber-900 text-white' : 'text-amber-900 hover:bg-amber-100'}`}
            >
              {t(`ollama.platform.${p}`)}
            </button>
          ))}
        </div>
        <Code>{commands[platform]}</Code>
      </HelpBox>
    );
  }
  if (error === 'timeout') {
    return (
      <HelpBox title={t('ollama.err.timeout')}>
        <p>{t('ollama.help.timeout')}</p>
      </HelpBox>
    );
  }
  return (
    <HelpBox title={t('ollama.err.notRunning', { url: baseUrl })}>
      <p>{t('ollama.help.start')}</p>
      <Code>{startCommand}</Code>
      <p>{t('ollama.help.install')}</p>
    </HelpBox>
  );
}

function HelpBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
      <p className="font-semibold">{title}</p>
      {children}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre dir="ltr" className="overflow-x-auto rounded-lg bg-ink px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre text-white select-all">
      {children}
    </pre>
  );
}
