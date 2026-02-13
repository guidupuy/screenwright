import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { resolve } from 'node:path';
import type { Timeline } from '../timeline/types.js';

export interface RenderOptions {
  timeline: Timeline;
  outputPath: string;
  entryPoint?: string;
}

export async function renderDemoVideo(opts: RenderOptions): Promise<string> {
  const entryPoint = opts.entryPoint ?? resolve(import.meta.dirname, 'remotion-root.js');

  const bundlePath = await bundle({
    entryPoint,
    // Remotion bundles with webpack — no extra config needed
  });

  const composition = await selectComposition({
    serveUrl: bundlePath,
    id: 'DemoVideo',
    inputProps: { timeline: opts.timeline },
  });

  await renderMedia({
    composition,
    serveUrl: bundlePath,
    codec: 'h264',
    outputLocation: opts.outputPath,
    inputProps: { timeline: opts.timeline },
  });

  return opts.outputPath;
}
