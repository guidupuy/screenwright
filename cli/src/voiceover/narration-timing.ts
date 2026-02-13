import { join } from 'node:path';
import type { Timeline, NarrationEvent } from '../timeline/types.js';
import { synthesize } from './piper-engine.js';

export interface NarrationOptions {
  modelPath?: string;
  tempDir: string;
}

/**
 * Generate voiceover WAV files for all narration events in a timeline.
 * Updates each narration event with the audioFile path and actual duration.
 * Returns a new timeline with updated narration events.
 */
export async function generateNarration(
  timeline: Timeline,
  opts: NarrationOptions,
): Promise<Timeline> {
  const events = [...timeline.events];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type !== 'narration') continue;

    const narration = event as NarrationEvent;
    const outputPath = join(opts.tempDir, `narration-${narration.id}.wav`);

    const result = await synthesize(narration.text, outputPath, opts.modelPath);

    events[i] = {
      ...narration,
      audioFile: result.wavPath,
      audioDurationMs: result.durationMs,
    };
  }

  return { ...timeline, events };
}
