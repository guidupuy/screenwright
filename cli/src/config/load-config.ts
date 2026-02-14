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
  const originalEmit = process.emit;
  // @ts-expect-error -- monkey-patch to suppress MODULE_TYPELESS_PACKAGE_JSON for user config files
  process.emit = function (event, ...args) {
    if (event === 'warning' && args[0]?.code === 'MODULE_TYPELESS_PACKAGE_JSON') {
      return false;
    }
    return originalEmit.apply(process, [event, ...args] as any);
  };
  try {
    mod = await import(pathToFileURL(configPath).href);
  } catch (err: any) {
    throw new Error(`Failed to load screenwright.config.ts: ${err.message}`);
  } finally {
    process.emit = originalEmit;
  }

  const raw = mod.default;
  if (raw === undefined) {
    throw new Error('screenwright.config.ts must have a default export');
  }

  return configSchema.parse(raw);
}
