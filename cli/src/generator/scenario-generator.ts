import { readFile } from 'node:fs/promises';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';

export interface GenerateOptions {
  testPath: string;
  narrationStyle: 'brief' | 'detailed';
  appDescription?: string;
}

export interface GenerateResult {
  scenarioSource: string;
  systemPrompt: string;
  userPrompt: string;
}

export interface ValidationError {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Read a Playwright test file and produce the LLM prompt pair
 * needed to generate a demo scenario.
 *
 * The actual LLM call happens in the skill layer (Claude Code),
 * not here. This function prepares the prompt and returns it
 * along with any post-processing.
 *
 * When used standalone (without the skill), the user can pipe
 * the prompts to any LLM.
 */
export async function prepareGeneration(opts: GenerateOptions): Promise<{
  systemPrompt: string;
  userPrompt: string;
}> {
  const testSource = await readFile(opts.testPath, 'utf-8');

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(testSource, opts.narrationStyle, opts.appDescription),
  };
}

/**
 * Extract TypeScript code from an LLM response that may contain
 * markdown code fences. When multiple fences are found, returns the
 * longest one (LLMs often produce a small snippet first, then the full code).
 */
export function extractScenarioCode(llmResponse: string): string {
  const fenceRegex = /```(?:typescript|ts)?[\r\n]+([\s\S]*?)```/g;
  let best: string | null = null;
  let match;

  while ((match = fenceRegex.exec(llmResponse)) !== null) {
    const code = match[1].trim();
    if (best === null || code.length > best.length) {
      best = code;
    }
  }

  if (best !== null) return best;

  // No fence found — assume the whole response is code
  return llmResponse.trim();
}

/**
 * Validate that a string looks like a valid Screenwright scenario.
 * Returns errors (fatal) and warnings (non-fatal).
 */
export function validateScenarioCode(code: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Empty input
  if (!code || !code.trim()) {
    return { valid: false, errors: [{ code: 'EMPTY_INPUT', message: 'Scenario code is empty' }], warnings: [] };
  }

  // Missing ScreenwrightHelpers import
  if (!/import\s+(?:type\s+)?\{[^}]*(?:type\s+)?ScreenwrightHelpers[^}]*\}\s+from\s+['"]screenwright['"]/.test(code)) {
    errors.push({ code: 'MISSING_IMPORT', message: 'Missing ScreenwrightHelpers import from screenwright' });
  }

  // Missing default async export
  if (!/export\s+default\s+async\s+function/.test(code)) {
    errors.push({ code: 'MISSING_DEFAULT_EXPORT', message: 'Missing export default async function' });
  }

  // Raw page.* calls (but not sw.page.*)
  if (/(?<!sw\.)(?<!\w\.)page\.\w+\s*\(/.test(code)) {
    errors.push({ code: 'RAW_PAGE_CALL', message: 'Raw page.*() calls are not allowed — use sw.* helpers instead' });
  }

  // Assertion imports
  if (/(?:import|require)[^;]*(?:expect|assert)/.test(code)) {
    errors.push({ code: 'ASSERTION_IMPORT', message: 'Assertion library imports are not allowed in scenarios' });
  }

  // Assertion calls
  if (/\b(?:expect|assert)\s*[.(]/.test(code)) {
    errors.push({ code: 'ASSERTION_CALL', message: 'Assertion calls (expect/assert) are not allowed in scenarios' });
  }

  // Warnings — no scenes
  if (!/\.scene\s*\(/.test(code)) {
    warnings.push({ code: 'NO_SCENES', message: 'No sw.scene() calls found — consider adding scene boundaries' });
  }

  // Warnings — no waits
  if (!/\.wait\s*\(/.test(code)) {
    warnings.push({ code: 'NO_WAITS', message: 'No sw.wait() calls found — consider adding pacing' });
  }

  // Warnings — no narration
  if (!/narration/.test(code)) {
    warnings.push({ code: 'NO_NARRATION', message: 'No narration found — consider adding narration to actions' });
  }

  return { valid: errors.length === 0, errors, warnings };
}
