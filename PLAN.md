# Screenwright — Implementation Plan

## Context

Screenwright turns Playwright E2E tests into polished, cinematic product demo videos. The problem: raw test recordings look robotic (instant clicks, faker data, no narration). The solution: analyze a user's Playwright test, generate a new "demo scenario" script with human pacing and narration cues, run it with video capture, then composite cursor animation + voiceover into a final MP4.

Two components:
1. **Skill** (`SKILL.md`) — free, lightweight Claude Code skill that orchestrates the workflow
2. **CLI** (`@screenwright/cli`) — Node.js tool that does generation, recording, and video composition

Key architectural decision: **Remotion** replaces the raw ffmpeg pipeline. Cursor overlay, narration timing, and final encoding are all expressed as React components rendered via `@remotion/renderer`. This eliminates manual filtergraph construction, bundles ffmpeg automatically, and makes the composition layer testable and previewable.

### How It All Connects

```
User in Claude Code
       │
       ▼
   SKILL.md (loaded in Claude Code)
       │
       ├─ 1. Discovers Playwright test files in project
       ├─ 2. Asks user: which test? narration style? fixture data?
       ├─ 3. Reads test source → LLM generates demo scenario script
       │     (pure prompt/response — Claude is already running, no external API)
       ├─ 4. Writes scenario to ./demos/<name>-demo.ts
       ├─ 5. Calls CLI: `screenwright compose ./demos/<name>-demo.ts`
       │            │
       │            ▼
       │        CLI (headless, no LLM)
       │            ├─ Runs scenario in Playwright (headed + video capture)
       │            ├─ Collects timeline JSON (cursor positions, narration cues)
       │            ├─ Generates voiceover WAVs via Piper TTS
       │            ├─ Renders via Remotion: base video + cursor overlay + audio
       │            └─ Outputs final MP4
       │
       └─ 6. Returns video path to user
```

**Primary entry point**: User starts in Claude Code with the skill.
**CLI is also usable standalone** (e.g., CI pipelines, hand-written scenarios) but the skill is the front door.

---

## 1. Product Scope & UX

### CLI Commands

```
screenwright init                     # Bootstrap config, download voice model
screenwright generate --test <path>   # Generate demo scenario from Playwright test
screenwright compose <scenario>       # Record + compose final MP4
screenwright preview <scenario>       # Quick preview (no cursor/voiceover)
```

**`screenwright init`**
```bash
screenwright init
# Creates: ./screenwright.config.ts
# Downloads Piper voice model to ~/.screenwright/voices/
# Verifies system dependencies
```
Flags: `--voice <model>` (default: `en_US-amy-medium`), `--skip-voice-download`

**`screenwright generate`**
```bash
screenwright generate --test ./tests/checkout.spec.ts --out ./demos/checkout-demo.ts
```
Reads a Playwright test, sends it to the LLM, produces an instrumented demo scenario script.

Flags: `--test <path>` (required), `--out <path>`, `--narration-style brief|detailed`, `--data-profile <json>`

**`screenwright compose`**
```bash
screenwright compose ./demos/checkout-demo.ts --out ./output/checkout-demo.mp4
```
Runs the demo scenario with Playwright video capture, collects timeline JSON, generates voiceover, renders cursor + audio via Remotion, outputs final MP4.

Flags: `--out <path>`, `--resolution 1280x720|1920x1080`, `--no-voiceover`, `--no-cursor`, `--keep-temp`

**`screenwright preview`**
```bash
screenwright preview ./demos/checkout-demo.ts
```
Runs scenario, outputs raw WebM — no cursor overlay, no voiceover. For iterating on the scenario.

### Skill Flow

The skill (SKILL.md) asks these questions in order:

1. **Discover tests** — scans for `*.spec.ts` / `*.test.ts`, presents numbered list
2. **"Which test?"** — user picks by number or path
3. **"Replace fixtures with human-friendly data?"** — if yes, asks for brief app description
4. **"Narration style: brief or detailed?"** — default: detailed
5. **Show generated scenario** — user approves, edits, or regenerates
6. **Run compose** — streams progress, returns final MP4 path

