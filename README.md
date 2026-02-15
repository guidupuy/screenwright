# Screenwright

[![npm version](https://img.shields.io/npm/v/screenwright)](https://www.npmjs.com/package/screenwright)
[![CI](https://github.com/guidupuy/screenwright/actions/workflows/ci.yml/badge.svg)](https://github.com/guidupuy/screenwright/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Turn Playwright E2E tests into polished product demo videos.

Screenwright analyzes your existing Playwright tests, generates a cinematic "demo scenario" with human pacing and narration, records it with video capture, then composites cursor animation and voiceover into a final MP4.

## How It Works

```
Playwright test → Demo scenario → Record with pacing → Compose video
                  (human data,     (Playwright +        (Remotion:
                   narration cues)  video capture)       cursor + audio)
```

1. **Analyze** your Playwright test
2. **Generate** a demo scenario with natural pacing, realistic data, and narration
3. **Record** the scenario in Playwright with video capture
4. **Compose** the final video with cursor overlay and voiceover via Remotion

## Installation

### CLI

```bash
npm install -D screenwright
npx screenwright init
```

`screenwright init` creates a config file, sets up your TTS provider (Piper for local/offline or OpenAI for cloud), and auto-installs the coding assistant skill for detected assistants (Claude Code, Codex).

**Prerequisites:** Node.js >= 20, Playwright browsers (`npx playwright install chromium`)

### Claude Code Skill

`screenwright init` auto-detects Claude Code and offers to install the skill. You can also install it manually:

```bash
mkdir -p ~/.claude/skills/screenwright
curl -sL https://raw.githubusercontent.com/guidupuy/screenwright/main/skill/SKILL.md \
  -o ~/.claude/skills/screenwright/SKILL.md
```

Once installed, the skill is automatically kept in sync when you upgrade the `screenwright` npm package.

Then use `/screenwright` in Claude Code to get started.

## Quick Start

### With Claude Code (recommended)

```
/screenwright
```

The skill walks you through test selection, scenario generation, and video composition.

### With the CLI

```bash
# 1. Generate a demo scenario from a Playwright test
npx screenwright generate --test ./tests/checkout.spec.ts

# 2. Review and edit the generated scenario at ./demos/checkout-demo.ts

# 3. Compose the final video
npx screenwright compose ./demos/checkout-demo.ts

# 4. Or quickly preview without cursor/voiceover
npx screenwright preview ./demos/checkout-demo.ts
```

## CLI Reference

### `screenwright init`

Bootstrap config, set up TTS provider, and install coding assistant skills.

```bash
npx screenwright init [--tts piper|openai] [--voice <model>] [--openai-voice <voice>] [--skip-voice-download] [--skip-skill-install]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--tts` | (interactive) | TTS provider: `piper` (local/free) or `openai` (cloud/higher quality) |
| `--voice` | `en_US-amy-medium` | Piper TTS voice model |
| `--openai-voice` | `nova` | OpenAI voice name |
| `--skip-voice-download` | false | Skip downloading Piper voice model |
| `--skip-skill-install` | false | Skip coding assistant skill installation |

### `screenwright generate`

Generate a demo scenario from a Playwright test, or validate an existing one.

```bash
npx screenwright generate --test <path> [--out <path>] [--narration-style brief|detailed] [--app-description <desc>]
npx screenwright generate --validate <path>
```

| Flag | Default | Description |
|------|---------|-------------|
| `--test` | (required) | Path to Playwright test file |
| `--out` | `./demos/<name>-demo.ts` | Output path |
| `--narration-style` | `detailed` | `brief` or `detailed` narration |
| `--app-description` | - | Brief description of the app for context |
| `--validate` | - | Validate an existing scenario file |

### `screenwright compose`

Record scenario and compose final MP4 with cursor overlay and voiceover.

```bash
npx screenwright compose <scenario> [--out <path>] [--resolution WxH]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--out` | `./output/<name>.mp4` | Output path |
| `--resolution` | `1280x720` | Video resolution |
| `--no-voiceover` | false | Skip voiceover audio |
| `--no-cursor` | false | Skip cursor overlay |
| `--keep-temp` | false | Keep intermediate files |

### `screenwright preview`

Quick preview (WebM) without cursor overlay or voiceover.

```bash
npx screenwright preview <scenario> [--out <path>]
```

## Demo Scenario API

Generated scenarios use the `sw` helper API:

```typescript
import type { ScreenwrightHelpers } from 'screenwright';

export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.scene('Getting Started', { slide: {} });
  await sw.navigate('http://localhost:3000', {
    narration: "Let's open the app.",
  });
  await sw.click('[data-testid="login"]', {
    narration: 'Click the login button.',
  });
  await sw.fill('[data-testid="email"]', 'sarah@example.com');
  await sw.wait(2000);
}
```

### Available Helpers

| Method | Description |
|--------|-------------|
| `sw.scene(title)` | Mark a scene boundary (no slide) |
| `sw.scene(title, { slide?: { duration?, brandColor?, ... } })` | Scene with optional transition slide (pass `{ slide: {} }` for defaults) |
| `sw.navigate(url, { narration? })` | Navigate to URL |
| `sw.click(selector, { narration? })` | Click an element |
| `sw.fill(selector, value, { narration? })` | Type into an input (character by character) |
| `sw.hover(selector, { narration? })` | Hover over an element |
| `sw.press(key, { narration? })` | Press a keyboard key |
| `sw.wait(ms)` | Pause for pacing |
| `sw.narrate(text)` | Speak narration without an action |

## Configuration

`screenwright.config.ts` (created by `screenwright init`):

```typescript
const config = {
  // TTS
  ttsProvider: "piper",              // "piper" (local/free) or "openai" (cloud)
  voice: "en_US-amy-medium",         // Piper voice model
  openaiVoice: "nova",               // OpenAI voice (when ttsProvider is "openai")
  openaiTtsInstructions: "...",       // Tone instructions for OpenAI TTS

  // Video
  resolution: { width: 1280, height: 720 },
  outputDir: "./output",

  // Browser
  locale: "en-US",
  colorScheme: "light",
  timezoneId: "America/New_York",

  // Default slide styling (used when sw.scene() is called with options)
  branding: {
    brandColor: "#4F46E5",       // Default slide background color (hex)
    textColor: "#FFFFFF",        // Default slide text color (hex)
    fontFamily: "Inter",         // Default Google Fonts family (optional)
  },
};

export default config;
```

When using OpenAI TTS, set the `OPENAI_API_KEY` environment variable.

## Troubleshooting

**"Playwright browsers not installed"**
```bash
npx playwright install chromium
```

**"Could not connect to the app"**
Make sure your dev server is running before composing.

**"Voiceover generation failed"**
Re-run `npx screenwright init` to download the Piper TTS binary. Or use `--no-voiceover` to skip.

**"Out of memory during rendering"**
Try a lower resolution: `--resolution 1280x720`

**"Timed out waiting for an element"**
Check that selectors in the scenario match your app's current DOM. The error message includes the exact `sw.*` call and selector that failed.

## Architecture

```
cli/
  src/
    commands/       # CLI commands (init, generate, compose, preview)
    runtime/        # Playwright instrumentation (sw.* helpers, timeline collector)
    composition/    # Remotion components (DemoVideo, CursorOverlay, NarrationTrack)
    voiceover/      # Piper TTS engine, OpenAI TTS engine, narration timing
    generator/      # LLM prompt templates for scenario generation
    timeline/       # Timeline JSON types and Zod schema
    config/         # Configuration schema and defaults
skill/
  SKILL.md          # Claude Code skill definition
```

## Releasing

Bump the version in `cli/package.json`, commit, tag, and push:

```bash
# edit cli/package.json version
git add cli/package.json && git commit -m "Release v0.X.Y"
git tag v0.X.Y && git push origin main --tags
```

GitHub Actions publishes to npm via [trusted publishing](https://docs.npmjs.com/trusted-publishers) and creates a GitHub Release automatically.

## License

[MIT](LICENSE)
