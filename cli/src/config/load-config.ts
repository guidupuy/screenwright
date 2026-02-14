import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { access } from 'node:fs/promises';
import { configSchema, type ScreenwrightConfig } from './config-schema.js';
import { defaultConfig } from './defaults.js';

/**
 * Load screenwright.config.ts from project root.
 * Falls back to defaults if file is missing.
 */
export async function loadConfig(cwd?: string): Promise<ScreenwrightConfig> {
  const configPath = resolve(cwd ?? process.cwd(), 'screenwright.config.ts');

  try {
    await access(configPath);
  } catch {
    return { ...defaultConfig };
  }

  let mod: any;
  try {
    mod = await import(pathToFileURL(configPath).href);
  } catch (err: any) {
    throw new Error(`Failed to load screenwright.config.ts: ${err.message}`);
  }

  const raw = mod.default;
  if (raw === undefined) {
    throw new Error('screenwright.config.ts must have a default export');
  }

  return configSchema.parse(raw);
}