### Happy-Path Journey

```
User: /screenwright

Skill: Found 3 Playwright tests:
  1. tests/login.spec.ts
  2. tests/checkout.spec.ts
  3. tests/dashboard.spec.ts
  Which test?

User: 2

Skill: Replace test fixtures with realistic data? (y/n)
User: y
Skill: Brief app description?
User: E-commerce store selling electronics

Skill: Narration style: brief or detailed?
User: detailed

Skill: [generates scenario, shows it]
       Want me to run it? (y/n/edit)
User: y

Skill: Recording... Generating voiceover... Composing...
       Demo video saved to: ./output/checkout-demo.mp4 (2:34, 48MB)
```

---

## 2. Repo & Package Layout

```
screenwright/
├── skill/
│   └── SKILL.md                        # Claude Code skill definition
│
├── cli/
│   ├── package.json                    # @screenwright/cli
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── bin/
│   │   └── screenwright.ts             # CLI entry (commander)
│   ├── src/
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── generate.ts
│   │   │   ├── compose.ts
│   │   │   └── preview.ts
│   │   ├── generator/
│   │   │   ├── scenario-generator.ts   # LLM-based demo scenario generation
│   │   │   └── prompts.ts             # System/user prompts for LLM
│   │   ├── runtime/
│   │   │   ├── instrumented-page.ts   # Runs scenario in Playwright w/ video
│   │   │   ├── timeline-collector.ts  # Collects events during execution
│   │   │   └── action-helpers.ts      # sw.click(), sw.fill(), sw.narrate()
│   │   ├── voiceover/
│   │   │   ├── piper-engine.ts        # Piper TTS wrapper
│   │   │   ├── narration-timing.ts    # Generate audio, measure durations
│   │   │   └── voice-models.ts        # Model download/cache
│   │   ├── composition/
│   │   │   ├── remotion-root.tsx       # Remotion <Composition> root
│   │   │   ├── DemoVideo.tsx          # Main composition component
│   │   │   ├── CursorOverlay.tsx      # Cursor sprite + click effects
│   │   │   ├── NarrationTrack.tsx     # Audio segments positioned by frame
│   │   │   ├── render.ts             # Programmatic renderMedia() call
│   │   │   └── cursor-path.ts        # ghost-cursor bezier interpolation
│   │   ├── timeline/
│   │   │   ├── types.ts              # Timeline JSON TypeScript types
│   │   │   └── schema.ts             # Zod validation schema
│   │   └── config/
│   │       ├── config-schema.ts
│   │       └── defaults.ts
│   ├── assets/
│   │   ├── cursor-default.svg         # Default cursor sprite
│   │   ├── cursor-pointer.svg         # Pointer/hand cursor
│   │   └── click-ripple.svg           # Click effect ring
│   └── test/
│       ├── unit/
│       │   ├── timeline-schema.test.ts
│       │   ├── cursor-path.test.ts
│       │   ├── narration-timing.test.ts
│       │   └── action-helpers.test.ts
│       ├── integration/
│       │   ├── piper-engine.test.ts
│       │   ├── instrumented-page.test.ts
│       │   └── render.test.ts
│       └── fixtures/
│           ├── sample-test.spec.ts
│           ├── sample-timeline.json
│           └── test-page.html
│
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

---

## 3. Timeline JSON Contract

### Types

```typescript
// cli/src/timeline/types.ts

interface Timeline {
  version: 1;
  metadata: {
    testFile: string;
    scenarioFile: string;
    recordedAt: string;          // ISO 8601
    viewport: { width: number; height: number };
    videoDurationMs: number;
    videoFile: string;           // Path to raw WebM from Playwright
  };
  events: TimelineEvent[];
}

