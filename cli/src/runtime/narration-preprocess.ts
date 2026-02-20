import { join } from 'node:path';
import type { ScreenwrightHelpers } from './action-helpers.js';
import { synthesize as piperSynthesize } from '../voiceover/piper-engine.js';
import { synthesize as openaiSynthesize } from '../voiceover/openai-engine.js';
import type { OpenaiVoice } from '../config/config-schema.js';

export type ScenarioFn = (sw: ScreenwrightHelpers) => Promise<void>;

export interface PregeneratedNarration {
  text: string;
  audioFile: string;
  durationMs: number;
}

export interface PreprocessOptions {
  tempDir: string;
  ttsProvider?: 'piper' | 'openai';
  modelPath?: string;
  openaiVoice?: OpenaiVoice;
  openaiTtsInstructions?: string;
}

/**
 * Recursive proxy that returns async no-ops for any property/method access.
 * Handles arbitrary page.evaluate(), page.waitForSelector(), etc.
 */
function noopPageProxy(): any {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      // Prevent infinite thenable loop: await checks .then, which must be
      // undefined so the proxy isn't treated as a thenable.
      if (prop === 'then') return undefined;
      return new Proxy(function () {}, {
        apply() {
          return Promise.resolve(new Proxy({}, handler));
        },
        get(_t, p) {
          if (p === 'then') return undefined;
          return new Proxy(function () {}, this as ProxyHandler<object>);
        },
      });
    },
  };
  return new Proxy({}, handler);
}

/**
 * Run the scenario with a stub sw that collects narration texts in order.
 * All page interactions are no-ops.
 */
export async function extractNarrations(scenarioFn: ScenarioFn): Promise<string[]> {
  const narrations: string[] = [];
  const stub: ScreenwrightHelpers = {
    page: noopPageProxy(),
    navigate: async (_url, opts?) => { if (opts?.narration) narrations.push(opts.narration); },
    click: async (_sel, opts?) => { if (opts?.narration) narrations.push(opts.narration); },
    dblclick: async (_sel, opts?) => { if (opts?.narration) narrations.push(opts.narration); },
    fill: async (_sel, _v, opts?) => { if (opts?.narration) narrations.push(opts.narration); },
    hover: async (_sel, opts?) => { if (opts?.narration) narrations.push(opts.narration); },
    press: async (_key, opts?) => { if (opts?.narration) narrations.push(opts.narration); },
    wait: async () => {},
    narrate: async (text) => { narrations.push(text); },
    scene: async () => {},
    transition: async () => {},
  };
  await scenarioFn(stub);
  return narrations;
}

/**
 * Pre-generate all narration audio files in parallel.
 */
export async function pregenerateNarrations(
  texts: string[],
  opts: PreprocessOptions,
): Promise<PregeneratedNarration[]> {
  const provider = opts.ttsProvider ?? 'piper';
  const ext = provider === 'openai' ? '.mp3' : '.wav';

  return Promise.all(texts.map(async (text, i) => {
    const outputPath = join(opts.tempDir, `narration-${i}${ext}`);
    const result = provider === 'openai'
      ? await openaiSynthesize(text, outputPath, opts.openaiVoice, opts.openaiTtsInstructions)
      : await piperSynthesize(text, outputPath, opts.modelPath);
    return { text, audioFile: result.audioPath, durationMs: result.durationMs };
  }));
}

/**
 * Validate that the number of narrations consumed during recording matches
 * the number pre-generated during preprocessing.
 */
export function validateNarrationCount(pregenerated: number, consumed: number): void {
  if (pregenerated !== consumed) {
    throw new Error(
      `Scenario produced ${pregenerated} narrations during preprocessing but ${consumed} during recording. ` +
      `Conditional narration is not supported.`,
    );
  }
}
