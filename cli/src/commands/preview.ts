import { Command } from 'commander';
import { resolve, basename } from 'node:path';
import { mkdir, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { runScenario, type ScenarioFn } from '../runtime/instrumented-page.js';

export const previewCommand = new Command('preview')
  .description('Quick preview without cursor overlay or voiceover')
  .argument('<scenario>', 'Path to demo scenario file')
  .option('--out <path>', 'Output path for preview video')
  .action(async (scenario: string, opts) => {
    const scenarioPath = resolve(scenario);
    const outputDir = resolve(opts.out ? resolve(opts.out, '..') : './output');
    const outputPath = opts.out
      ? resolve(opts.out)
      : resolve(outputDir, `${basename(scenarioPath, '.ts')}-preview.webm`);

    await mkdir(outputDir, { recursive: true });

    // 1. Load scenario module
    console.log('Loading scenario...');
    const mod = await import(pathToFileURL(scenarioPath).href);
    const scenarioFn: ScenarioFn = mod.default;

    if (typeof scenarioFn !== 'function') {
      console.error('Scenario must export a default async function.');
      process.exit(1);
    }

    // 2. Run scenario — just capture the raw video
    console.log('Recording preview...');
    const { videoFile, timeline } = await runScenario(scenarioFn, {
      scenarioFile: scenarioPath,
      testFile: scenarioPath,
    });

    // 3. Copy raw WebM to output
    await copyFile(videoFile, outputPath);
    console.log(`Preview saved to: ${outputPath}`);
    console.log(`  ${timeline.events.length} events recorded`);
  });
