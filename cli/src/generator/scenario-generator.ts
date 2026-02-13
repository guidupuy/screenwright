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
 * markdown code fences.
 */
export function extractScenarioCode(llmResponse: string): string {
  // Try to extract from code fence
  const fenceMatch = llmResponse.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // If no fence, assume the whole response is code
  return llmResponse.trim();
}
