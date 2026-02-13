import { Command } from 'commander';
import { resolve, basename } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { runScenario, type ScenarioFn } from '../runtime/instrumented-page.js';
import { generateNarration } from '../voiceover/narration-timing.js';
import { ensureDependencies } from '../voiceover/voice-models.js';
import { renderDemoVideo } from '../composition/render.js';

export const composeCommand = new Command('compose')
  .description('Record and compose final demo video')
  .argument('<scenario>', 'Path to demo scenario file')
  .option('--out <path>', 'Output path for final MP4')
  .option('--resolution <res>', 'Video resolution', '1280x720')
  .option('--no-voiceover', 'Disable voiceover')
  .option('--no-cursor', 'Disable cursor overlay')
  .option('--keep-temp', 'Keep temporary files')
  .action(async (scenario: string, opts) => {
    const scenarioPath = resolve(scenario);
    const [width, height] = opts.resolution.split('x').map(Number);
    const outputDir = resolve(opts.out ? resolve(opts.out, '..') : './output');
    const outputPath = opts.out
      ? resolve(opts.out)
      : resolve(outputDir, `${basename(scenarioPath, '.ts')}.mp4`);

    await mkdir(outputDir, { recursive: true });

    // 1. Load scenario module
    console.log('Loading scenario...');
    const mod = await import(pathToFileURL(scenarioPath).href);
    const scenarioFn: ScenarioFn = mod.default;

    if (typeof scenarioFn !== 'function') {
      console.error('Scenario must export a default async function.');
      process.exit(1);
    }

    // 2. Run scenario in Playwright
    console.log('Recording scenario...');
    const { timeline, tempDir } = await runScenario(scenarioFn, {
      scenarioFile: scenarioPath,
      testFile: scenarioPath,
      viewport: { width, height },
    });
    console.log(`  Recorded ${timeline.events.length} events`);

    // 3. Generate voiceover (if enabled)
    let finalTimeline = timeline;
    if (opts.voiceover !== false) {
      const narrationCount = timeline.events.filter(e => e.type === 'narration').length;
      if (narrationCount > 0) {
        console.log(`Generating voiceover (${narrationCount} segments)...`);
        const { modelPath } = await ensureDependencies();
        finalTimeline = await generateNarration(timeline, {
          tempDir,
          modelPath,
        });
      }
    }

    // 4. Render final video via Remotion
    console.log('Composing final video...');
    await renderDemoVideo({
      timeline: finalTimeline,
      outputPath,
    });

    // 5. Cleanup
    if (!opts.keepTemp) {
      await rm(tempDir, { recursive: true, force: true });
    } else {
      console.log(`Temp files kept at: ${tempDir}`);
    }

    console.log(`Demo video saved to: ${outputPath}`);
  });
