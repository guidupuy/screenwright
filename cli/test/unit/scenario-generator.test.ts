import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateScenarioCode, extractScenarioCode } from '../../src/generator/scenario-generator.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../../src/generator/prompts.js';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');
const sampleScenario = readFileSync(resolve(FIXTURES, 'sample-scenario.ts'), 'utf-8');

// --------------- validateScenarioCode ---------------

describe('validateScenarioCode', () => {
  it('accepts a valid scenario', () => {
    const r = validateScenarioCode(sampleScenario);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('accepts import type { ScreenwrightHelpers }', () => {
    const code = `import type { ScreenwrightHelpers } from 'screenwright';
export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.scene('test'); await sw.wait(1000);
}`;
    expect(validateScenarioCode(code).valid).toBe(true);
  });

  it('accepts import { ScreenwrightHelpers } (no type keyword)', () => {
    const code = `import { ScreenwrightHelpers } from 'screenwright';
export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.scene('test'); await sw.wait(1000);
}`;
    expect(validateScenarioCode(code).valid).toBe(true);
  });

  it('accepts import { type ScreenwrightHelpers } (inline type)', () => {
    const code = `import { type ScreenwrightHelpers } from 'screenwright';
export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.scene('test'); await sw.wait(1000);
}`;
    expect(validateScenarioCode(code).valid).toBe(true);
  });

  it('accepts single and double quotes', () => {
    const single = `import type { ScreenwrightHelpers } from 'screenwright';
export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.scene('test'); await sw.wait(1000);
}`;
    const double = `import type { ScreenwrightHelpers } from "screenwright";
export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.scene('test'); await sw.wait(1000);
}`;
    expect(validateScenarioCode(single).valid).toBe(true);
    expect(validateScenarioCode(double).valid).toBe(true);
  });

  it('rejects missing import → MISSING_IMPORT', () => {
    const code = `export default async function scenario(sw: any) {
  await sw.scene('test'); await sw.wait(1000);
}`;
    const r = validateScenarioCode(code);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'MISSING_IMPORT')).toBe(true);
  });

  it('rejects wrong package name → MISSING_IMPORT', () => {
    const code = `import type { ScreenwrightHelpers } from 'wrong-package';
export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.scene('test'); await sw.wait(1000);
}`;
    const r = validateScenarioCode(code);
    expect(r.errors.some(e => e.code === 'MISSING_IMPORT')).toBe(true);
  });

  it('rejects missing default export → MISSING_DEFAULT_EXPORT', () => {
    const code = `import type { ScreenwrightHelpers } from 'screenwright';
async function scenario(sw: ScreenwrightHelpers) {
  await sw.scene('test'); await sw.wait(1000);
}`;
    const r = validateScenarioCode(code);
    expect(r.errors.some(e => e.code === 'MISSING_DEFAULT_EXPORT')).toBe(true);
  });

  it('rejects non-async export default function → MISSING_DEFAULT_EXPORT', () => {
    const code = `import type { ScreenwrightHelpers } from 'screenwright';
export default function scenario(sw: ScreenwrightHelpers) {
  sw.scene('test'); sw.wait(1000);
}`;
    const r = validateScenarioCode(code);
    expect(r.errors.some(e => e.code === 'MISSING_DEFAULT_EXPORT')).toBe(true);
  });

  it('rejects raw page.click() → RAW_PAGE_CALL', () => {
    const code = `import type { ScreenwrightHelpers } from 'screenwright';
export default async function scenario(sw: ScreenwrightHelpers) {
  await page.click('#btn');
  await sw.scene('test'); await sw.wait(1000);
}`;
    const r = validateScenarioCode(code);
    expect(r.errors.some(e => e.code === 'RAW_PAGE_CALL')).toBe(true);
  });

  it('allows sw.page.evaluate() (via lookbehind)', () => {
    const code = `import type { ScreenwrightHelpers } from 'screenwright';
export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.page.evaluate(() => {});
  await sw.scene('test'); await sw.wait(1000);
}`;
    const r = validateScenarioCode(code);
    expect(r.errors.some(e => e.code === 'RAW_PAGE_CALL')).toBe(false);
  });

  it('rejects expect() calls → ASSERTION_CALL', () => {
    const code = `import type { ScreenwrightHelpers } from 'screenwright';
export default async function scenario(sw: ScreenwrightHelpers) {
  expect(true).toBe(true);
  await sw.scene('test'); await sw.wait(1000);
}`;
    const r = validateScenarioCode(code);
    expect(r.errors.some(e => e.code === 'ASSERTION_CALL')).toBe(true);
  });

  it('rejects assert() calls → ASSERTION_CALL', () => {
    const code = `import type { ScreenwrightHelpers } from 'screenwright';
export default async function scenario(sw: ScreenwrightHelpers) {
  assert(true);
  await sw.scene('test'); await sw.wait(1000);
}`;
    const r = validateScenarioCode(code);
    expect(r.errors.some(e => e.code === 'ASSERTION_CALL')).toBe(true);
  });

  it('rejects import { expect } → ASSERTION_IMPORT', () => {
    const code = `import type { ScreenwrightHelpers } from 'screenwright';
import { expect } from '@playwright/test';
export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.scene('test'); await sw.wait(1000);
}`;
    const r = validateScenarioCode(code);
    expect(r.errors.some(e => e.code === 'ASSERTION_IMPORT')).toBe(true);
  });

  it('reports multiple errors simultaneously', () => {
    const code = `async function bad() {
  await page.click('#btn');
  expect(true).toBe(true);
}`;
    const r = validateScenarioCode(code);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('warns on no scenes → NO_SCENES', () => {
    const code = `import type { ScreenwrightHelpers } from 'screenwright';
export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.navigate('http://localhost:3000', { narration: 'hello' });
  await sw.wait(1000);
}`;
    const r = validateScenarioCode(code);
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.code === 'NO_SCENES')).toBe(true);
  });

  it('warns on no waits → NO_WAITS', () => {
    const code = `import type { ScreenwrightHelpers } from 'screenwright';
export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.scene('test');
  await sw.navigate('http://localhost:3000', { narration: 'hello' });
}`;
    const r = validateScenarioCode(code);
    expect(r.warnings.some(w => w.code === 'NO_WAITS')).toBe(true);
  });

  it('warns on no narration → NO_NARRATION', () => {
    const code = `import type { ScreenwrightHelpers } from 'screenwright';
export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.scene('test');
  await sw.click('#btn');
  await sw.wait(1000);
}`;
    const r = validateScenarioCode(code);
    expect(r.warnings.some(w => w.code === 'NO_NARRATION')).toBe(true);
  });

  it('rejects empty input → EMPTY_INPUT', () => {
    expect(validateScenarioCode('').errors[0].code).toBe('EMPTY_INPUT');
    expect(validateScenarioCode('   \n  ').errors[0].code).toBe('EMPTY_INPUT');
  });
});

