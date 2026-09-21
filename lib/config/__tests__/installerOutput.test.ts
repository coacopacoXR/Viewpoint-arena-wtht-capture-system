import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { configSchema } from '../schema.ts';

// The failure this guards against: install.sh writes a viewpoint.config.ts that
// lib/config/schema.ts then rejects, so the stack refuses to start and the
// operator has no idea why. The installer and the schema are edited by
// different people at different times, and nothing else couples them.
//
// install.sh refuses to run on native Windows by design (it needs Docker and a
// POSIX shell, and tells the user to use WSL), so this runs on Linux and macOS
// — which is what CI is. On Windows it skips rather than pretending to pass.
const RUNS_INSTALLER = process.platform !== 'win32';

describe.skipIf(!RUNS_INSTALLER)('install.sh --defaults output', () => {
  it('writes a viewpoint.config.ts that passes the real zod schema', () => {
    const repoRoot = resolve(__dirname, '../../..');
    const dir = mkdtempSync(join(tmpdir(), 'vp-install-'));
    try {
      execFileSync(
        'bash',
        [
          join(repoRoot, 'install.sh'),
          '--defaults',
          '--configure-only',
          '--dir',
          dir,
          '-y',
        ],
        { stdio: 'pipe' },
      );

      const generated = readFileSync(join(dir, 'viewpoint.config.ts'), 'utf8');

      // The generated file imports defineConfig by a path relative to the
      // deployment directory, which does not resolve from a temp dir. Point it
      // at this repo so the object can actually be evaluated, and validate the
      // real thing rather than a re-typed copy of it.
      const rewritten = generated.replace(
        /from ['"].*schema\.ts['"]/,
        `from '${join(repoRoot, 'lib/config/schema.ts').split('\\').join('/')}'`,
      );
      const probe = join(dir, 'probe.ts');
      writeFileSync(probe, rewritten, 'utf8');

      // Evaluated indirectly: the assertion is that configSchema accepts it.
      const objectLiteral = rewritten.slice(
        rewritten.indexOf('defineConfig(') + 'defineConfig('.length,
        rewritten.lastIndexOf(')'),
      );
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const config = new Function(`return (${objectLiteral});`)() as unknown;

      expect(() => configSchema.parse(config)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a .env alongside it', () => {
    const repoRoot = resolve(__dirname, '../../..');
    const dir = mkdtempSync(join(tmpdir(), 'vp-install-'));
    try {
      execFileSync(
        'bash',
        [join(repoRoot, 'install.sh'), '--defaults', '--configure-only', '--dir', dir, '-y'],
        { stdio: 'pipe' },
      );
      const env = readFileSync(join(dir, '.env'), 'utf8');
      expect(env.length).toBeGreaterThan(0);
      // Every VITE_-prefixed name it writes is inlined into the browser bundle,
      // so each one must be deliberately approved here, otherwise the installer
      // itself could plant a secret in the bundle. The Supabase pair is the
      // documented db exception; VITE_PARTYKIT_HOST is a public hostname the
      // browser must know to open its WebSocket (see deploy/app.Dockerfile).
      const PUBLIC_VITE_NAMES = [
        'VITE_SUPABASE_URL',
        'VITE_SUPABASE_ANON_KEY',
        'VITE_PARTYKIT_HOST',
      ];
      const viteNames = env.match(/^VITE_[A-Z0-9_]+/gm) ?? [];
      for (const name of viteNames) {
        expect(PUBLIC_VITE_NAMES).toContain(name);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
