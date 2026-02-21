#!/usr/bin/env node

// Suppress MODULE_TYPELESS_PACKAGE_JSON warnings from dynamic import of user config files.
// Two layers: (1) process.emit for older Node, (2) stderr.write for Node 22+ where the
// ESM loader prints the warning directly from C++ without going through JS events.
const _origEmit = process.emit;
// @ts-expect-error -- monkey-patch
process.emit = function (event: string, ...args: any[]) {
  if (event === 'warning' && args[0]?.code === 'MODULE_TYPELESS_PACKAGE_JSON') {
    return false;
  }
  return _origEmit.apply(process, [event, ...args] as any);
};

const _origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function (chunk: any, ...args: any[]) {
  if (typeof chunk === 'string' && chunk.includes('MODULE_TYPELESS_PACKAGE_JSON')) {
    return true;
  }
  return _origStderrWrite(chunk, ...args);
};

import { Command } from 'commander';
import { VERSION } from '../src/version.js';
import { initCommand } from '../src/commands/init.js';
import { generateCommand } from '../src/commands/generate.js';
import { composeCommand } from '../src/commands/compose.js';
import { previewCommand } from '../src/commands/preview.js';
import { configCommand } from '../src/commands/config.js';
import { skillCommand } from '../src/commands/skill.js';

const program = new Command();

program
  .name('screenwright')
  .description('Turn Playwright E2E tests into polished product demo videos')
  .version(VERSION);

program.addCommand(initCommand);
program.addCommand(generateCommand);
program.addCommand(composeCommand);
program.addCommand(previewCommand);
program.addCommand(configCommand);
program.addCommand(skillCommand);

program.parse();
