// deploy/__tests__/databaseLayer.test.ts
//
// The self-hosted database layer: supabase/postgres + PostgREST + Realtime,
// routed through nginx-proxy at /rest/v1/ and /realtime/v1/. A mistake in any
// of the three config files (proxy.conf, docker-compose.yml, install.sh) fails
// silently at install time — the app starts, the tracker page loads, but
// supabase-js gets 404s from /rest/v1/ and presence never connects. These
// tests parse the config files as text to pin the invariants that matter.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { load as loadYaml } from 'js-yaml';

const REPO_ROOT = join(__dirname, '..', '..');

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

const PROXY_CONF = read('deploy/nginx/proxy.conf');
const COMPOSE_TEXT = read('docker-compose.yml');
const COMPOSE = loadYaml(COMPOSE_TEXT) as {
  services: Record<string, Record<string, unknown>>;
  volumes: Record<string, unknown>;
};
const INSTALL_SH = read('install.sh');

function withoutComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');
}

const PROXY_CODE = withoutComments(PROXY_CONF);

// ─── proxy.conf — /rest/v1/ and /realtime/v1/ ─────────────────────────────

describe('deploy/nginx/proxy.conf — database layer routes', () => {
  it('routes /rest/v1/ to the rest service with variable-based upstream resolution', () => {
    // The rest location must use a resolver + variable pattern so nginx starts
    // even when the rest container is down (same pattern as /api/capture/local
    // in app.conf).
    expect(PROXY_CODE).toContain('location /rest/v1/ {');
    expect(PROXY_CODE).toContain('resolver 127.0.0.11');
    expect(PROXY_CODE).toContain('set $rest_upstream http://rest:3000;');
    // A variable in proxy_pass disables prefix replacement, so the prefix
    // must be stripped by a rewrite. Without it every request reached
    // PostgREST as "/" (found live: reads returned the OpenAPI document).
    expect(PROXY_CODE).toContain('rewrite ^/rest/v1/(.*)$ /$1 break;');
    expect(PROXY_CODE).toMatch(/proxy_pass\s+\$rest_upstream;/);
  });

  it('routes /realtime/v1/ to the realtime service with the realtime-dev Host header', () => {
    // The realtime service derives its tenant from the Host header. nginx must
    // send `Host: realtime-dev` to select the seeded tenant.
    expect(PROXY_CODE).toContain('location /realtime/v1/ {');
    expect(PROXY_CODE).toContain('set $realtime_upstream http://realtime:4000;');
    expect(PROXY_CODE).toContain('proxy_set_header   Host              realtime-dev;');
    expect(PROXY_CODE).toContain('rewrite ^/realtime/v1/(.*)$ /socket/$1 break;');
    expect(PROXY_CODE).toMatch(/proxy_pass\s+\$realtime_upstream;/);
  });

  it('includes WebSocket upgrade headers for the realtime location', () => {
    // Without Upgrade and Connection headers, the WebSocket handshake fails and
    // the app falls back to 5s polling — which works but defeats the purpose of
    // running Realtime at all.
    const realtimeIdx = PROXY_CODE.indexOf('location /realtime/v1/ {');
    expect(realtimeIdx).toBeGreaterThan(0);
    // Find the closing brace of this location block
    let depth = 0;
    let blockEnd = -1;
    for (let i = PROXY_CODE.indexOf('{', realtimeIdx); i < PROXY_CODE.length; i++) {
      if (PROXY_CODE[i] === '{') depth++;
      else if (PROXY_CODE[i] === '}') {
        depth--;
        if (depth === 0) {
          blockEnd = i;
          break;
        }
      }
    }
    expect(blockEnd).toBeGreaterThan(realtimeIdx);
    const realtimeBlock = PROXY_CODE.slice(realtimeIdx, blockEnd);
    expect(realtimeBlock).toContain('proxy_set_header   Upgrade');
    expect(realtimeBlock).toContain('proxy_set_header   Connection');
    expect(realtimeBlock).toContain('proxy_read_timeout  3600s');
  });

  it('places both locations ABOVE the catch-all / location', () => {
    const restAt = PROXY_CODE.indexOf('location /rest/v1/ {');
    const realtimeAt = PROXY_CODE.indexOf('location /realtime/v1/ {');
    // Find the final `location / {` (the catch-all, not /rest/ or /realtime/)
    const catchAllAt = PROXY_CODE.lastIndexOf('location / {');
    expect(restAt).toBeGreaterThan(0);
    expect(realtimeAt).toBeGreaterThan(0);
    expect(catchAllAt).toBeGreaterThan(0);
    expect(restAt).toBeLessThan(catchAllAt);
    expect(realtimeAt).toBeLessThan(catchAllAt);
  });
});

