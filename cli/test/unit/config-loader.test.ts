import { describe, it, expect } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../../src/config/load-config.js';

function tempDir(): string {
  return join(tmpdir(), `sw-test-${randomBytes(4).toString('hex')}`);
}

describe('loadConfig', () => {
  it('returns defaults when config file is missing', async () => {
    const dir = tempDir();
    await mkdir(dir, { recursive: true });
    try {
      const config = await loadConfig(dir);
      expect(config.ttsProvider).toBe('piper');
      expect(config.openaiVoice).toBe('nova');
      expect(config.voice).toBe('en_US-amy-medium');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('parses valid config with schema defaults for missing fields', async () => {
    const dir = tempDir();
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(
        join(dir, 'screenwright.config.ts'),
        'export default { ttsProvider: "openai" };\n',
      );
      const config = await loadConfig(dir);
      expect(config.ttsProvider).toBe('openai');
      // Defaults applied for omitted fields
      expect(config.openaiVoice).toBe('nova');
      expect(config.voice).toBe('en_US-amy-medium');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws on invalid ttsProvider', async () => {
    const dir = tempDir();
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(
        join(dir, 'screenwright.config.ts'),
        'export default { ttsProvider: "elevenlabs" };\n',
      );
      await expect(loadConfig(dir)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws on invalid openaiVoice', async () => {
    const dir = tempDir();
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(
        join(dir, 'screenwright.config.ts'),
        'export default { openaiVoice: "invalid-voice" };\n',
      );
      await expect(loadConfig(dir)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when config has no default export', async () => {
    const dir = tempDir();
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(
        join(dir, 'screenwright.config.ts'),
        'export const config = { ttsProvider: "piper" };\n',
      );
      await expect(loadConfig(dir)).rejects.toThrow('must have a default export');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
