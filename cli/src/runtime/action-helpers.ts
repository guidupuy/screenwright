import type { Page } from 'playwright';
import type { TimelineCollector } from './timeline-collector.js';

export interface ActionOptions {
  narration?: string;
}

export interface ScreenwrightHelpers {
  page: Page;
  scene(title: string, description?: string): Promise<void>;
  navigate(url: string, opts?: ActionOptions): Promise<void>;
  click(selector: string, opts?: ActionOptions): Promise<void>;
  fill(selector: string, value: string, opts?: ActionOptions): Promise<void>;
  hover(selector: string, opts?: ActionOptions): Promise<void>;
  press(key: string, opts?: ActionOptions): Promise<void>;
  wait(ms: number): Promise<void>;
  narrate(text: string): Promise<void>;
}

const NARRATION_WPM = 150;
const POST_ACTION_DELAY_MS = 500;
const CHAR_TYPE_DELAY_MS = 50;

function estimateNarrationMs(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.round((words / NARRATION_WPM) * 60 * 1000);
}

export function calculateMoveDuration(fromX: number, fromY: number, toX: number, toY: number): number {
  const distance = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
  return Math.min(1200, Math.max(300, Math.round(200 * Math.log2(distance / 10 + 1))));
}

export function createHelpers(page: Page, collector: TimelineCollector): ScreenwrightHelpers {
  let lastX = 640;
  let lastY = 360;

  async function emitNarration(text: string): Promise<void> {
    const estimatedMs = estimateNarrationMs(text);
    collector.emit({ type: 'narration', text });
    collector.emit({ type: 'wait', durationMs: estimatedMs, reason: 'narration_sync' as const });
    await page.waitForTimeout(estimatedMs);
  }

  async function moveCursorTo(toX: number, toY: number): Promise<void> {
    const moveDurationMs = calculateMoveDuration(lastX, lastY, toX, toY);
    collector.emit({
      type: 'cursor_target',
      fromX: lastX, fromY: lastY,
      toX, toY,
      moveDurationMs,
      easing: 'bezier' as const,
    });
    await page.waitForTimeout(moveDurationMs);
    lastX = toX;
    lastY = toY;
  }

  async function resolveCenter(selector: string): Promise<{ x: number; y: number }> {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    const box = await locator.boundingBox();
    if (!box) return { x: lastX, y: lastY };
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  }

  return {
    page,

    async scene(title, description) {
      collector.emit({ type: 'scene', title, description });
    },

    async navigate(url, opts) {
      if (opts?.narration) await emitNarration(opts.narration);

      collector.emit({
        type: 'action',
        action: 'navigate',
        selector: url,
        durationMs: 0,
        boundingBox: null,
      });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      collector.emit({ type: 'wait', durationMs: 1000, reason: 'page_load' as const });
      await page.waitForTimeout(1000);
    },

    async click(selector, opts) {
      if (opts?.narration) await emitNarration(opts.narration);

      const center = await resolveCenter(selector);
      await moveCursorTo(center.x, center.y);

      const locator = page.locator(selector).first();
      const box = await locator.boundingBox();
      collector.emit({
        type: 'action',
        action: 'click',
        selector,
        durationMs: 200,
        boundingBox: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null,
      });
      await locator.click();
      await page.waitForTimeout(POST_ACTION_DELAY_MS);
    },

    async fill(selector, value, opts) {
      if (opts?.narration) await emitNarration(opts.narration);

      const center = await resolveCenter(selector);
      await moveCursorTo(center.x, center.y);

      const locator = page.locator(selector).first();
      const box = await locator.boundingBox();
      await locator.click();

      collector.emit({
        type: 'action',
        action: 'fill',
        selector,
        value,
        durationMs: value.length * CHAR_TYPE_DELAY_MS,
        boundingBox: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null,
      });

      for (const char of value) {
        await page.keyboard.type(char, { delay: CHAR_TYPE_DELAY_MS });
      }
      await page.waitForTimeout(POST_ACTION_DELAY_MS);
    },

    async hover(selector, opts) {
      if (opts?.narration) await emitNarration(opts.narration);

      const center = await resolveCenter(selector);
      await moveCursorTo(center.x, center.y);

      const locator = page.locator(selector).first();
      const box = await locator.boundingBox();
      collector.emit({
        type: 'action',
        action: 'hover',
        selector,
        durationMs: 200,
        boundingBox: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null,
      });
      await locator.hover();
      await page.waitForTimeout(POST_ACTION_DELAY_MS);
    },

    async press(key, opts) {
      if (opts?.narration) await emitNarration(opts.narration);

      collector.emit({
        type: 'action',
        action: 'press',
        selector: key,
        durationMs: 100,
        boundingBox: null,
      });
      await page.keyboard.press(key);
      await page.waitForTimeout(POST_ACTION_DELAY_MS);
    },

    async wait(ms) {
      collector.emit({ type: 'wait', durationMs: ms, reason: 'pacing' as const });
      await page.waitForTimeout(ms);
    },

    async narrate(text) {
      await emitNarration(text);
    },
  };
}