// ─── docker-compose.yml — db, rest, realtime services ──────────────────────

describe('docker-compose.yml — database layer services', () => {
  it('has db, rest, and realtime services', () => {
    expect(COMPOSE.services.db).toBeDefined();
    expect(COMPOSE.services.rest).toBeDefined();
    expect(COMPOSE.services.realtime).toBeDefined();
  });

  it('uses pinned image tags with overridable defaults', () => {
    const dbImage = COMPOSE.services.db.image as string;
    const restImage = COMPOSE.services.rest.image as string;
    const realtimeImage = COMPOSE.services.realtime.image as string;
    expect(dbImage).toMatch(/supabase\/postgres:\$\{SUPABASE_POSTGRES_IMAGE_TAG:-/);
    expect(restImage).toMatch(/postgrest\/postgrest:\$\{POSTGREST_IMAGE_TAG:-/);
    expect(realtimeImage).toMatch(/supabase\/realtime:\$\{REALTIME_IMAGE_TAG:-/);
  });

  it('publishes no ports on any of the three services', () => {
    expect(COMPOSE.services.db.ports).toBeUndefined();
    expect(COMPOSE.services.rest.ports).toBeUndefined();
    expect(COMPOSE.services.realtime.ports).toBeUndefined();
  });

  it('puts db only on the backend network', () => {
    const dbNetworks = COMPOSE.services.db.networks as string[];
    expect(dbNetworks).toContain('backend');
    expect(dbNetworks).not.toContain('edge');
  });

  it('puts rest and realtime on both backend and edge networks', () => {
    const restNetworks = COMPOSE.services.rest.networks as string[];
    const realtimeNetworks = COMPOSE.services.realtime.networks as string[];
    expect(restNetworks).toContain('backend');
    expect(restNetworks).toContain('edge');
    expect(realtimeNetworks).toContain('backend');
    expect(realtimeNetworks).toContain('edge');
  });

  it('mounts the schema file after 99-realtime.sql (alphabetical sort)', () => {
    // The schema's DO block adds review_curations to the supabase_realtime
    // publication, which must exist first. 99-realtime.sql creates it; the
    // schema mount sorts after it because 'zz' > 'realtime' alphabetically.
    const dbVolumes = COMPOSE.services.db.volumes as string[];
    const schemaMount = dbVolumes.find((v: string) =>
      v.includes('99-zz-viewpoint-schema.sql'),
    );
    const realtimeMount = dbVolumes.find((v: string) =>
      v.includes('99-realtime.sql') && !v.includes('zz'),
    );
    expect(schemaMount).toBeDefined();
    expect(realtimeMount).toBeDefined();
  });

  it('has the supabase-db-data volume declared (and the old postgres-data kept)', () => {
    expect(COMPOSE.volumes['supabase-db-data']).toBeDefined();
    expect(COMPOSE.volumes['postgres-data']).toBeDefined();
    expect(COMPOSE.volumes['db-config']).toBeDefined();
    // The old postgres-data volume should have a comment about being unused.
    expect(COMPOSE_TEXT).toMatch(/# Unused[^\n]*\n(\s*#[^\n]*\n)*\s*postgres-data:/);
  });

  it('does not have a `postgres` service anymore', () => {
    expect(COMPOSE.services.postgres).toBeUndefined();
  });

  it('rest depends_on db healthy', () => {
    const restDeps = COMPOSE.services.rest.depends_on as Record<string, unknown>;
    expect(restDeps.db).toBeDefined();
    expect((restDeps.db as Record<string, string>).condition).toBe('service_healthy');
  });

  it('realtime depends_on db healthy', () => {
    const realtimeDeps = COMPOSE.services.realtime.depends_on as Record<
      string,
      unknown
    >;
    expect(realtimeDeps.db).toBeDefined();
    expect((realtimeDeps.db as Record<string, string>).condition).toBe(
      'service_healthy',
    );
  });

  it('nginx-proxy does NOT depend on db, rest, or realtime', () => {
    // nginx-proxy must start even when the db layer is broken.
    const proxyDeps = COMPOSE.services['nginx-proxy'].depends_on as string[];
    expect(proxyDeps).not.toContain('db');
    expect(proxyDeps).not.toContain('rest');
    expect(proxyDeps).not.toContain('realtime');
  });
});

// ─── install.sh — mint_anon_jwt ────────────────────────────────────────────

describe('install.sh — mint_anon_jwt', () => {
  function extractAndRun(secret: string): string {
    // Extract the mint_anon_jwt function from install.sh and call it.
    const match = /mint_anon_jwt\(\)\s*\{[\s\S]*?\n\}/.exec(INSTALL_SH);
    if (!match) throw new Error('mint_anon_jwt function not found in install.sh');
    const funcBody = match[0];
    const script = `set -euo pipefail\n${funcBody}\nmint_anon_jwt "${secret}"`;
    return execFileSync('bash', ['-c', script], { encoding: 'utf8' }).trim();
  }

  it('produces a three-part JWT (header.payload.signature)', () => {
    const jwt = extractAndRun('test-secret-key');
    const parts = jwt.split('.');
    expect(parts.length).toBe(3);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('has the correct JWT header (alg: HS256, typ: JWT)', () => {
    const jwt = extractAndRun('test-secret-key');
    const headerB64 = jwt.split('.')[0];
    // base64url → base64 → decode
    const headerJson = Buffer.from(
      headerB64.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8');
    const header = JSON.parse(headerJson);
    expect(header.alg).toBe('HS256');
    expect(header.typ).toBe('JWT');
  });

  it('has role=anon in the payload', () => {
    const jwt = extractAndRun('test-secret-key');
    const payloadB64 = jwt.split('.')[1];
    const payloadJson = Buffer.from(
      payloadB64.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8');
    const payload = JSON.parse(payloadJson);
    expect(payload.role).toBe('anon');
    expect(payload.iss).toBe('supabase');
    expect(payload.iat).toBeTypeOf('number');
    expect(payload.exp).toBeTypeOf('number');
    // 10-year expiry
    expect(payload.exp - payload.iat).toBe(315360000);
  });

  it('has a valid HS256 signature verifiable with the secret', () => {
    const secret = 'my-test-jwt-secret-for-verification';
    const jwt = extractAndRun(secret);
    const parts = jwt.split('.');
    const signingInput = `${parts[0]}.${parts[1]}`;
    const expectedSig = createHmac('sha256', secret)
      .update(signingInput)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(parts[2]).toBe(expectedSig);
  });
});

// ─── install.sh — BASH_SOURCE guard ────────────────────────────────────────

describe('install.sh — sourceable for testing', () => {
  it('has a BASH_SOURCE guard around main', () => {
    expect(INSTALL_SH).toContain('BASH_SOURCE[0]');
    expect(INSTALL_SH).toMatch(
      /if\s+\[\[\s+"\$\{BASH_SOURCE\[0\]\}"\s*==\s*"\$0"\s*\]\]/,
    );
  });
});
