import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installSkills } from '../../src/commands/init.js';

let tmp: string;
let logs: string[];
let warns: string[];

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'sw-skill-test-'));
  logs = [];
  warns = [];
  vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
    logs.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'warn').mockImplementation((...args: any[]) => {
    warns.push(args.map(String).join(' '));
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(tmp, { recursive: true, force: true });
});

function skillSource() {
  return join(tmp, 'skill-source', 'SKILL.md');
}

async function writeSkillSource(content = '# Screenwright Skill') {
  await mkdir(join(tmp, 'skill-source'), { recursive: true });
  await writeFile(skillSource(), content, 'utf-8');
}

function homeDir() {
  return join(tmp, 'home');
}

async function setupAssistant(name: string) {
  await mkdir(join(homeDir(), name), { recursive: true });
}

function alwaysYes() {
  return async () => true;
}

function alwaysNo() {
  return async () => false;
}

describe('installSkills', () => {
  it('skips silently when no assistants detected', async () => {
    await writeSkillSource();
    await mkdir(homeDir(), { recursive: true });

    await installSkills({
      askFn: alwaysYes(),
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    expect(logs.join('\n')).toContain('No coding assistants detected');
  });

  it('skips silently when bundled skill is missing', async () => {
    await mkdir(homeDir(), { recursive: true });
    await setupAssistant('.claude');

    await installSkills({
      askFn: alwaysYes(),
      homeDir: homeDir(),
      skillSourcePath: join(tmp, 'nonexistent', 'SKILL.md'),
    });

    expect(logs.join('\n')).toContain('Bundled skill not found');
  });

  it('installs for Claude Code when user confirms', async () => {
    await writeSkillSource();
    await setupAssistant('.claude');

    await installSkills({
      askFn: alwaysYes(),
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    const installed = await readFile(
      join(homeDir(), '.claude', 'skills', 'screenwright', 'SKILL.md'),
      'utf-8',
    );
    expect(installed).toBe('# Screenwright Skill');
    expect(logs.join('\n')).toContain('Installed skill for Claude Code');
  });

  it('installs for Codex when user confirms', async () => {
    await writeSkillSource();
    await setupAssistant('.codex');

    await installSkills({
      askFn: alwaysYes(),
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    const installed = await readFile(
      join(homeDir(), '.codex', 'skills', 'screenwright', 'SKILL.md'),
      'utf-8',
    );
    expect(installed).toBe('# Screenwright Skill');
    expect(logs.join('\n')).toContain('Installed skill for Codex');
  });

  it('prompts for both when both detected', async () => {
    await writeSkillSource();
    await setupAssistant('.claude');
    await setupAssistant('.codex');

    const questions: string[] = [];
    const askFn = async (q: string) => {
      questions.push(q);
      return true;
    };

    await installSkills({
      askFn,
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    expect(questions).toHaveLength(2);
    expect(questions[0]).toContain('Claude Code');
    expect(questions[1]).toContain('Codex');
  });

  it('does not copy when user declines', async () => {
    await writeSkillSource();
    await setupAssistant('.claude');

    await installSkills({
      askFn: alwaysNo(),
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    const { access } = await import('node:fs/promises');
    await expect(
      access(join(homeDir(), '.claude', 'skills', 'screenwright', 'SKILL.md')),
    ).rejects.toThrow();
  });

  it('skips without prompt when skill is already identical', async () => {
    await writeSkillSource();
    await setupAssistant('.claude');

    const destDir = join(homeDir(), '.claude', 'skills', 'screenwright');
    await mkdir(destDir, { recursive: true });
    await writeFile(join(destDir, 'SKILL.md'), '# Screenwright Skill', 'utf-8');

    const askFn = vi.fn().mockResolvedValue(true);

    await installSkills({
      askFn,
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    expect(askFn).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('already up to date');
  });

  it('prompts overwrite when skill exists but differs, user confirms', async () => {
    await writeSkillSource('# New version');
    await setupAssistant('.claude');

    const destDir = join(homeDir(), '.claude', 'skills', 'screenwright');
    await mkdir(destDir, { recursive: true });
    await writeFile(join(destDir, 'SKILL.md'), '# Old version', 'utf-8');

    const askFn = vi.fn().mockResolvedValue(true);

    await installSkills({
      askFn,
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    expect(askFn).toHaveBeenCalledOnce();
    expect(askFn.mock.calls[0][0]).toContain('Overwrite');

    const updated = await readFile(join(destDir, 'SKILL.md'), 'utf-8');
    expect(updated).toBe('# New version');
  });

  it('does not overwrite when skill differs and user declines', async () => {
    await writeSkillSource('# New version');
    await setupAssistant('.claude');

    const destDir = join(homeDir(), '.claude', 'skills', 'screenwright');
    await mkdir(destDir, { recursive: true });
    await writeFile(join(destDir, 'SKILL.md'), '# Old version', 'utf-8');

    await installSkills({
      askFn: alwaysNo(),
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    const content = await readFile(join(destDir, 'SKILL.md'), 'utf-8');
    expect(content).toBe('# Old version');
  });

  it('warns but does not crash on file copy failure', async () => {
    await writeSkillSource();
    await setupAssistant('.claude');

    // Make the .claude dir read-only so mkdir inside it fails
    await chmod(join(homeDir(), '.claude'), 0o444);

    await installSkills({
      askFn: alwaysYes(),
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    // Restore perms for cleanup
    await chmod(join(homeDir(), '.claude'), 0o755);

    expect(warns.join('\n')).toContain('Could not install skill for Claude Code');
  });
});
