import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function skillSourcePath(): string {
  return resolve(import.meta.dirname, '..', '..', '..', 'skill', 'SKILL.md');
}

export const skillCommand = new Command('skill')
  .description('Print the Claude Code skill definition to stdout')
  .action(async () => {
    const content = await readFile(skillSourcePath(), 'utf-8');
    process.stdout.write(content);
  });
