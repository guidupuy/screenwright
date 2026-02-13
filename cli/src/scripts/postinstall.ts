import { access, readFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';

const ASSISTANTS = [
  { name: 'Claude Code', dir: '.claude' },
  { name: 'Codex', dir: '.codex' },
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface UpgradeSkillsOptions {
  homeDir?: string;
  skillSourcePath?: string;
}

export async function upgradeSkills(opts?: UpgradeSkillsOptions): Promise<void> {
  const home = opts?.homeDir ?? homedir();
  const sourcePath = opts?.skillSourcePath ??
    resolve(import.meta.dirname, '..', '..', '..', 'skill', 'SKILL.md');

  if (!await exists(sourcePath)) return;

  const sourceContent = await readFile(sourcePath, 'utf-8');

  for (const { dir } of ASSISTANTS) {
    const skillPath = resolve(home, dir, 'skills', 'screenwright', 'SKILL.md');
    if (!await exists(skillPath)) continue;

    const current = await readFile(skillPath, 'utf-8');
    if (current === sourceContent) continue;

    try {
      await mkdir(dirname(skillPath), { recursive: true });
      await copyFile(sourcePath, skillPath);
    } catch {
      // Silent — don't break npm install
    }
  }
}

upgradeSkills().catch(() => {});