// --------------- extractScenarioCode ---------------

describe('extractScenarioCode', () => {
  it('extracts from ```typescript fence', () => {
    const input = "Here's the code:\n```typescript\nconst x = 1;\n```\n";
    expect(extractScenarioCode(input)).toBe('const x = 1;');
  });

  it('extracts from ```ts fence', () => {
    const input = "```ts\nconst x = 1;\n```";
    expect(extractScenarioCode(input)).toBe('const x = 1;');
  });

  it('extracts from bare ``` fence', () => {
    const input = "```\nconst x = 1;\n```";
    expect(extractScenarioCode(input)).toBe('const x = 1;');
  });

  it('handles preamble text before fence', () => {
    const input = "Sure! Here is the scenario:\n\n```typescript\nconst x = 1;\n```\n\nHope that helps!";
    expect(extractScenarioCode(input)).toBe('const x = 1;');
  });

  it('returns raw input when no fence found', () => {
    const input = 'const x = 1;';
    expect(extractScenarioCode(input)).toBe('const x = 1;');
  });

  it('takes the longest fence when multiple exist', () => {
    const input = [
      'Here is a snippet:',
      '```typescript',
      'const short = 1;',
      '```',
      '',
      'And here is the full scenario:',
      '```typescript',
      'import type { ScreenwrightHelpers } from "screenwright";',
      '',
      'export default async function scenario(sw: ScreenwrightHelpers) {',
      '  await sw.scene("test");',
      '}',
      '```',
    ].join('\n');
    const result = extractScenarioCode(input);
    expect(result).toContain('export default async function');
    expect(result).not.toBe('const short = 1;');
  });

  it('handles CRLF line endings', () => {
    const input = '```typescript\r\nconst x = 1;\r\n```';
    expect(extractScenarioCode(input)).toBe('const x = 1;');
  });

  it('trims whitespace', () => {
    const input = '```typescript\n  \n  const x = 1;\n  \n```';
    expect(extractScenarioCode(input)).toContain('const x = 1;');
  });
});

// --------------- prompts ---------------

describe('SYSTEM_PROMPT', () => {
  const swMethods = ['scene', 'navigate', 'click', 'fill', 'hover', 'press', 'wait', 'narrate'];

  for (const method of swMethods) {
    it(`documents sw.${method}()`, () => {
      expect(SYSTEM_PROMPT).toContain(`sw.${method}(`);
    });
  }

  it('includes "Common mistakes" section', () => {
    expect(SYSTEM_PROMPT).toContain('Common mistakes');
  });

  it('includes structural template', () => {
    expect(SYSTEM_PROMPT).toContain('Output format');
    expect(SYSTEM_PROMPT).toContain('export default async function scenario(sw: ScreenwrightHelpers)');
  });
});

describe('buildUserPrompt', () => {
  const testSource = 'test("x", async ({ page }) => { await page.click("#btn"); });';

  it('includes test source in code fence', () => {
    const prompt = buildUserPrompt(testSource, 'brief');
    expect(prompt).toContain('```typescript');
    expect(prompt).toContain(testSource);
  });

  it('differentiates brief vs detailed narration style', () => {
    const brief = buildUserPrompt(testSource, 'brief');
    const detailed = buildUserPrompt(testSource, 'detailed');
    expect(brief).toContain('concise');
    expect(detailed).toContain('detailed');
    expect(brief).not.toEqual(detailed);
  });

  it('includes app description when provided', () => {
    const prompt = buildUserPrompt(testSource, 'brief', 'E-commerce store');
    expect(prompt).toContain('E-commerce store');
  });

  it('omits app description when not provided', () => {
    const prompt = buildUserPrompt(testSource, 'brief');
    expect(prompt).not.toContain('App context');
  });

  it('includes few-shot example', () => {
    const prompt = buildUserPrompt(testSource, 'brief');
    expect(prompt).toContain('example conversion');
    expect(prompt).toContain('Shopping for a Laptop');
  });
});
