import { Command } from 'commander';
import { writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defaultConfig, serializeConfig } from '../config/defaults.js';
import { ensureDependencies } from '../voiceover/voice-models.js';

export const initCommand = new Command('init')
  .description('Bootstrap config and download voice model')
  .option('--voice <model>', 'Voice model to use', 'en_US-amy-medium')
  .option('--skip-voice-download', 'Skip downloading the voice model')
  .action(async (opts) => {
    const configPath = resolve(process.cwd(), 'screenwright.config.ts');

    let configExists = false;
    try {
      await access(configPath);
      configExists = true;
      console.log('screenwright.config.ts already exists, skipping.');
    } catch {
      // File doesn't exist, create it
    }

    if (!configExists) {
      const config = { ...defaultConfig, voice: opts.voice };
      await writeFile(configPath, serializeConfig(config), 'utf-8');
      console.log('Created screenwright.config.ts');
    }

    if (!opts.skipVoiceDownload) {
      console.log('Downloading Piper TTS and voice model...');
      try {
        await ensureDependencies(opts.voice);
        console.log('Voice model ready.');
      } catch (err) {
        console.warn(`Warning: Could not download voice model: ${err}`);
        console.warn('Voiceover will not be available. Re-run "screenwright init" to retry.');
      }
    }

    console.log('Screenwright initialized.');
  });
