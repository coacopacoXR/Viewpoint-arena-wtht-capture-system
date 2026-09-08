// Credential-isolation tests for the AI capture providers (T4.5/T4.6).
//
// The rule from docs/plan/02-connector-adapters.md §2 is absolute: "API key
// server-side only … never call these directly from the browser with a key".
// The runtime tests assert what the providers SEND; these assert what the
// browser-reachable modules CONTAIN, so a future contributor cannot add a key
// parameter, an env read or an Authorization header without a red test.
//
// Same approach as lib/connectors/turn/__tests__/turn-bundle.test.ts and
// lib/connectors/plm/teamcenter.security.test.ts: scan committed source.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Modules the Vite client bundle can reach. None of them may touch a key. */
const BROWSER_MODULES = [
  'lib/connectors/capture/types.ts',
  'lib/connectors/capture/mock.ts',
  'lib/connectors/capture/extractionPrompt.ts',
  'lib/connectors/capture/parseInsightCards.ts',
  'lib/connectors/capture/extractClient.ts',
  'lib/connectors/capture/openai.ts',
  'lib/connectors/capture/anthropic.ts',
  'lib/connectors/capture/ollamaDirect.ts',
];

/** The one module allowed to hold the key. */
const SERVER_MODULE = 'api/capture/extract.ts';

function read(relativePath: string): string {
  return readFileSync(join(__dirname, '..', '..', '..', relativePath), 'utf8');
}

/**
 * Removes comments before scanning: these modules deliberately SAY "no apiKey
 * option", "no process.env", and naming the pattern in prose is the point of
 * the comment. Only code should be able to fail these assertions.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // The [^:] guard keeps `https://…` inside string literals from matching.
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('capture credential isolation — browser modules', () => {
  it.each(BROWSER_MODULES)('%s never reads an environment variable', (file) => {
    const source = code(read(file));
    expect(source).not.toMatch(/process\s*\.\s*env/);
    expect(source).not.toMatch(/import\s*\.\s*meta\s*\.\s*env/);
  });

  it.each(BROWSER_MODULES)('%s never mentions an API key', (file) => {
    const source = code(read(file));
    // Identifier spellings only. The English phrase "API key" is allowed —
    // these modules have to be able to SAY "there is no API key here".
    expect(source).not.toMatch(/apiKey|api_key|x-api-key/i);
    expect(source).not.toMatch(/bearer/i);
    expect(source).not.toMatch(/OPENAI_API_KEY|ANTHROPIC_API_KEY/);
  });

  it.each(BROWSER_MODULES)('%s never sets an auth header', (file) => {
    const source = code(read(file));
    expect(source).not.toMatch(/authorization/i);
  });

  it.each(BROWSER_MODULES)('%s never names a VITE_ variable', (file) => {
    // Redundant with scripts/check-public-env.mjs for secret-shaped names, but
    // this catches a plain VITE_ read too, and it fails with the file named.
    expect(code(read(file))).not.toMatch(/VITE_[A-Z0-9_]+/);
  });

  it.each(BROWSER_MODULES)('%s does not import the server-side handler', (file) => {
    const source = code(read(file));
    expect(source).not.toMatch(/from\s+['"][^'"]*\bapi\/capture\//);
    expect(source).not.toMatch(/import\s*\(\s*['"][^'"]*\bapi\/capture\//);
  });

  it('the cloud clients address a same-origin relative endpoint only', () => {
    const client = code(read('lib/connectors/capture/extractClient.ts'));
    expect(client).toContain("'/api/capture/extract'");
    expect(client).not.toMatch(/https:\/\/api\.(openai|anthropic)\.com/);
  });

  it('the two cloud providers contain no vendor URL at all', () => {
    // The browser must not even know which host holds the key.
    for (const file of ['lib/connectors/capture/openai.ts', 'lib/connectors/capture/anthropic.ts']) {
      expect(code(read(file))).not.toMatch(/https?:\/\//);
    }
  });

  it('ollamaDirect has no credential because the mode has none', () => {
    const source = code(read('lib/connectors/capture/ollamaDirect.ts'));
    // It talks straight to the LAN host from config, never through our proxy,
    // so there is no server-side keyholder in this path at all.
    expect(source).not.toContain('/api/capture/extract');
    expect(source).toContain('/api/chat');
  });
});

describe('capture credential isolation — the server module', () => {
  it('reads the key from process.env, which is where it belongs', () => {
    const source = code(read(SERVER_MODULE));
    expect(source).toMatch(/process\.env\[/);
  });

  it('never interpolates the key, the transcript or an error message into a response', () => {
    const source = code(read(SERVER_MODULE));
    // Every statement that writes to the response. Error CODE strings are
    // allowed to contain words like "transcript" (that is what
    // 'invalid_transcript' is); the transcript VARIABLE, the upstream body,
    // the key and any err.message are not. `err.reason` is allowed because it
    // is an enum, while a parser message quotes the model output, which quotes
    // the transcript. The runtime leak tests in extractEndpoint.test.ts assert
    // the same property on actual response bodies.
    const responses = source.match(/\bres\s*\.[^;]*;/g) ?? [];
    expect(responses.length).toBeGreaterThan(10);
    for (const statement of responses) {
      expect(statement).not.toMatch(/apiKey|apiKeyEnv/);
      expect(statement).not.toMatch(/upstreamBody/);
      expect(statement).not.toMatch(/userPrompt/);
      expect(statement).not.toMatch(/\.message/);
      expect(statement).not.toMatch(/\btranscript\b/);
    }
  });

  it('sends the key only in an upstream request header', () => {
    const source = code(read(SERVER_MODULE));
    expect(source).toContain('Authorization: `Bearer ${apiKey}`');
    expect(source).toContain("'x-api-key': apiKey");
  });

  it('redacts the key before anything is logged', () => {
    const source = read(SERVER_MODULE);
    expect(source).toMatch(/redact\(/);
    expect(source).toContain('<redacted>');
  });
});
