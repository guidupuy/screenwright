import { chromium } from 'playwright';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Timeline } from '../timeline/types.js';
import { TimelineCollector } from './timeline-collector.js';
import { createHelpers, type ScreenwrightHelpers } from './action-helpers.js';

export type ScenarioFn = (sw: ScreenwrightHelpers) => Promise<void>;

export interface RunOptions {
  scenarioFile: string;
  testFile: string;
  viewport?: { width: number; height: number };
  colorScheme?: 'light' | 'dark';
  locale?: string;
  timezoneId?: string;
}

export interface RunResult {
  timeline: Timeline;
  videoFile: string;
  tempDir: string;
}

export async function runScenario(scenario: ScenarioFn, opts: RunOptions): Promise<RunResult> {
  const viewport = opts.viewport ?? { width: 1280, height: 720 };
  const tempDir = await mkdtemp(join(tmpdir(), 'screenwright-'));

  const browser = await chromium.launch({
    args: ['--disable-gpu', '--font-render-hinting=none', '--disable-lcd-text'],
  });

  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: opts.colorScheme ?? 'light',
    locale: opts.locale ?? 'en-US',
    timezoneId: opts.timezoneId ?? 'America/New_York',
    recordVideo: { dir: tempDir, size: viewport },
  });

  const page = await context.newPage();
  const collector = new TimelineCollector();

  collector.start();
  const sw = createHelpers(page, collector);

  await scenario(sw);

  // Close page to finalize video
  await page.close();

  const video = page.video();
  const videoFile = video ? await video.path() : '';

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
  });

  const timelinePath = join(tempDir, 'timeline.json');
  await writeFile(timelinePath, JSON.stringify(timeline, null, 2));

  await context.close();
  await browser.close();

  return { timeline, videoFile, tempDir };
}
