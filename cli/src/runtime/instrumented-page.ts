import { chromium } from 'playwright';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Timeline, ManifestEntry, TransitionMarker } from '../timeline/types.js';
import { TimelineCollector } from './timeline-collector.js';
import { createHelpers, type ScreenwrightHelpers, type RecordingContext } from './action-helpers.js';
import type { PregeneratedNarration } from './narration-preprocess.js';
import type { BrandingConfig } from '../config/config-schema.js';

export type ScenarioFn = (sw: ScreenwrightHelpers) => Promise<void>;

export interface RunOptions {
  scenarioFile: string;
  testFile: string;
  viewport?: { width: number; height: number };
  colorScheme?: 'light' | 'dark';
  locale?: string;
  timezoneId?: string;
  pregenerated?: PregeneratedNarration[];
  branding?: BrandingConfig;
}

export interface RunResult {
  timeline: Timeline;
  tempDir: string;
  narrationCount: number;
}

const FRAME_INTERVAL_MS = 1000 / 30;
const DPR = 2;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, Math.max(0, ms)));
}

export async function runScenario(scenario: ScenarioFn, opts: RunOptions): Promise<RunResult> {
  const viewport = opts.viewport ?? { width: 1280, height: 720 };
  const tempDir = await mkdtemp(join(tmpdir(), 'screenwright-'));
  const framesDir = join(tempDir, 'frames');
  await mkdir(framesDir, { recursive: true });

  const browser = await chromium.launch({
    args: ['--disable-gpu', '--font-render-hinting=none', '--disable-lcd-text'],
  });

  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: DPR,
    bypassCSP: true,
    colorScheme: opts.colorScheme ?? 'light',
    locale: opts.locale ?? 'en-US',
    timezoneId: opts.timezoneId ?? 'America/New_York',
  });

  // Hide the native cursor so only the Screenwright overlay cursor appears.
  await context.addInitScript(`
    const s = document.createElement('style');
    s.textContent = '*, *::before, *::after { cursor: none !important; }';
    (document.head || document.documentElement).appendChild(s);
  `);

  const page = await context.newPage();
  const collector = new TimelineCollector();
  const manifest: ManifestEntry[] = [];
  const transitionMarkers: TransitionMarker[] = [];

  // Narration queue from pre-generated audio
  const narrationQueue = opts.pregenerated ? [...opts.pregenerated] : [];
  let narrationConsumed = 0;

  // Virtual clock: each frame = exactly 1000/30 ms
  let virtualFrameIndex = 0;
  let frameFileCounter = 0;
  let transitionFrameCounter = 0;

  // Capture loop state
  let captureRunning = false;
  let pendingScreenshot: Promise<void> = Promise.resolve();

  // Capture loop instrumentation
  const screenshotTimings: number[] = [];
  let captureLoopStart = 0;
  let captureFailures = 0;

  async function runCaptureLoop() {
    captureRunning = true;
    if (!captureLoopStart) captureLoopStart = performance.now();
    while (captureRunning) {
      const start = performance.now();
      frameFileCounter++;
      const filename = `frame-${String(frameFileCounter).padStart(6, '0')}.jpg`;
      try {
        await page.screenshot({ path: join(framesDir, filename), type: 'jpeg', quality: 90 });
        manifest.push({ type: 'frame', file: `frames/${filename}` });
        virtualFrameIndex++;
        screenshotTimings.push(performance.now() - start);
      } catch {
        captureFailures++;
      }
      const elapsed = performance.now() - start;
      await sleep(FRAME_INTERVAL_MS - elapsed);
    }
  }

  async function pauseCapture(): Promise<void> {
    captureRunning = false;
    await pendingScreenshot;
  }

  function resumeCapture(): void {
    if (!captureRunning) {
      pendingScreenshot = runCaptureLoop();
    }
  }

  /** Explicit screenshot for transition images — not in the manifest, no virtual clock advance. */
  async function captureTransitionFrame(): Promise<string> {
    transitionFrameCounter++;
    const filename = `transition-${String(transitionFrameCounter).padStart(4, '0')}.jpg`;
    await page.screenshot({ path: join(framesDir, filename), type: 'jpeg', quality: 90 });
    return `frames/${filename}`;
  }

  function addTransitionMarker(marker: TransitionMarker): void {
    transitionMarkers.push(marker);
  }

  function popNarration(): PregeneratedNarration {
    if (narrationQueue.length === 0) {
      throw new Error('No pre-generated narrations remaining in queue');
    }
    narrationConsumed++;
    return narrationQueue.shift()!;
  }

  function currentTimeMs(): number {
    return virtualFrameIndex * FRAME_INTERVAL_MS;
  }

  function ensureCaptureStarted(): void {
    if (!captureRunning) resumeCapture();
  }

  const ctx: RecordingContext = {
    captureTransitionFrame,
    addTransitionMarker,
    popNarration,
    currentTimeMs,
    ensureCaptureStarted,
    get manifest() { return manifest; },
    transitionPending: false,
  };

  const sw = createHelpers(page, collector, ctx, opts.branding);

  try {
    await scenario(sw);

    // Stop capture loop and flush
    await pauseCapture();

    // Take one final frame
    try {
      frameFileCounter++;
      const filename = `frame-${String(frameFileCounter).padStart(6, '0')}.jpg`;
      await page.screenshot({ path: join(framesDir, filename), type: 'jpeg', quality: 90 });
      manifest.push({ type: 'frame', file: `frames/${filename}` });
      virtualFrameIndex++;
    } catch {
      // Page may already be closing
    }

    // Capture loop stats + drift detection
    if (screenshotTimings.length > 0) {
      const wallMs = performance.now() - captureLoopStart;
      const actualFps = screenshotTimings.length / wallMs * 1000;
      const targetFps = 1000 / FRAME_INTERVAL_MS;
      const driftThreshold = 0.85; // warn if actual < 85% of target

      if (actualFps < targetFps * driftThreshold) {
        const suggestedFps = Math.floor(actualFps);
        console.warn(
          `\n⚠ Capture loop averaged ${actualFps.toFixed(1)}fps (target ${targetFps}fps). ` +
          `Video timing may be inaccurate.\n` +
          `  Consider setting fps: ${suggestedFps} in your screenwright config, ` +
          `or running on a faster machine.\n`,
        );
      }
    }

    // Warn about trailing transition
    if (ctx.transitionPending) {
      console.warn('sw.transition() at end of scenario with no following content — discarding marker.');
      transitionMarkers.pop();
      ctx.transitionPending = false;
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const timeline = collector.finalize({
    testFile: opts.testFile,
    scenarioFile: opts.scenarioFile,
    recordedAt: new Date().toISOString(),
    viewport,
    frameManifest: manifest,
    transitionMarkers,
  });

  const timelinePath = join(tempDir, 'timeline.json');
  await writeFile(timelinePath, JSON.stringify(timeline, null, 2));

  return { timeline, tempDir, narrationCount: narrationConsumed };
}
