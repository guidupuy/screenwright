import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { upgradeSkills } from '../../src/scripts/postinstall.js';

let tmp: string;

async function setup() {
  tmp = await mkdtemp(join(tmpdir(), 'sw-postinstall-test-'));
}

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function homeDir() {
  return join(tmp, 'home');
}

function skillSource() {
  return join(tmp, 'skill-source', 'SKILL.md');
}

async function writeSkillSource(content = '# v2') {
  await mkdir(join(tmp, 'skill-source'), { recursive: true });
  await writeFile(skillSource(), content, 'utf-8');
}

async function installSkillFor(assistant: string, content = '# v1') {
  const dir = join(homeDir(), assistant, 'skills', 'screenwright');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), content, 'utf-8');
}

function skillPathFor(assistant: string) {
  return join(homeDir(), assistant, 'skills', 'screenwright', 'SKILL.md');
}

describe('upgradeSkills (postinstall)', () => {
  it('does nothing when skill source is missing', async () => {
    await setup();
    // Should not throw
    await upgradeSkills({
      homeDir: homeDir(),
      skillSourcePath: join(tmp, 'nonexistent', 'SKILL.md'),
    });
  });

  it('does nothing when no assistants have the skill installed', async () => {
    await setup();
    await writeSkillSource();
    await mkdir(join(homeDir(), '.claude'), { recursive: true });

    await upgradeSkills({
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    // No skill file should have been created
    const { access } = await import('node:fs/promises');
    await expect(access(skillPathFor('.claude'))).rejects.toThrow();
  });

  it('upgrades Claude Code skill when it exists and differs', async () => {
    await setup();
    await writeSkillSource('# v2');
    await installSkillFor('.claude', '# v1');

    await upgradeSkills({
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    const content = await readFile(skillPathFor('.claude'), 'utf-8');
    expect(content).toBe('# v2');
  });

  it('upgrades Codex skill when it exists and differs', async () => {
    await setup();
    await writeSkillSource('# v2');
    await installSkillFor('.codex', '# v1');

    await upgradeSkills({
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    const content = await readFile(skillPathFor('.codex'), 'utf-8');
    expect(content).toBe('# v2');
  });

  it('skips when already identical', async () => {
    await setup();
    await writeSkillSource('# same');
    await installSkillFor('.claude', '# same');

    await upgradeSkills({
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    const content = await readFile(skillPathFor('.claude'), 'utf-8');
    expect(content).toBe('# same');
  });

  it('upgrades both assistants when both have outdated skills', async () => {
    await setup();
    await writeSkillSource('# v2');
    await installSkillFor('.claude', '# v1');
    await installSkillFor('.codex', '# v1');

    await upgradeSkills({
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    expect(await readFile(skillPathFor('.claude'), 'utf-8')).toBe('# v2');
    expect(await readFile(skillPathFor('.codex'), 'utf-8')).toBe('# v2');
  });

  it('does not create skill for assistant that never opted in', async () => {
    await setup();
    await writeSkillSource('# v2');
    // .claude dir exists but no skill installed — user never opted in
    await mkdir(join(homeDir(), '.claude'), { recursive: true });
    // .codex has skill installed — user opted in
    await installSkillFor('.codex', '# v1');

    await upgradeSkills({
      homeDir: homeDir(),
      skillSourcePath: skillSource(),
    });

    const { access } = await import('node:fs/promises');
    await expect(access(skillPathFor('.claude'))).rejects.toThrow();
    expect(await readFile(skillPathFor('.codex'), 'utf-8')).toBe('# v2');
  });
});