type TimelineEvent =
  | SceneEvent        // Scene/chapter boundary
  | ActionEvent       // Playwright action (click, fill, etc.)
  | CursorTargetEvent // Cursor movement target coordinates
  | NarrationEvent    // Text to speak + timing
  | WaitEvent;        // Deliberate pause

interface SceneEvent {
  type: 'scene';
  id: string;
  timestampMs: number;
  title: string;
  description?: string;
}

interface ActionEvent {
  type: 'action';
  id: string;
  timestampMs: number;
  action: 'click' | 'fill' | 'hover' | 'select' | 'press' | 'navigate';
  selector: string;
  value?: string;
  durationMs: number;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
}

interface CursorTargetEvent {
  type: 'cursor_target';
  id: string;
  timestampMs: number;
  fromX: number; fromY: number;
  toX: number;   toY: number;
  moveDurationMs: number;
  easing: 'bezier';
}

interface NarrationEvent {
  type: 'narration';
  id: string;
  timestampMs: number;
  text: string;
  audioDurationMs?: number;    // Filled after TTS
  audioFile?: string;          // Filled after TTS
}

interface WaitEvent {
  type: 'wait';
  id: string;
  timestampMs: number;
  durationMs: number;
  reason: 'pacing' | 'narration_sync' | 'page_load';
}
```

### Timestamp Stability

- All timestamps are `ms` from video recording start
- Recorded via `performance.now()` relative to a start marker
- The pacing layer uses `page.waitForTimeout()` for deterministic delays
- Timeline is regenerated on each `compose` run — it's an intermediate artifact, never committed

### Example

```json
{
  "version": 1,
  "metadata": {
    "testFile": "tests/checkout.spec.ts",
    "scenarioFile": "demos/checkout-demo.ts",
    "recordedAt": "2026-02-13T12:00:00Z",
    "viewport": { "width": 1280, "height": 720 },
    "videoDurationMs": 45000,
    "videoFile": "/tmp/screenwright-abc/recording.webm"
  },
  "events": [
    { "type": "scene", "id": "ev-001", "timestampMs": 0, "title": "Browsing the catalog" },
    { "type": "narration", "id": "ev-002", "timestampMs": 200, "text": "Let's browse the electronics catalog." },
    { "type": "wait", "id": "ev-003", "timestampMs": 200, "durationMs": 2500, "reason": "narration_sync" },
    { "type": "cursor_target", "id": "ev-004", "timestampMs": 2700, "fromX": 640, "fromY": 360, "toX": 450, "toY": 280, "moveDurationMs": 800, "easing": "bezier" },
    { "type": "action", "id": "ev-005", "timestampMs": 3500, "action": "click", "selector": "[data-testid='product-laptop']", "durationMs": 200, "boundingBox": { "x": 400, "y": 250, "width": 100, "height": 60 } }
  ]
}
```

---

## 4. Playwright Instrumentation

### The `sw` Helper API

Generated demo scenarios use an `sw` helper that wraps Playwright actions:

```typescript
// What a generated scenario looks like:
export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.scene('Browsing the catalog');
  await sw.navigate('http://localhost:3000', {
    narration: "Let's open the electronics store.",
  });
  await sw.click('[data-testid="product-laptop"]', {
    narration: 'Select the MacBook Pro.',
  });
  await sw.fill('[data-testid="email"]', 'sarah@example.com');
  await sw.wait(2000);
}
```

### How `sw.click()` works internally

```
1. locator.waitFor({ state: 'visible' })
2. locator.boundingBox() → get center coordinates (toX, toY)
3. If narration provided → emit NarrationEvent, wait estimated duration
4. Emit CursorTargetEvent (fromX/fromY → toX/toY with Fitts's law duration)
5. page.waitForTimeout(moveDuration) — simulate cursor travel time
6. page.click(selector)
7. Emit ActionEvent with boundingBox
8. page.waitForTimeout(500) — post-action pacing
9. Update lastCursorX/Y
```

### `sw.fill()` — types character by character

```typescript
await page.click(selector);
for (const char of value) {
  await page.keyboard.type(char, { delay: 50 });
}
```

### Cursor Move Duration (Fitts's Law)

```typescript
function calculateMoveDuration(fromX, fromY, toX, toY): number {
  const distance = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
  return Math.min(1200, Math.max(300, Math.round(200 * Math.log2(distance / 10 + 1))));
  // 300ms min, 1200ms max
}
```

### Deterministic Rendering Setup

```typescript
const browser = await chromium.launch({
  args: ['--disable-gpu', '--font-render-hinting=none', '--disable-lcd-text'],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  locale: 'en-US',
  timezoneId: 'America/New_York',
  recordVideo: { dir: tempDir, size: { width: 1280, height: 720 } },
});
```

### Tests for Instrumentation

- **Unit**: `action-helpers.test.ts` — mock Page, verify event emission order and coordinates for click/fill/navigate
- **Unit**: `timeline-collector.test.ts` — verify monotonic timestamps, finalize() passes Zod schema
- **Integration**: `instrumented-page.test.ts` — run minimal scenario against `data:text/html,...`, verify timeline JSON + video file exist

---

## 5. Cursor Overlay (Remotion)

### Approach: React component overlay via Remotion

Instead of rendering PNG frame sequences and building ffmpeg filtergraphs, the cursor is a React component rendered on top of `<OffthreadVideo>` by Remotion. This is simpler, more maintainable, and previewable.

### `CursorOverlay.tsx`

```tsx
import { useCurrentFrame, interpolate, Easing } from 'remotion';
import { CursorTargetEvent, ActionEvent } from '../timeline/types';

interface Props {
  cursorEvents: CursorTargetEvent[];
  clickEvents: ActionEvent[];
  fps: number;
}

export const CursorOverlay: React.FC<Props> = ({ cursorEvents, clickEvents, fps }) => {
  const frame = useCurrentFrame();
  const timeMs = (frame / fps) * 1000;

  // Find active cursor movement segment
  const active = cursorEvents.find(
    e => timeMs >= e.timestampMs && timeMs <= e.timestampMs + e.moveDurationMs
  );

  let x: number, y: number;
  if (active) {
    const progress = (timeMs - active.timestampMs) / active.moveDurationMs;
    x = interpolate(progress, [0, 1], [active.fromX, active.toX], {
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
    y = interpolate(progress, [0, 1], [active.fromY, active.toY], {
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  } else {
    const past = cursorEvents.filter(e => e.timestampMs + e.moveDurationMs <= timeMs);
    const last = past[past.length - 1];
    x = last?.toX ?? 640;
    y = last?.toY ?? 360;
  }

  const activeClick = clickEvents.find(
    e => timeMs >= e.timestampMs && timeMs <= e.timestampMs + 300
  );

  return (
    <>
      <img src={require('../assets/cursor-default.svg')}
        style={{ position: 'absolute', left: x - 4, top: y - 2, width: 24, height: 24 }} />
      {activeClick && (
        <div style={{
          position: 'absolute',
          left: x - 20, top: y - 20,
          width: 40, height: 40,
          borderRadius: '50%',
          border: '2px solid rgba(59, 130, 246, 0.6)',
          opacity: interpolate(timeMs - activeClick.timestampMs, [0, 300], [1, 0]),
          transform: `scale(${interpolate(timeMs - activeClick.timestampMs, [0, 300], [0.5, 1.5])})`,
        }} />
      )}
    </>
  );
};
```

### Tests

- **Unit**: `cursor-path.test.ts` — verify waypoints start/end at correct coordinates, array length > 2, no NaN values
- **Integration**: `render.test.ts` — render 3 seconds of cursor overlay on a static image, verify output MP4 has cursor visible at expected frame

---

## 6. Offline Voiceover (Piper TTS)

### Engine: Piper TTS

- Neural quality, offline, Mac/Linux
- ~50MB models, cached at `~/.screenwright/voices/`
- Called as subprocess: `echo "text" | piper --model <path> --output_file out.wav`

### `piper-engine.ts`

```typescript
export async function synthesize(text: string, outputPath: string, modelPath: string): Promise<{ wavPath: string; durationMs: number }> {
  // Spawn piper process, pipe text to stdin, get WAV output
  // Measure duration via ffprobe
  return { wavPath: outputPath, durationMs };
}
```

### Narration Timing Flow

1. Extract `narration` events from timeline
2. For each: call Piper TTS → get WAV + actual duration
3. Update `audioDurationMs` and `audioFile` on each event
4. Pass updated timeline to Remotion composition
5. Remotion's `<Audio>` component positions each WAV at the correct frame

### Piper Binary + Voice Model Management

- Auto-download on first use
- Voice models auto-download to `~/.screenwright/voices/<model>.onnx`
- `screenwright init` pre-downloads both
- Default voice: `en_US-amy-medium`

### Tests

- **Unit**: `narration-timing.test.ts` — mock synthesize(), verify timeline fields updated
- **Integration**: `piper-engine.test.ts` — synthesize short sentence, verify WAV exists, duration > 0

---

## 7. Remotion Composition Pipeline

### Programmatic Rendering (`render.ts`)

```typescript
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

export async function renderDemoVideo(timeline: Timeline, outputPath: string) {
  const bundlePath = await bundle({ entryPoint: './src/composition/remotion-root.tsx' });
  const composition = await selectComposition({
    serveUrl: bundlePath,
    id: 'DemoVideo',
    inputProps: { timeline },
  });
  await renderMedia({
    composition,
    serveUrl: bundlePath,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: { timeline },
  });
}
```

### Full `compose` Pipeline

```
1. runScenario()       → WebM video + Timeline JSON
2. generateNarration() → WAV files per narration event, updated timeline
3. renderDemoVideo()   → Remotion composes video + cursor + audio → final MP4
```

### Tests

- **Unit**: Verify DemoVideo component renders without error given fixture timeline
- **Integration**: `render.test.ts` — render 5-second composition, verify MP4 exists

---

## 8. Two-Week MVP Build Plan

### Days 1–2: Scaffolding + Timeline Contract
- pnpm monorepo builds, vitest passes trivial test
- Timeline types + Zod schema complete
- CLI scaffolded: `screenwright --help` works
- `screenwright init` creates config file

### Days 3–4: Playwright Instrumentation Runtime
- sw helpers emit correct timeline events
- Running scenario against test page produces valid timeline + WebM
- `screenwright preview` works end-to-end

### Days 5–6: Remotion Composition (Cursor + Video)
- DemoVideo renders base video with cursor overlay
- Cursor moves along bezier paths
- Click ripple effect visible
- renderDemoVideo() produces MP4

### Days 7–8: Piper TTS Integration
- synthesize() produces WAV from text
- NarrationTrack positions audio at correct frames
- Full pipeline with audio

### Days 9–10: LLM Scenario Generation
- `screenwright generate --test <path>` produces valid scenario
- Generated code uses sw.* API, compiles

### Days 11–12: Skill + Full Integration
- SKILL.md discovers tests, asks questions, calls CLI
- Full happy-path works

### Days 13–14: Polish + Release Prep
- Edge cases, progress indicators, README, CI

### Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Piper TTS on macOS ARM64 | HIGH | Spike Day 7. Fallback: macOS `say` command |
| Cursor ↔ video timestamp drift | HIGH | Use performance.now() consistently |
| Remotion bundle size (~200MB) | MEDIUM | Document, cache aggressively |
| LLM generates invalid scenario code | MEDIUM | TypeScript compile check, user approval |

## Unresolved Questions

1. Remotion company license cost — need to verify pricing before commercial launch
2. macOS `say` as degraded TTS fallback if Piper ARM64 binary fails?
