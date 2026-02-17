import type { Page } from 'playwright';
import type { TimelineCollector } from './timeline-collector.js';
import type { SceneSlideConfig, TransitionType } from '../timeline/types.js';

export interface ActionOptions {
  narration?: string;
}

export interface SceneOptions {
  description?: string;
  slide?: SceneSlideConfig;
}

export interface TransitionOptions {
  type?: TransitionType;
  duration?: number;
}

export interface ScreenwrightHelpers {
  page: Page;
  scene(title: string, descriptionOrOptions?: string | SceneOptions): Promise<void>;
  navigate(url: string, opts?: ActionOptions): Promise<void>;
  click(selector: string, opts?: ActionOptions): Promise<void>;
  fill(selector: string, value: string, opts?: ActionOptions): Promise<void>;
  hover(selector: string, opts?: ActionOptions): Promise<void>;
  press(key: string, opts?: ActionOptions): Promise<void>;
  wait(ms: number): Promise<void>;
  narrate(text: string): Promise<void>;
  transition(opts?: TransitionOptions): Promise<void>;
}

const NARRATION_WPM = 150;
const CHAR_TYPE_DELAY_MS = 30;
const CURSOR_MOVE_MIN_MS = 200;
const CURSOR_MOVE_MAX_MS = 800;

function estimateNarrationMs(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.round((words / NARRATION_WPM) * 60 * 1000);
}

export function calculateMoveDuration(fromX: number, fromY: number, toX: number, toY: number): number {
  const distance = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
  return Math.min(CURSOR_MOVE_MAX_MS, Math.max(CURSOR_MOVE_MIN_MS, Math.round(200 * Math.log2(distance / 10 + 1))));
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

  function actionError(action: string, selector: string, cause: unknown): Error {
    const url = page.url();
    const msg = cause instanceof Error ? cause.message : String(cause);
    const err = new Error(
      `sw.${action}(${JSON.stringify(selector)}) failed on ${url}\n${msg}`,
    );
    err.cause = cause;
    return err;
  }

  return {
    page,

    async scene(title, descriptionOrOptions) {
      if (typeof descriptionOrOptions === 'string' || descriptionOrOptions === undefined) {
        collector.emit({ type: 'scene', title, description: descriptionOrOptions });
      } else {
        const { description, slide } = descriptionOrOptions;
        collector.emit({ type: 'scene', title, description, slide });
      }
    },

    async navigate(url, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);
      const startMs = collector.elapsed();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        collector.emit({
          type: 'action',
          action: 'navigate',
          selector: url,
          durationMs: 0,
          boundingBox: null,
          timestampMs: startMs,
          settledAtMs: collector.elapsed(),
        });
      } catch (err) {
        throw actionError('navigate', url, err);
      }
    },

    async click(selector, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);
      try {
        const center = await resolveCenter(selector);
        await moveCursorTo(center.x, center.y);
        const locator = page.locator(selector).first();
        const box = await locator.boundingBox();
        const startMs = collector.elapsed();
        await locator.click();
        collector.emit({
          type: 'action',
          action: 'click',
          selector,
          durationMs: 200,
          boundingBox: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null,
          timestampMs: startMs,
          settledAtMs: collector.elapsed(),
        });
      } catch (err) {
        throw actionError('click', selector, err);
      }
    },

    async fill(selector, value, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);
      try {
        const center = await resolveCenter(selector);
        await moveCursorTo(center.x, center.y);
        const locator = page.locator(selector).first();
        const box = await locator.boundingBox();
        await locator.click();
        const startMs = collector.elapsed();
        for (const char of value) {
          await page.keyboard.type(char, { delay: CHAR_TYPE_DELAY_MS });
        }
        collector.emit({
          type: 'action',
          action: 'fill',
          selector,
          value,
          durationMs: value.length * CHAR_TYPE_DELAY_MS,
          boundingBox: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null,
          timestampMs: startMs,
          settledAtMs: collector.elapsed(),
        });
      } catch (err) {
        throw actionError('fill', selector, err);
      }
    },

    async hover(selector, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);
      try {
        const center = await resolveCenter(selector);
        await moveCursorTo(center.x, center.y);
        const locator = page.locator(selector).first();
        const box = await locator.boundingBox();
        const startMs = collector.elapsed();
        await locator.hover();
        collector.emit({
          type: 'action',
          action: 'hover',
          selector,
          durationMs: 200,
          boundingBox: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null,
          timestampMs: startMs,
          settledAtMs: collector.elapsed(),
        });
      } catch (err) {
        throw actionError('hover', selector, err);
      }
    },

    async press(key, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);
      const startMs = collector.elapsed();
      try {
        await page.keyboard.press(key);
        collector.emit({
          type: 'action',
          action: 'press',
          selector: key,
          durationMs: 100,
          boundingBox: null,
          timestampMs: startMs,
          settledAtMs: collector.elapsed(),
        });
      } catch (err) {
        throw actionError('press', key, err);
      }
    },

    async wait(ms) {
      collector.emit({ type: 'wait', durationMs: ms, reason: 'pacing' as const });
      await page.waitForTimeout(ms);
    },

    async narrate(text) {
      await emitNarration(text);
    },

    async transition(opts) {
      const durationMs = opts?.duration ?? 500;
      if (durationMs <= 0 || !Number.isFinite(durationMs)) {
        throw new Error(`sw.transition() duration must be a positive number, got ${durationMs}`);
      }
      const events = collector.getEvents();
      if (events.length > 0 && events[events.length - 1].type === 'transition') {
        console.warn('sw.transition() called twice with no action between them — both transitions will stack at the same output position.');
      }
      collector.emit({
        type: 'transition',
        transition: opts?.type ?? 'fade',
        durationMs,
      });
    },
  };
}
