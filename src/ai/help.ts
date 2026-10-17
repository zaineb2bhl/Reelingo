/** Exact commands shown when Ollama can't be reached (also documented in the README). */

export type Platform = 'windows' | 'macos' | 'linux';

export function corsCommands(origin: string): Record<Platform, string> {
  return {
    windows: `setx OLLAMA_ORIGINS "${origin}"\n# then quit Ollama from the system tray and start it again`,
    macos: `launchctl setenv OLLAMA_ORIGINS "${origin}"\n# then quit Ollama from the menu bar and start it again`,
    linux: `sudo systemctl edit ollama.service\n# add these two lines, save, then:\n#   [Service]\n#   Environment="OLLAMA_ORIGINS=${origin}"\nsudo systemctl daemon-reload && sudo systemctl restart ollama`,
  };
}

export const startCommand = 'ollama serve';
export const pullCommand = (model: string): string => `ollama pull ${model}`;

export function detectPlatform(userAgent: string): Platform {
  if (/windows/i.test(userAgent)) return 'windows';
  if (/mac os|macintosh/i.test(userAgent)) return 'macos';
  return 'linux';
}
