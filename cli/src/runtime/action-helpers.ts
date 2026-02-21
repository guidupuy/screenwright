import type { Page } from 'playwright';
import type { TimelineCollector } from './timeline-collector.js';
import type { ManifestEntry, TransitionMarker, SceneSlideConfig, TransitionType } from '../timeline/types.js';
import type { PregeneratedNarration } from './narration-preprocess.js';
import type { BrandingConfig } from '../config/config-schema.js';

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
  dblclick(selector: string, opts?: ActionOptions): Promise<void>;
  fill(selector: string, value: string, opts?: ActionOptions): Promise<void>;
  hover(selector: string, opts?: ActionOptions): Promise<void>;
  press(key: string, opts?: ActionOptions): Promise<void>;
  wait(ms: number): Promise<void>;
  narrate(text: string): Promise<void>;
  transition(opts?: TransitionOptions): Promise<void>;
}

export interface RecordingContext {
  /** Take an explicit screenshot for transition before/after images.
   *  Does NOT push to the manifest or advance the virtual clock. */
  captureTransitionFrame(): Promise<string>;
  addTransitionMarker(marker: TransitionMarker): void;
  popNarration(): PregeneratedNarration;
  currentTimeMs(): number;
  /** Start the capture loop if it hasn't started yet. No-op after first call. */
  ensureCaptureStarted(): void;
  readonly manifest: ManifestEntry[];
  transitionPending: boolean;
}

const DEFAULT_SLIDE_DURATION_MS = 2000;
const CHAR_TYPE_DELAY_MS = 30;
const CURSOR_MOVE_MIN_MS = 200;
const CURSOR_MOVE_MAX_MS = 800;
const CURSOR_DWELL_MS = 500;
const FPS = 30;

export function calculateMoveDuration(fromX: number, fromY: number, toX: number, toY: number): number {
  const distance = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
  return Math.min(CURSOR_MOVE_MAX_MS, Math.max(CURSOR_MOVE_MIN_MS, Math.round(200 * Math.log2(distance / 10 + 1))));
}

function msToFrames(ms: number): number {
  return Math.ceil(ms / 1000 * FPS);
}

const SLIDE_OVERLAY_ID = '__screenwright_slide_overlay__';

function escapeJs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

