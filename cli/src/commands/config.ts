import { Command } from 'commander';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import { loadConfig } from '../config/load-config.js';
import { serializeConfig } from '../config/defaults.js';
import { openaiVoices, type ScreenwrightConfig } from '../config/config-schema.js';

export const configCommand = new Command('config')
  .description('Interactively configure Screenwright options')
  .action(async () => {
    const current = await loadConfig();
    console.log(chalk.bold.underline('Screenwright Configuration\n'));

    const config: ScreenwrightConfig = { ...current };

    config.ttsProvider = await select({
      message: 'TTS Provider',
      choices: [
        { value: 'piper' as const, description: 'Local, offline, free' },
        { value: 'openai' as const, description: 'Cloud, higher quality, requires API key' },
      ],
      default: current.ttsProvider,
    });

    if (config.ttsProvider === 'piper') {
      config.voice = await input({
        message: 'Piper voice model',
        default: current.voice,
      });
    } else {
      config.openaiVoice = await select({
        message: 'OpenAI Voice',
        choices: openaiVoices.map(v => ({ value: v })),
        default: current.openaiVoice,
      });
    }

    config.resolution = await select({
      message: 'Resolution',
      choices: [
        { name: '1280x720 (720p)', value: { width: 1280, height: 720 } },
        { name: '1920x1080 (1080p)', value: { width: 1920, height: 1080 } },
      ],
      default: current.resolution,
    });

    config.colorScheme = await select({
      message: 'Color Scheme',
      choices: [
        { value: 'light' as const },
        { value: 'dark' as const },
      ],
      default: current.colorScheme,
    });

    config.locale = await input({
      message: 'Locale',
      default: current.locale,
    });

    config.timezoneId = await input({
      message: 'Timezone',
      default: current.timezoneId,
    });

    config.outputDir = await input({
      message: 'Output directory',
      default: current.outputDir,
    });

    const configPath = resolve(process.cwd(), 'screenwright.config.ts');
    await writeFile(configPath, serializeConfig(config), 'utf-8');

    console.log('');
    console.log(chalk.green(`Saved to ${configPath}`));
  });
