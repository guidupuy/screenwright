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

export type Pacing = 'fast' | 'normal' | 'cinematic';

export interface HelpersOptions {
  pacingMultiplier?: number;
  narrationOverlap?: number;
  onFrame?: () => Promise<void>;
  virtualTime?: boolean;
}

const NARRATION_WPM = 150;
const POST_ACTION_DELAY_MS = 300;
const PAGE_LOAD_WAIT_MS = 600;
const CHAR_TYPE_DELAY_MS = 30;
const CURSOR_MOVE_MIN_MS = 200;
const CURSOR_MOVE_MAX_MS = 800;
const SETTLE_MS = 150;

const NARRATION_OVERLAP: Record<Pacing, number> = {
  fast: 0.15,
  normal: 0.5,
  cinematic: 0.85,
};

export function getPacingMultiplier(pacing: Pacing): number {
  switch (pacing) {
    case 'fast': return 0.15;
    case 'normal': return 0.5;
    case 'cinematic': return 1.0;
  }
}

export function getNarrationOverlap(pacing: Pacing): number {
  return NARRATION_OVERLAP[pacing];
}

function estimateNarrationMs(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.round((words / NARRATION_WPM) * 60 * 1000);
}

export function calculateMoveDuration(fromX: number, fromY: number, toX: number, toY: number, pacingMultiplier = 1.0): number {
  const distance = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
  const base = Math.min(CURSOR_MOVE_MAX_MS, Math.max(CURSOR_MOVE_MIN_MS, Math.round(200 * Math.log2(distance / 10 + 1))));
  return Math.round(base * pacingMultiplier);
}

export function createHelpers(page: Page, collector: TimelineCollector, opts?: HelpersOptions): ScreenwrightHelpers {
  const pm = opts?.pacingMultiplier ?? 1.0;
  const narrationOverlap = opts?.narrationOverlap ?? 0.6;
  const onFrame = opts?.onFrame;
  const virtual = opts?.virtualTime ?? false;

  let lastX = 640;
  let lastY = 360;

  function scaled(ms: number): number {
    return Math.round(ms * pm);
  }

  async function timedWait(ms: number, settle?: number): Promise<void> {
    if (virtual) {
      collector.advance(ms);
      const settleMs = settle ?? SETTLE_MS;
      if (settleMs > 0) await page.waitForTimeout(settleMs);
    } else {
      await page.waitForTimeout(ms);
    }
  }

  async function emitNarration(text: string): Promise<void> {
    const estimatedMs = estimateNarrationMs(text);
    // Wait at least the full narration duration to prevent overlap,
    // plus optional breathing room controlled by narrationOverlap * pm.
    const padding = Math.round(estimatedMs * narrationOverlap * pm);
    const actualWaitMs = estimatedMs + padding;
    collector.emit({ type: 'narration', text });
    collector.emit({ type: 'wait', durationMs: actualWaitMs, reason: 'narration_sync' as const });
    await timedWait(actualWaitMs, 0);
  }

  async function moveCursorTo(toX: number, toY: number): Promise<void> {
    const moveDurationMs = calculateMoveDuration(lastX, lastY, toX, toY, pm);
    collector.emit({
      type: 'cursor_target',
      fromX: lastX, fromY: lastY,
      toX, toY,
      moveDurationMs,
      easing: 'bezier' as const,
    });
    await timedWait(moveDurationMs, 0);
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

    async navigate(url, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);

      collector.emit({
        type: 'action',
        action: 'navigate',
        selector: url,
        durationMs: 0,
        boundingBox: null,
      });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await onFrame?.();
      const waitMs = scaled(PAGE_LOAD_WAIT_MS);
      collector.emit({ type: 'wait', durationMs: waitMs, reason: 'page_load' as const });
      await timedWait(waitMs);
    },

    async click(selector, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);

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
      await onFrame?.();
      await timedWait(scaled(POST_ACTION_DELAY_MS));
    },

    async fill(selector, value, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);

      const center = await resolveCenter(selector);
      await moveCursorTo(center.x, center.y);

      const locator = page.locator(selector).first();
      const box = await locator.boundingBox();
      await locator.click();

      const charDelay = scaled(CHAR_TYPE_DELAY_MS);
      collector.emit({
        type: 'action',
        action: 'fill',
        selector,
        value,
        durationMs: value.length * charDelay,
        boundingBox: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null,
      });

      for (const char of value) {
        await page.keyboard.type(char, { delay: charDelay });
      }
      await onFrame?.();
      await timedWait(scaled(POST_ACTION_DELAY_MS));
    },

    async hover(selector, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);

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
      await onFrame?.();
      await timedWait(scaled(POST_ACTION_DELAY_MS));
    },

    async press(key, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);

      collector.emit({
        type: 'action',
        action: 'press',
        selector: key,
        durationMs: 100,
        boundingBox: null,
      });
      await page.keyboard.press(key);
      await onFrame?.();
      await timedWait(scaled(POST_ACTION_DELAY_MS));
    },

    async wait(ms) {
      collector.emit({ type: 'wait', durationMs: ms, reason: 'pacing' as const });
      await onFrame?.();
      await timedWait(ms, 0);
    },

    async narrate(text) {
      await emitNarration(text);
    },
  };
}
