import { Command } from 'commander';
import { resolve, basename } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { prepareGeneration } from '../generator/scenario-generator.js';

export const generateCommand = new Command('generate')
  .description('Generate demo scenario from a Playwright test')
  .requiredOption('--test <path>', 'Path to Playwright test file')
  .option('--out <path>', 'Output path for generated scenario')
  .option('--narration-style <style>', 'Narration style: brief or detailed', 'detailed')
  .option('--data-profile <json>', 'JSON data profile for fixture replacement')
  .action(async (opts) => {
    const testPath = resolve(opts.test);
    const outDir = resolve(opts.out ? resolve(opts.out, '..') : './demos');
    const outPath = opts.out
      ? resolve(opts.out)
      : resolve(outDir, `${basename(testPath, '.spec.ts')}-demo.ts`);

    await mkdir(outDir, { recursive: true });

    const { systemPrompt, userPrompt } = await prepareGeneration({
      testPath,
      narrationStyle: opts.narrationStyle,
      appDescription: opts.dataProfile,
    });

    // In standalone mode: output the prompts for the user to send to an LLM
    // In skill mode: the skill handles the LLM call directly
    console.log('=== System Prompt ===');
    console.log(systemPrompt);
    console.log('\n=== User Prompt ===');
    console.log(userPrompt);
    console.log(`\nOutput will be written to: ${outPath}`);
    console.log('Pipe the above prompts to an LLM, then save the response to the output path.');
    console.log('Or use the /screenwright skill in Claude Code for automatic generation.');
  });
