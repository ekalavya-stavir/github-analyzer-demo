import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONFIG_FILENAME = '.analyserrc';

const DEFAULTS = {
  exclude_users: [
    'dependabot[bot]',
    'skStavir',
    'copilot-pull-request-reviewer[bot]',
    'github-actions[bot]',
  ],
};

export function loadConfig(basePath = process.cwd()) {
  const config = { ...DEFAULTS };
  const filePath = resolve(basePath, CONFIG_FILENAME);

  try {
    const raw = readFileSync(filePath, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;

      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();

      if (key === 'exclude_users') {
        config.exclude_users = value
          .split(',')
          .map((u) => u.trim())
          .filter(Boolean);
      }
    }
  } catch {
    // No config file found — use defaults
  }

  return config;
}