/** Preload a Google Font so it's cached before the overlay becomes visible. */
async function preloadFont(page: Page, fontFamily: string): Promise<void> {
  const encoded = encodeURIComponent(fontFamily);
  const escaped = escapeJs(fontFamily);
  // Don't request a weight range — non-variable fonts (e.g. Lobster) return
  // HTTP 400 for `:wght@100..900`.  Omitting it returns all available weights.
  const fontUrl = `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;
  // Two-pronged approach: addStyleTag works on real pages (survives HTML
  // parsing) but can't download font files on about:blank.  The manual
  // evaluate path handles about:blank.  Running both is harmless — the
  // browser deduplicates the actual network requests.
  await page.addStyleTag({ url: fontUrl }).catch(() => {});
  await page.evaluate(`
    (async () => {
      try {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '${fontUrl}';
        document.head.appendChild(link);
        if (!link.sheet) {
          await Promise.race([
            new Promise(function(ok, fail) { link.onload = ok; link.onerror = fail; }),
            new Promise(function(r) { setTimeout(r, 3000); }),
          ]);
        }
        await Promise.race([
          document.fonts.load('64px "${escaped}"'),
          new Promise(function(r) { setTimeout(r, 3000); }),
        ]);
      } catch {}
    })()
  `).catch(() => {});
}

async function injectSlideOverlay(
  page: Page,
  title: string,
  description: string | undefined,
  config: SceneSlideConfig,
  branding?: BrandingConfig,
): Promise<void> {
  const brandColor = config.brandColor ?? branding?.brandColor ?? '#000000';
  const textColor = config.textColor ?? branding?.textColor ?? '#FFFFFF';
  const fontFamily = config.fontFamily ?? branding?.fontFamily;
  const titleFontSize = config.titleFontSize ?? 64;
  const descFontSize = Math.round(titleFontSize * 0.44);
  const resolvedFont = fontFamily
    ? `"${fontFamily}", system-ui, -apple-system, sans-serif`
    : 'system-ui, -apple-system, sans-serif';

  // Preload font before showing the overlay so the capture loop
  // never records frames with the fallback font.
  if (fontFamily) {
    await preloadFont(page, fontFamily);
  }

  let script = `
    var _old = document.getElementById('${SLIDE_OVERLAY_ID}');
    if (_old) _old.remove();
    var overlay = document.createElement('div');
    overlay.id = '${SLIDE_OVERLAY_ID}';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;background-color:${escapeJs(brandColor)};font-family:${escapeJs(resolvedFont)};';
    var inner = document.createElement('div');
    inner.style.cssText = 'text-align:center;padding:0 10%;';
    var h1 = document.createElement('h1');
    h1.textContent = '${escapeJs(title)}';
    h1.style.cssText = 'color:${escapeJs(textColor)};font-size:${titleFontSize}px;font-weight:700;margin:0;line-height:1.2;';
    inner.appendChild(h1);
  `;
  if (description) {
    script += `
      var divider = document.createElement('div');
      divider.style.cssText = 'width:80px;height:4px;background-color:${escapeJs(textColor)};opacity:0.4;margin:24px auto;border-radius:2px;';
      inner.appendChild(divider);
      var p = document.createElement('p');
      p.textContent = '${escapeJs(description)}';
      p.style.cssText = 'color:${escapeJs(textColor)};font-size:${descFontSize}px;font-weight:400;margin:0;opacity:0.85;line-height:1.5;';
      inner.appendChild(p);
    `;
  }
  script += `
    overlay.appendChild(inner);
    document.body.appendChild(overlay);
  `;
  await page.evaluate(script);
}

async function removeSlideOverlay(page: Page): Promise<void> {
  // Only remove the overlay div — keep the font <link> so subsequent
  // slides reuse the already-loaded @font-face rules instantly.
  await page.evaluate(`
    var el = document.getElementById('${SLIDE_OVERLAY_ID}');
    if (el) el.remove();
  `).catch(() => {});
}

export function createHelpers(page: Page, collector: TimelineCollector, ctx: RecordingContext, branding?: BrandingConfig): ScreenwrightHelpers {
  let lastX = 640;
  let lastY = 360;

  // Capture loop runs continuously. These helpers never pause or resume it.
  // When time needs to pass (narration, slide, wait), we sleep and let the
  // capture loop record real frames throughout.

  // Transition state: track the last slide frame for before/after images.
  // These are cleared by any non-slide action so they're only used when
  // sw.transition() is called directly after sw.scene({ slide }).
  let lastSlideFile: string | null = null;
  let lastSlideEntryIndex = -1;
  let pendingTransitionMarker: TransitionMarker | null = null;

  let slideOverlayActive = false;

  /** Clear slide tracking — called at the start of every non-slide action. */
  function clearSlideState(): void {
    lastSlideFile = null;
    lastSlideEntryIndex = -1;
    if (slideOverlayActive) {
      // Remove lazily — deferred from scene() to avoid capturing bare-page
      // frames between overlay removal and the next action.
      removeSlideOverlay(page);
      slideOverlayActive = false;
    }
  }

  /**
   * Resolve a pending transition marker by taking an explicit screenshot
   * of the settled page state. Deterministic — no timing dependency on
   * the capture loop.
   */
  async function resolvePendingTransition(): Promise<void> {
    if (!pendingTransitionMarker || ctx.manifest.length === 0) return;
    pendingTransitionMarker.afterFile = await ctx.captureTransitionFrame();
    pendingTransitionMarker = null;
    ctx.transitionPending = false;
  }

  function emitNarrationEvent(narration: PregeneratedNarration): void {
    collector.emit({
      type: 'narration',
      timestampMs: ctx.currentTimeMs(),
      text: narration.text,
      audioDurationMs: narration.durationMs,
      audioFile: narration.audioFile,
    });
  }

  async function moveCursorTo(toX: number, toY: number): Promise<void> {
    const moveDurationMs = calculateMoveDuration(lastX, lastY, toX, toY);
    collector.emit({
      type: 'cursor_target',
      timestampMs: ctx.currentTimeMs(),
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
    // Poll until the bounding box stabilizes — handles CSS animations on
    // dropdowns, dialogs, etc. that are still in-flight when the element
    // first becomes visible.
    let box = await locator.boundingBox();
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(50);
      const next = await locator.boundingBox();
      if (box && next
        && Math.abs(next.x - box.x) < 1
        && Math.abs(next.y - box.y) < 1) {
        box = next;
        break;
      }
      box = next;
    }
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

  /** Sleep for remaining narration time after an action settles. */
  async function sleepRemainingNarration(startMs: number, durationMs: number): Promise<void> {
    const elapsedMs = ctx.currentTimeMs() - startMs;
    const remainingMs = durationMs - elapsedMs;
    if (remainingMs > 0) await page.waitForTimeout(remainingMs);
  }

  return {
    page,

    async scene(title, descriptionOrOptions) {
      let description: string | undefined;
      let slide: SceneSlideConfig | undefined;

      if (typeof descriptionOrOptions === 'string') {
        description = descriptionOrOptions;
      } else if (descriptionOrOptions !== undefined) {
        description = descriptionOrOptions.description;
        slide = descriptionOrOptions.slide;
      }

      collector.emit({ type: 'scene', timestampMs: ctx.currentTimeMs(), title, description, slide });

      if (slide) {
        const slideDurationMs = slide.duration ?? DEFAULT_SLIDE_DURATION_MS;
        const manifestLenBefore = ctx.manifest.length;
        await injectSlideOverlay(page, title, description, slide, branding);
        ctx.ensureCaptureStarted();
        await page.waitForTimeout(slideDurationMs);

        // Take an explicit screenshot of the slide for transition images.
        // This is deterministic — no dependency on capture loop timing.
        const slideFrame = await ctx.captureTransitionFrame();

        // Resolve pending transition: this slide is the "after" image.
        if (pendingTransitionMarker && ctx.manifest.length > 0) {
          pendingTransitionMarker.afterFile = slideFrame;
          // Skip junk frames between the previous slide removal and this overlay injection.
          const junkFrames = manifestLenBefore - pendingTransitionMarker.afterEntryIndex;
          if (junkFrames > 1) {
            pendingTransitionMarker.consumedFrames = junkFrames;
          }
          pendingTransitionMarker = null;
          ctx.transitionPending = false;
        }

        // Save slide frame before removing overlay — used as
        // "before" image if sw.transition() is called after this scene.
        lastSlideFile = slideFrame;
        lastSlideEntryIndex = ctx.manifest.length - 1;

        // Don't remove the overlay here — defer to clearSlideState() so
        // the capture loop never grabs bare-page frames between slides.
        slideOverlayActive = true;
      }
    },

    async navigate(url, actionOpts) {
      clearSlideState();
      const narration = actionOpts?.narration ? ctx.popNarration() : null;
      const narStartMs = narration ? ctx.currentTimeMs() : 0;
      if (narration) emitNarrationEvent(narration);

      const startMs = ctx.currentTimeMs();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        ctx.ensureCaptureStarted();
        collector.emit({
          type: 'action',
          action: 'navigate',
          selector: url,
          durationMs: 0,
          boundingBox: null,
          timestampMs: startMs,
          settledAtMs: ctx.currentTimeMs(),
        });
      } catch (err) {
        throw actionError('navigate', url, err);
      }

      await resolvePendingTransition();
      if (narration) await sleepRemainingNarration(narStartMs, narration.durationMs);
    },

    async click(selector, actionOpts) {
      clearSlideState();
      const narration = actionOpts?.narration ? ctx.popNarration() : null;
      const narStartMs = narration ? ctx.currentTimeMs() : 0;
      if (narration) emitNarrationEvent(narration);

      try {
        ctx.ensureCaptureStarted();
        await resolvePendingTransition();
        const center = await resolveCenter(selector);
        await moveCursorTo(center.x, center.y);
        await page.waitForTimeout(CURSOR_DWELL_MS);
        const locator = page.locator(selector).first();
        const box = await locator.boundingBox();
        const startMs = ctx.currentTimeMs();
        await locator.click();
        collector.emit({
          type: 'action',
          action: 'click',
          selector,
          durationMs: 200,
          boundingBox: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null,
          timestampMs: startMs,
          settledAtMs: ctx.currentTimeMs(),
        });
      } catch (err) {
        throw actionError('click', selector, err);
      }
      if (narration) await sleepRemainingNarration(narStartMs, narration.durationMs);
    },

    async dblclick(selector, actionOpts) {
      clearSlideState();
      const narration = actionOpts?.narration ? ctx.popNarration() : null;
      const narStartMs = narration ? ctx.currentTimeMs() : 0;
      if (narration) emitNarrationEvent(narration);

      try {
        ctx.ensureCaptureStarted();
        await resolvePendingTransition();
        const center = await resolveCenter(selector);
        await moveCursorTo(center.x, center.y);
        await page.waitForTimeout(CURSOR_DWELL_MS);
        const locator = page.locator(selector).first();
        const box = await locator.boundingBox();
        const startMs = ctx.currentTimeMs();
        await locator.dblclick();
        collector.emit({
          type: 'action',
          action: 'dblclick',
          selector,
          durationMs: 200,
          boundingBox: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null,
          timestampMs: startMs,
          settledAtMs: ctx.currentTimeMs(),
        });
      } catch (err) {
        throw actionError('dblclick', selector, err);
      }
      if (narration) await sleepRemainingNarration(narStartMs, narration.durationMs);
    },

    async fill(selector, value, actionOpts) {
      clearSlideState();
      const narration = actionOpts?.narration ? ctx.popNarration() : null;
      const narStartMs = narration ? ctx.currentTimeMs() : 0;
      if (narration) emitNarrationEvent(narration);

      try {
        ctx.ensureCaptureStarted();
        await resolvePendingTransition();
        const center = await resolveCenter(selector);
        await moveCursorTo(center.x, center.y);
        const locator = page.locator(selector).first();
        const box = await locator.boundingBox();
        await locator.click();
        const startMs = ctx.currentTimeMs();
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
          settledAtMs: ctx.currentTimeMs(),
        });
      } catch (err) {
        throw actionError('fill', selector, err);
      }
      if (narration) await sleepRemainingNarration(narStartMs, narration.durationMs);
    },

    async hover(selector, actionOpts) {
      clearSlideState();
      const narration = actionOpts?.narration ? ctx.popNarration() : null;
      const narStartMs = narration ? ctx.currentTimeMs() : 0;
      if (narration) emitNarrationEvent(narration);

      try {
        ctx.ensureCaptureStarted();
        await resolvePendingTransition();
        const center = await resolveCenter(selector);
        await moveCursorTo(center.x, center.y);
        const locator = page.locator(selector).first();
        const box = await locator.boundingBox();
        const startMs = ctx.currentTimeMs();
        await locator.hover();
        collector.emit({
          type: 'action',
          action: 'hover',
          selector,
          durationMs: 200,
          boundingBox: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null,
          timestampMs: startMs,
          settledAtMs: ctx.currentTimeMs(),
        });
      } catch (err) {
        throw actionError('hover', selector, err);
      }
      if (narration) await sleepRemainingNarration(narStartMs, narration.durationMs);
    },

    async press(key, actionOpts) {
      clearSlideState();
      const narration = actionOpts?.narration ? ctx.popNarration() : null;
      const narStartMs = narration ? ctx.currentTimeMs() : 0;
      if (narration) emitNarrationEvent(narration);

      ctx.ensureCaptureStarted();
      await resolvePendingTransition();
      const startMs = ctx.currentTimeMs();
      try {
        await page.keyboard.press(key);
        collector.emit({
          type: 'action',
          action: 'press',
          selector: key,
          durationMs: 100,
          boundingBox: null,
          timestampMs: startMs,
          settledAtMs: ctx.currentTimeMs(),
        });
      } catch (err) {
        throw actionError('press', key, err);
      }
      if (narration) await sleepRemainingNarration(narStartMs, narration.durationMs);
    },

    async wait(ms) {
      clearSlideState();
      ctx.ensureCaptureStarted();
      collector.emit({ type: 'wait', timestampMs: ctx.currentTimeMs(), durationMs: ms, reason: 'pacing' as const });
      await page.waitForTimeout(ms);
    },

    async narrate(text) {
      clearSlideState();
      ctx.ensureCaptureStarted();
      const narration = ctx.popNarration();
      emitNarrationEvent(narration);
      await page.waitForTimeout(narration.durationMs);
    },

    async transition(transitionOpts) {
      const durationMs = transitionOpts?.duration ?? 500;
      if (durationMs <= 0 || !Number.isFinite(durationMs)) {
        throw new Error(`sw.transition() duration must be a positive number, got ${durationMs}`);
      }

      const marker: TransitionMarker = {
        afterEntryIndex: lastSlideEntryIndex >= 0 ? lastSlideEntryIndex : ctx.manifest.length - 1,
        transition: transitionOpts?.type ?? 'fade',
        durationFrames: msToFrames(durationMs),
      };

      // Use the saved slide frame as the explicit "before" image
      if (lastSlideFile) {
        marker.beforeFile = lastSlideFile;
      }

      ctx.addTransitionMarker(marker);
      pendingTransitionMarker = marker;
      ctx.transitionPending = true;
    },
  };
}
