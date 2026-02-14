import { describe, it, expect } from 'vitest';
import { stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { synthesize } from '../../src/voiceover/piper-engine.js';
import { downloadPiper, downloadVoiceModel, DEFAULT_VOICE } from '../../src/voiceover/voice-models.js';

describe('Piper TTS', () => {
  it('downloadPiper resolves to a working binary', async () => {
    const bin = await downloadPiper();
    expect(bin).toBeTruthy();
    expect(typeof bin).toBe('string');
  }, 120_000);

  it('synthesizes "Hello world" to a valid WAV file', async () => {
    const piperBin = await downloadPiper();
    const modelPath = await downloadVoiceModel(DEFAULT_VOICE);
    const outPath = join(tmpdir(), `piper-test-${Date.now()}.wav`);

    try {
      const result = await synthesize('Hello world', outPath, modelPath, piperBin);

      expect(result.audioPath).toBe(outPath);
      expect(result.durationMs).toBeGreaterThan(0);

      const fileStat = await stat(outPath);
      expect(fileStat.size).toBeGreaterThan(44); // Larger than WAV header
    } finally {
      await rm(outPath, { force: true }).catch(() => {});
    }
  }, 30_000);

  it('synthesizes a longer sentence', async () => {
    const piperBin = await downloadPiper();
    const modelPath = await downloadVoiceModel(DEFAULT_VOICE);
    const outPath = join(tmpdir(), `piper-test-long-${Date.now()}.wav`);

    try {
      const result = await synthesize(
        'This is a longer sentence to verify that Piper can handle multi-word narration text.',
        outPath,
        modelPath,
        piperBin,
      );

      expect(result.durationMs).toBeGreaterThan(500);

      const fileStat = await stat(outPath);
      expect(fileStat.size).toBeGreaterThan(1000);
    } finally {
      await rm(outPath, { force: true }).catch(() => {});
    }
  }, 30_000);
});
