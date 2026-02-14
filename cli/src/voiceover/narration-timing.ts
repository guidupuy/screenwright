import { join } from 'node:path';
import type { Timeline, NarrationEvent } from '../timeline/types.js';
import { synthesize as piperSynthesize } from './piper-engine.js';
import { synthesize as openaiSynthesize } from './openai-engine.js';
import type { OpenaiVoice } from '../config/config-schema.js';

export interface NarrationOptions {
  modelPath?: string;
  tempDir: string;
  ttsProvider?: 'piper' | 'openai';
  openaiVoice?: OpenaiVoice;
}

/**
 * Generate voiceover audio files for all narration events in a timeline.
 * Updates each narration event with the audioFile path and actual duration.
 * Returns a new timeline with updated narration events.
 */
export async function generateNarration(
  timeline: Timeline,
  opts: NarrationOptions,
): Promise<Timeline> {
  const provider = opts.ttsProvider ?? 'piper';
  const ext = provider === 'openai' ? '.mp3' : '.wav';
  const events = [...timeline.events];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type !== 'narration') continue;

    const narration = event as NarrationEvent;
    const outputPath = join(opts.tempDir, `narration-${narration.id}${ext}`);

    const result = provider === 'openai'
      ? await openaiSynthesize(narration.text, outputPath, opts.openaiVoice)
      : await piperSynthesize(narration.text, outputPath, opts.modelPath);

    events[i] = {
      ...narration,
      audioFile: result.audioPath,
      audioDurationMs: result.durationMs,
    };
  }

  return { ...timeline, events };
}
