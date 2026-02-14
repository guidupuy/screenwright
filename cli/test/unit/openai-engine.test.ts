import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises and child_process before importing
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 16000 }), // ~1s at 128kbps
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb: Function) => {
    cb(null, { stdout: '1.500\n', stderr: '' });
  }),
}));

import { synthesize } from '../../src/voiceover/openai-engine.js';

describe('openai-engine synthesize', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalEnv;
    }
  });

  it('throws when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(synthesize('hello', '/tmp/out.mp3')).rejects.toThrow('OPENAI_API_KEY');
  });

  it('calls OpenAI API and returns result', async () => {
    const fakeBody = new ArrayBuffer(16000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(fakeBody),
    });

    const result = await synthesize('Hello world', '/tmp/out.mp3', 'nova');
    expect(result.audioPath).toBe('/tmp/out.mp3');
    expect(result.durationMs).toBeGreaterThan(0);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/speech',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test-key',
        }),
      }),
    );
  });

  it('throws on API error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    await expect(synthesize('hello', '/tmp/out.mp3')).rejects.toThrow('OpenAI TTS API error (401)');
  });

  it('sends correct model and voice in request body', async () => {
    const fakeBody = new ArrayBuffer(8000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(fakeBody),
    });

    await synthesize('Test', '/tmp/out.mp3', 'alloy');

    const call = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.model).toBe('gpt-4o-mini-tts');
    expect(body.voice).toBe('alloy');
    expect(body.response_format).toBe('mp3');
  });
});
