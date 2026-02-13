# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build (generates src/version.ts from package.json, then runs tsc)
pnpm --filter screenwright build

# Lint / type check (also generates version.ts first)
pnpm --filter screenwright lint

# Unit tests (no external deps)
pnpm --filter screenwright exec vitest run test/unit/

# Single test file
pnpm --filter screenwright exec vitest run test/unit/cursor-path.test.ts

# Integration tests (needs Playwright chromium + Piper TTS installed)
pnpm --filter screenwright exec vitest run test/integration/

# Watch mode
pnpm --filter screenwright exec vitest

# Dry-run pack (verify what ships to npm)
cd cli && pnpm pack --dry-run
```

## Architecture

pnpm monorepo with a single published package (`cli/` → `screenwright` on npm) and a Claude Code skill (`skill/SKILL.md`).

**Data flow for `screenwright compose`:**

```
scenario.ts → runScenario() → timeline.json + recording.webm
                  │                    │
                  │               voiceover/
                  │               (Piper TTS → WAV per narration event)
                  │                    │
                  └──────────> composition/
                               (Remotion: video + cursor overlay + audio → MP4)
```

**Key modules:**

- **`runtime/`** — Playwright instrumentation. `action-helpers.ts` implements the `sw.*` API (click, fill, navigate, etc). Each method performs the real Playwright action and emits timestamped events to the `TimelineCollector`.
- **`timeline/`** — Zod-validated schema for the event stream (scenes, actions, cursor targets, narrations, waits). This is the contract between recording and rendering.
- **`composition/`** — Remotion React components. `DemoVideo` layers the raw WebM, `CursorOverlay` (bezier-interpolated cursor paths), and `NarrationTrack` (sequenced audio clips). `render.ts` drives Webpack bundling + H.264 output.
- **`voiceover/`** — Piper TTS. `voice-models.ts` handles binary download with ARM64 macOS fallback (uses Python pip instead of native binary). WAV files cached in `~/.screenwright/`.
- **`generator/`** — LLM prompt templates only. The CLI has **no LLM dependency** — prompts are prepared for the skill layer to send to Claude.
- **`scripts/`** — npm lifecycle scripts. `postinstall.ts` silently upgrades the skill file for coding assistants (Claude Code, Codex) that already have it installed.

**Skill ↔ CLI boundary:** The skill (`SKILL.md`) orchestrates the user interaction and LLM calls. It generates scenario code, validates it with `validateScenarioCode()`, writes it to `.screenwright/scenarios/`, then shells out to `screenwright compose`. The CLI is deterministic and CI-safe.

## Key Patterns

- **ESM-only** (`"type": "module"`). All imports use `.js` extensions even for `.ts` source files.
- **`src/version.ts` is generated** by `prebuild`/`prelint` scripts from `package.json` version. It's in `.gitignore`. Never edit it manually.
- **Public API** (`src/index.ts`) exports only types (`ScreenwrightHelpers`, `Timeline`, `ScreenwrightConfig`) and validation functions. Internal modules stay private.
- Remotion components use **React 19** with `jsx: "react-jsx"` in tsconfig.

## Releasing

```bash
# Bump version in cli/package.json, then:
git add cli/package.json && git commit -m "Release vX.Y.Z"
git tag vX.Y.Z && git push origin main --tags
```

GitHub Actions publishes to npm via OIDC trusted publishing (no token needed) and creates a GitHub Release. The CI workflow skips tag pushes (`tags-ignore: ['v*']`) to avoid duplicate runs.
