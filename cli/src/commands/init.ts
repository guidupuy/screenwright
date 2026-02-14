import { Command } from 'commander';
import { writeFile, access, readFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import ora from 'ora';
import chalk from 'chalk';
import { defaultConfig, serializeConfig } from '../config/defaults.js';
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
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim().toLowerCase() === 'y';
  } catch {
    return false;
  } finally {
    rl.close();
  }
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
      const confirm = await ask(`${t.name} skill exists but differs. Overwrite? (y/N) `);
      if (!confirm) continue;
    } else {
      const confirm = await ask(`Install skill for ${t.name}? (y/N) `);
      if (!confirm) continue;
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
  .option('--voice <model>', 'Voice model to use', 'en_US-amy-medium')
  .option('--tts <provider>', 'TTS provider: piper or openai', 'piper')
  .option('--openai-voice <voice>', 'OpenAI voice name', 'nova')
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
      const config = {
        ...defaultConfig,
        voice: opts.voice,
        ttsProvider: opts.tts,
        openaiVoice: opts.openaiVoice,
      };
      await writeFile(configPath, serializeConfig(config), 'utf-8');
      console.log(chalk.green('Created screenwright.config.ts'));
    }

    // Voice model (skip for OpenAI)
    if (!opts.skipVoiceDownload && opts.tts !== 'openai') {
      const spinner = ora('Downloading Piper TTS and voice model').start();
      try {
        await ensureDependencies(opts.voice);
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
