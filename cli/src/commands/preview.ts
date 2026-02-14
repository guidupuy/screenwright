import { Command } from 'commander';
import { resolve, basename } from 'node:path';
import { access, mkdir, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ora from 'ora';
import chalk from 'chalk';
import { runScenario, type ScenarioFn } from '../runtime/instrumented-page.js';

export const previewCommand = new Command('preview')
  .description('Quick preview without cursor overlay or voiceover')
  .argument('<scenario>', 'Path to demo scenario file')
  .option('--out <path>', 'Output path for preview video')
  .action(async (scenario: string, opts) => {
    const scenarioPath = resolve(scenario);

    try {
      await access(scenarioPath);
    } catch {
      console.error(chalk.red(`Scenario file not found: ${scenarioPath}`));
      console.error(chalk.dim('Run "screenwright generate --test <path>" to create one.'));
      process.exit(1);
    }

    const outputDir = resolve(opts.out ? resolve(opts.out, '..') : './output');
    const outputPath = opts.out
      ? resolve(opts.out)
      : resolve(outputDir, `${basename(scenarioPath, '.ts')}-preview.webm`);

    await mkdir(outputDir, { recursive: true });

    // 1. Load scenario module
    let spinner = ora('Loading scenario').start();
    let scenarioFn: ScenarioFn;
    try {
      const mod = await import(pathToFileURL(scenarioPath).href);
      scenarioFn = mod.default;
      if (typeof scenarioFn !== 'function') {
        spinner.fail('Invalid scenario file');
        console.error(chalk.red('Scenario must export a default async function.'));
        process.exit(1);
      }
      spinner.succeed('Scenario loaded');
    } catch (err: any) {
      spinner.fail('Failed to load scenario');
      console.error(chalk.red(err.message));
      process.exit(1);
    }

    // 2. Run scenario
    spinner = ora('Recording preview').start();
    try {
      const result = await runScenario(scenarioFn, {
        scenarioFile: scenarioPath,
        testFile: scenarioPath,
        captureMode: 'video',
      });
      const { timeline } = result;

      if (!result.videoFile) {
        spinner.fail('No video file produced');
        process.exit(1);
      }
      await copyFile(result.videoFile, outputPath);
      spinner.succeed(`Preview saved to: ${outputPath}`);
      console.log(chalk.dim(`  ${timeline.events.length} events recorded`));
    } catch (err: any) {
      spinner.fail('Recording failed');
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });
