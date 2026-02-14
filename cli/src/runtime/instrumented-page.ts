import { chromium } from 'playwright';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Timeline, FrameEntry } from '../timeline/types.js';
import { TimelineCollector } from './timeline-collector.js';
import { createHelpers, getPacingMultiplier, getNarrationOverlap, type ScreenwrightHelpers, type Pacing } from './action-helpers.js';

export type ScenarioFn = (sw: ScreenwrightHelpers) => Promise<void>;

export interface RunOptions {
  scenarioFile: string;
  testFile: string;
  viewport?: { width: number; height: number };
  colorScheme?: 'light' | 'dark';
  locale?: string;
  timezoneId?: string;
  pacing?: Pacing;
  captureMode?: 'frames' | 'video';
}

export interface RunResult {
  timeline: Timeline;
  videoFile?: string;
  tempDir: string;
}

export async function runScenario(scenario: ScenarioFn, opts: RunOptions): Promise<RunResult> {
  const viewport = opts.viewport ?? { width: 1280, height: 720 };
  const tempDir = await mkdtemp(join(tmpdir(), 'screenwright-'));
  const captureMode = opts.captureMode ?? 'frames';

  const browser = await chromium.launch({
    args: ['--disable-gpu', '--font-render-hinting=none', '--disable-lcd-text'],
  });

  const contextOpts: Record<string, unknown> = {
    viewport,
    deviceScaleFactor: 1,
    colorScheme: opts.colorScheme ?? 'light',
    locale: opts.locale ?? 'en-US',
    timezoneId: opts.timezoneId ?? 'America/New_York',
  };

  if (captureMode === 'video') {
    contextOpts.recordVideo = { dir: tempDir, size: viewport };
  }

  const context = await browser.newContext(contextOpts);

  // Hide the native cursor so only the Screenwright overlay cursor appears
  await context.addInitScript(`
    const s = document.createElement('style');
    s.textContent = '*, *::before, *::after { cursor: none !important; }';
    (document.head || document.documentElement).appendChild(s);
  `);

  const page = await context.newPage();
  const collector = new TimelineCollector();
  const pacing = opts.pacing ?? 'normal';
  const pm = getPacingMultiplier(pacing);
  const narrationOverlap = getNarrationOverlap(pacing);

  let frameManifest: FrameEntry[] | undefined;
  let onFrame: (() => Promise<void>) | undefined;
  let virtualTime = false;

  if (captureMode === 'frames') {
    const framesDir = join(tempDir, 'frames');
    await mkdir(framesDir, { recursive: true });
    frameManifest = [];
    let frameCounter = 0;

    collector.enableVirtualTime();
    virtualTime = true;

    onFrame = async () => {
      try {
        frameCounter++;
        const filename = `frame-${String(frameCounter).padStart(6, '0')}.jpg`;
        const filePath = join(framesDir, filename);
        await page.screenshot({ type: 'jpeg', quality: 90, path: filePath });
        frameManifest!.push({
          timestampMs: collector.elapsed(),
          file: `frames/${filename}`,
        });
      } catch {
        // Skip frame on failure, continue recording
      }
    };
  }

  collector.start();
  const sw = createHelpers(page, collector, {
    pacingMultiplier: pm,
    narrationOverlap,
    onFrame,
    virtualTime,
  });

  await scenario(sw);

  // Capture one final frame after scenario completes
  if (onFrame) await onFrame();

  // Close page to finalize video (only matters in video mode)
  await page.close();

  let videoFile: string | undefined;
  if (captureMode === 'video') {
    const video = page.video();
    videoFile = video ? await video.path() : undefined;
  }

  const videoDurationMs = collector.getEvents().reduce((max, e) => {
    const ts = e.timestampMs + ('durationMs' in e ? (e.durationMs ?? 0) : 0);
    return Math.max(max, ts);
  }, 0);

  const timeline = collector.finalize({
    testFile: opts.testFile,
    scenarioFile: opts.scenarioFile,
    recordedAt: new Date().toISOString(),
    viewport,
    videoDurationMs,
    videoFile,
    frameManifest,
  });

  const timelinePath = join(tempDir, 'timeline.json');
  await writeFile(timelinePath, JSON.stringify(timeline, null, 2));

  await context.close();
  await browser.close();

  return { timeline, videoFile, tempDir };
}
