import { Command } from 'commander';
import { writeFile, access, readFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { confirm, select, input } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';
import { defaultConfig, serializeConfig } from '../config/defaults.js';
import { openaiVoices } from '../config/config-schema.js';
import { ensureDependencies } from '../voiceover/voice-models.js';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function askYesNo(question: string): Promise<boolean> {
  return confirm({ message: question, default: false });
}

function getSkillSourcePath(): string {
  return resolve(import.meta.dirname, '..', '..', '..', 'skill', 'SKILL.md');
}

interface AssistantTarget {
  name: string;
  homeDir: string;
  skillPath: string;
}

function getAssistantTargets(home: string): AssistantTarget[] {
  return [
    {
      name: 'Claude Code',
      homeDir: resolve(home, '.claude'),
      skillPath: resolve(home, '.claude', 'skills', 'screenwright', 'SKILL.md'),
    },
    {
      name: 'Codex',
      homeDir: resolve(home, '.codex'),
      skillPath: resolve(home, '.codex', 'skills', 'screenwright', 'SKILL.md'),
    },
  ];
}

export interface InstallSkillsOptions {
  askFn?: (question: string) => Promise<boolean>;
  homeDir?: string;
  skillSourcePath?: string;
}

export async function installSkills(opts?: InstallSkillsOptions): Promise<void> {
  const ask = opts?.askFn ?? askYesNo;
  const home = opts?.homeDir ?? homedir();
  const sourcePath = opts?.skillSourcePath ?? getSkillSourcePath();

  if (!await exists(sourcePath)) {
    console.log(chalk.dim('Bundled skill not found, skipping skill install.'));
    return;
  }

  const sourceContent = await readFile(sourcePath, 'utf-8');
  const targets = getAssistantTargets(home);
  const detected = [];
  for (const t of targets) {
    if (await exists(t.homeDir)) detected.push(t);
  }

  if (detected.length === 0) {
    console.log(chalk.dim('No coding assistants detected, skipping skill install.'));
    return;
  }

  for (const t of detected) {
    const installed = await exists(t.skillPath);
    if (installed) {
      const current = await readFile(t.skillPath, 'utf-8');
      if (current === sourceContent) {
        console.log(chalk.dim(`${t.name} skill already up to date.`));
        continue;
      }
      const ok = await ask(`${t.name} skill exists but differs. Overwrite?`);
      if (!ok) continue;
    } else {
      const ok = await ask(`Install skill for ${t.name}?`);
      if (!ok) continue;
    }

    try {
      await mkdir(dirname(t.skillPath), { recursive: true });
      await copyFile(sourcePath, t.skillPath);
      console.log(chalk.green(`Installed skill for ${t.name}.`));
    } catch (err: any) {
      console.warn(chalk.yellow(`Could not install skill for ${t.name}: ${err.message}`));
    }
  }
}

export const initCommand = new Command('init')
  .description('Bootstrap config and download voice model')
  .option('--voice <model>', 'Voice model to use')
  .option('--tts <provider>', 'TTS provider: piper or openai')
  .option('--openai-voice <voice>', 'OpenAI voice name')
  .option('--skip-voice-download', 'Skip downloading the voice model')
  .option('--skip-skill-install', 'Skip coding assistant skill installation')
  .action(async (opts) => {
    const configPath = resolve(process.cwd(), 'screenwright.config.ts');

    // Config file
    let configExists = false;
    try {
      await access(configPath);
      configExists = true;
    } catch {
      // doesn't exist
    }

    if (configExists) {
      console.log(chalk.dim('screenwright.config.ts already exists, skipping.'));
    } else {
      // Interactive prompts for options not provided via CLI flags
      const ttsProvider = opts.tts ?? await select({
        message: 'TTS Provider',
        choices: [
          { value: 'piper', description: 'Local, offline, free' },
          { value: 'openai', description: 'Cloud, higher quality, requires API key' },
        ],
        default: 'piper',
      });

      let voice = opts.voice;
      let openaiVoice = opts.openaiVoice;

      if (ttsProvider === 'piper' && !voice) {
        voice = await input({
          message: 'Piper voice model',
          default: defaultConfig.voice,
        });
      } else if (ttsProvider === 'openai' && !openaiVoice) {
        openaiVoice = await select({
          message: 'OpenAI Voice',
          choices: openaiVoices.map(v => ({ value: v })),
          default: defaultConfig.openaiVoice,
        });
      }

      const pacing = await select({
        message: 'Pacing',
        choices: [
          { value: 'fast' as const, description: 'Near-zero pauses — maximum speed' },
          { value: 'normal' as const, description: 'Snappy with brief pauses' },
          { value: 'cinematic' as const, description: 'Full natural pacing' },
        ],
        default: 'normal',
      });

      const config = {
        ...defaultConfig,
        voice: voice ?? defaultConfig.voice,
        ttsProvider: ttsProvider as 'piper' | 'openai',
        openaiVoice: (openaiVoice ?? defaultConfig.openaiVoice) as typeof defaultConfig.openaiVoice,
        pacing,
      };
      await writeFile(configPath, serializeConfig(config), 'utf-8');
      console.log(chalk.green('Created screenwright.config.ts'));

      // Update opts so downstream steps use the chosen values
      opts.tts = ttsProvider;
      opts.voice = config.voice;
      opts.openaiVoice = config.openaiVoice;
    }

    // Voice model (skip for OpenAI)
    if (!opts.skipVoiceDownload && opts.tts !== 'openai') {
      const spinner = ora('Downloading Piper TTS and voice model').start();
      try {
        await ensureDependencies(opts.voice ?? defaultConfig.voice);
        spinner.succeed('Piper TTS and voice model ready');
      } catch (err: any) {
        spinner.warn('Could not download voice model');
        console.error(chalk.dim(err.message));
        console.error(chalk.dim('Voiceover will be unavailable. Re-run "screenwright init" to retry.'));
        console.error(chalk.dim('Use --no-voiceover with compose to skip voiceover.'));
      }
    }

    // Validate OpenAI API key
    if (opts.tts === 'openai' && !process.env.OPENAI_API_KEY) {
      console.warn(chalk.yellow('Warning: OPENAI_API_KEY not set. OpenAI TTS will fail at compose time.'));
      console.log(chalk.dim('Set it with: export OPENAI_API_KEY=sk-...'));
    }

    // Coding assistant skills
    if (!opts.skipSkillInstall) {
      await installSkills();
    }

    console.log('');
    console.log(chalk.green('Screenwright initialized.'));
    console.log(chalk.dim('Next: screenwright generate --test <path>'));
  });
