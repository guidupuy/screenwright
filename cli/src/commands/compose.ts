import { Command } from 'commander';
import { resolve, basename } from 'node:path';
import { access, mkdir, rm, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ora from 'ora';
import chalk from 'chalk';
import { runScenario, type ScenarioFn } from '../runtime/instrumented-page.js';
import { generateNarration } from '../voiceover/narration-timing.js';
import { ensureDependencies } from '../voiceover/voice-models.js';
import { renderDemoVideo } from '../composition/render.js';
import { loadConfig } from '../config/load-config.js';

export const composeCommand = new Command('compose')
  .description('Record and compose final demo video')
  .argument('<scenario>', 'Path to demo scenario file')
  .option('--out <path>', 'Output path for final MP4')
  .option('--resolution <res>', 'Video resolution', '1280x720')
  .option('--no-voiceover', 'Disable voiceover')
  .option('--no-cursor', 'Disable cursor overlay')
  .option('--keep-temp', 'Keep temporary files')
  .action(async (scenario: string, opts) => {
    const config = await loadConfig();
    const scenarioPath = resolve(scenario);
    const [width, height] = opts.resolution.split('x').map(Number);

    if (!width || !height) {
      console.error(chalk.red('Invalid resolution format. Use WIDTHxHEIGHT (e.g., 1280x720)'));
      process.exit(1);
    }

    // Verify scenario file exists
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
      : resolve(outputDir, `${basename(scenarioPath, '.ts')}.mp4`);

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
        console.error(chalk.dim('Example: export default async function scenario(sw) { ... }'));
        process.exit(1);
      }
      spinner.succeed('Scenario loaded');
    } catch (err: any) {
      spinner.fail('Failed to load scenario');
      console.error(chalk.red(err.message));
      if (err.message.includes('SyntaxError') || err.message.includes('Cannot find')) {
        console.error(chalk.dim('Make sure the scenario is valid TypeScript and has been compiled.'));
      }
      process.exit(1);
    }

    // 2. Run scenario in Playwright
    spinner = ora('Recording scenario in Playwright').start();
    let timeline, tempDir: string;
    try {
      const result = await runScenario(scenarioFn, {
        scenarioFile: scenarioPath,
        testFile: scenarioPath,
        viewport: { width, height },
      });
      timeline = result.timeline;
      tempDir = result.tempDir;
      spinner.succeed(`Recorded ${timeline.events.length} events`);
    } catch (err: any) {
      spinner.fail('Recording failed');
      if (err.message.includes('Executable doesn\'t exist') || err.message.includes('browserType.launch')) {
        console.error(chalk.red('Playwright browsers not installed.'));
        console.error(chalk.dim('Run: npx playwright install chromium'));
      } else if (err.message.includes('net::ERR_CONNECTION_REFUSED')) {
        console.error(chalk.red('Could not connect to the app.'));
        console.error(chalk.dim('Make sure your dev server is running.'));
      } else if (err.message.includes('Timeout') || err.message.includes('waiting for')) {
        console.error(chalk.red('Timed out waiting for an element.'));
        console.error(chalk.dim('Check that selectors in the scenario match your app.'));
      } else {
        console.error(chalk.red(err.message));
      }
      process.exit(1);
    }

    // 3. Generate voiceover (if enabled)
    let finalTimeline = timeline;
    if (opts.voiceover !== false) {
      const narrationCount = timeline.events.filter(e => e.type === 'narration').length;
      if (narrationCount > 0) {
        // Validate API key before starting TTS loop
        if (config.ttsProvider === 'openai' && !process.env.OPENAI_API_KEY) {
          console.error(chalk.red('OPENAI_API_KEY is required when ttsProvider is "openai".'));
          console.error(chalk.dim('Set it with: export OPENAI_API_KEY=sk-...'));
          process.exit(1);
        }

        spinner = ora(`Generating voiceover (${narrationCount} segments via ${config.ttsProvider})`).start();
        try {
          const modelPath = config.ttsProvider === 'piper'
            ? (await ensureDependencies(config.voice)).modelPath
            : undefined;
          finalTimeline = await generateNarration(timeline, {
            tempDir,
            modelPath,
            ttsProvider: config.ttsProvider,
            openaiVoice: config.openaiVoice,
          });
          spinner.succeed(`Generated ${narrationCount} voiceover segments`);
        } catch (err: any) {
          spinner.warn('Voiceover generation failed — continuing without audio');
          console.error(chalk.dim(err.message));
          console.error(chalk.dim('Tip: use --no-voiceover to skip, or re-run "screenwright init".'));
        }
      }
    }

    // 4. Render final video via Remotion
    spinner = ora('Composing final video').start();
    try {
      await renderDemoVideo({
        timeline: finalTimeline,
        outputPath,
        publicDir: tempDir,
      });
      spinner.succeed('Video composed');
    } catch (err: any) {
      spinner.fail('Composition failed');
      if (err.message.includes('memory') || err.message.includes('OOM')) {
        console.error(chalk.red('Out of memory during rendering.'));
        console.error(chalk.dim('Try a lower resolution: --resolution 1280x720'));
      } else {
        console.error(chalk.red(err.message));
      }
      process.exit(1);
    }

    // 5. Cleanup
    if (!opts.keepTemp) {
      await rm(tempDir, { recursive: true, force: true });
    } else {
      console.log(chalk.dim(`Temp files kept at: ${tempDir}`));
    }

    // 6. Report
    const fileStats = await stat(outputPath);
    const sizeMB = (fileStats.size / (1024 * 1024)).toFixed(1);
    const durationSec = (finalTimeline.metadata.videoDurationMs / 1000).toFixed(0);
    const mins = Math.floor(Number(durationSec) / 60);
    const secs = Number(durationSec) % 60;

    console.log('');
    console.log(chalk.green(`  Demo video saved to: ${outputPath}`));
    console.log(chalk.dim(`  Duration: ${mins}:${String(secs).padStart(2, '0')}`));
    console.log(chalk.dim(`  Size: ${sizeMB} MB`));
    console.log(chalk.dim(`  Events: ${finalTimeline.events.length}`));
  });
