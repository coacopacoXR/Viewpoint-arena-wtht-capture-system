// @vitest-environment node
//
// The partykit container's CMD once passed `--host` and `--no-open`, neither of
// which `partykit dev` accepts, so the CLI exited with "unknown option" and the
// container could never start. Nothing noticed: no test runs the image and
// Docker is not available everywhere this suite runs. This pins every flag in
// the CMD to the installed CLI's own --help.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');

function cmdArgs(): string[] {
  const dockerfile = readFileSync(join(repoRoot, 'deploy/partykit.Dockerfile'), 'utf8');
  const line = dockerfile.split(/\r?\n/).find((l) => l.startsWith('CMD '));
  if (!line) throw new Error('deploy/partykit.Dockerfile has no CMD line');
  return JSON.parse(line.slice(4)) as string[];
}

function devHelp(): string {
  const bin = join(repoRoot, 'node_modules/partykit/dist/bin.mjs');
  return execFileSync(process.execPath, [bin, 'dev', '--help'], { encoding: 'utf8' });
}

describe('deploy/partykit.Dockerfile CMD', () => {
  it('runs `partykit dev`', () => {
    const args = cmdArgs();
    expect(args.slice(0, 4)).toEqual(['npx', '--no-install', 'partykit', 'dev']);
  });

  it('uses only flags the installed partykit dev accepts', () => {
    const help = devHelp();
    const flags = cmdArgs().filter((a) => a.startsWith('-'));
    expect(flags.length).toBeGreaterThan(0);
    for (const flag of flags) {
      if (flag === '--no-install') continue; // npx's own flag, not partykit's
      expect(help, `partykit dev does not accept ${flag}`).toMatch(
        new RegExp(`(^|[\\s,])${flag}(?=[\\s,<]|$)`, 'm'),
      );
    }
  }, 30_000);
});
