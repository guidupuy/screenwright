import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { resolve, basename } from 'node:path';
import type { Timeline } from '../timeline/types.js';

export interface RenderOptions {
  timeline: Timeline;
  outputPath: string;
  publicDir: string;
  entryPoint?: string;
}

/**
 * Rewrite absolute file paths in the timeline to basenames.
 * Remotion components run in a browser (webpack) and resolve assets
 * via staticFile() against the publicDir — they only need filenames.
 */
function toStaticPaths(timeline: Timeline): Timeline {
  const meta = { ...timeline.metadata };
  if (meta.videoFile) {
    meta.videoFile = basename(meta.videoFile);
  }
  // frameManifest paths are already relative to publicDir — no rewrite needed
  return {
    ...timeline,
    metadata: meta,
    events: timeline.events.map(e => {
      if (e.type === 'narration' && e.audioFile) {
        return { ...e, audioFile: basename(e.audioFile) };
      }
      return e;
    }),
  };
}

export async function renderDemoVideo(opts: RenderOptions): Promise<string> {
  const entryPoint = opts.entryPoint ?? resolve(import.meta.dirname, 'remotion-root.js');

  const bundlePath = await bundle({
    entryPoint,
    publicDir: opts.publicDir,
  });

  const staticTimeline = toStaticPaths(opts.timeline);

  const composition = await selectComposition({
    serveUrl: bundlePath,
    id: 'DemoVideo',
    inputProps: { timeline: staticTimeline },
  });

  await renderMedia({
    composition,
    serveUrl: bundlePath,
    codec: 'h264',
    crf: 16,
    pixelFormat: 'yuv420p',
    outputLocation: opts.outputPath,
    inputProps: { timeline: staticTimeline },
  });

  return opts.outputPath;
}
