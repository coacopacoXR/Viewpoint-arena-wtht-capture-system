// The nginx half of local capture (T4.4).
//
// deploy/nginx/app.conf is not code that vitest can execute, and a mistake in it
// fails in the one place nobody is looking: inside a container, at request time,
// during an installation. Three specific mistakes are worth a red test because
// each one is silent until it isn't:
//
//   1. the capture location landing BELOW `location /api/` in the file, where a
//      reader (or a future edit) will assume the 501 block answers it;
//   2. a LITERAL upstream hostname, which makes nginx refuse to start whenever
//      the capture profile is inactive — i.e. on every default install;
//   3. the shared secret hard-coded, or a second ${...} placeholder that
//      envsubst would eat along with nginx's own variables.
//
// The Dockerfile and compose assertions are here for the same reason: the
// template only works if all three files agree.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';

const REPO_ROOT = join(__dirname, '..', '..');

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

interface ComposeService {
  ports?: string[];
  networks?: string[];
  environment?: Record<string, string>;
  build?: { context?: string };
}

const APP_CONF = read('deploy/nginx/app.conf');
const DOCKERFILE = read('deploy/app.Dockerfile');
const COMPOSE_TEXT = read('docker-compose.yml');
const COMPOSE = loadYaml(COMPOSE_TEXT) as { services: Record<string, ComposeService> };

/**
 * nginx has no `#` escapes and nothing in this file puts a `#` inside a string,
 * so stripping comments is a line-prefix operation.
 */
function withoutComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');
}

const APP_CONF_CODE = withoutComments(APP_CONF);

/** The body of a `location` block, matched by brace depth. */
function blockOf(code: string, header: string): string {
  const start = code.indexOf(header);
  expect(start, `no "${header}" block in app.conf`).toBeGreaterThanOrEqual(0);
  const open = code.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces after "${header}"`);
}

const CAPTURE_HEADER = 'location = /api/capture/local {';
const CAPTURE_BLOCK = blockOf(APP_CONF_CODE, CAPTURE_HEADER);

/** Collapses runs of whitespace so directive assertions read naturally. */
function flat(text: string): string {
  return text.replace(/\s+/g, ' ');
}

const CAPTURE_CODE = flat(CAPTURE_BLOCK);

// ─── The location block ─────────────────────────────────────────────────────

describe('deploy/nginx/app.conf — /api/capture/local', () => {
  it('exists, and appears ABOVE the /api/ block that would otherwise answer it', () => {
    const captureAt = APP_CONF_CODE.indexOf(CAPTURE_HEADER);
    const apiAt = APP_CONF_CODE.indexOf('location /api/ {');

    expect(captureAt).toBeGreaterThan(0);
    expect(apiAt).toBeGreaterThan(0);
    // `location = …` wins on nginx's own matching rules regardless of order, but
    // the file is read by people: a capture block buried under the 501 block
    // reads as if /api/* still swallows everything.
    expect(captureAt).toBeLessThan(apiAt);
  });

  it('is POST-only', () => {
    expect(CAPTURE_CODE).toContain('limit_except POST { deny all; }');
  });

  it('resolves the upstream at request time through a VARIABLE, not a literal host', () => {
    // A literal `proxy_pass http://capture-service:8080` is resolved when nginx
    // parses the config, so the app container refuses to start on any install
    // that is not running the capture profile — which is the default.
    expect(CAPTURE_CODE).toContain('resolver 127.0.0.11');
    expect(CAPTURE_CODE).toContain('set $capture_upstream http://capture-service:8080;');
    expect(CAPTURE_CODE).toContain('proxy_pass $capture_upstream/capture;');
    expect(CAPTURE_CODE).not.toMatch(/proxy_pass\s+http:\/\/capture-service/);
  });

  it('names the service and port docker-compose actually uses', () => {
    const service = COMPOSE.services['capture-service'];
    expect(service, 'compose has no capture-service').toBeDefined();
    // The service listens on CAPTURE_PORT inside the container and publishes
    // nothing, so 8080 is the only way to reach it from `app`.
    expect(service.environment?.CAPTURE_PORT).toBe('8080');
    expect(service.ports).toBeUndefined();
    // And the compose service NAME is the DNS name nginx resolves.
    expect(CAPTURE_CODE).toContain('http://capture-service:8080');
  });

  it('adds X-Capture-Token from the environment, not from a literal', () => {
    expect(CAPTURE_CODE).toContain(
      'proxy_set_header X-Capture-Token "${CAPTURE_SHARED_SECRET}";',
    );
    // The header name must match lib/health/probes.ts's CAPTURE_AUTH_HEADER,
    // which capture-service's auth.py is pinned against.
    expect(CAPTURE_CODE).toContain('X-Capture-Token');
  });

  it('allows an upload as large as the service default, and streams it', () => {
    // DEFAULT_MAX_UPLOAD_BYTES in capture-service/capture_service/config.py is
    // 209715200, exactly 200m. nginx must not be the layer that rejects a
    // legitimate recording first.
    const match = /client_max_body_size\s+(\d+)([km]?);/.exec(CAPTURE_CODE);
    expect(match, 'no client_max_body_size in the capture block').not.toBeNull();
    const value = Number(match?.[1]);
    const unit = match?.[2];
    const bytes =
      unit === 'k' ? value * 1024 : unit === 'm' ? value * 1024 * 1024 : value;
    expect(bytes).toBeGreaterThanOrEqual(209_715_200);
    // A 200 MiB body must not be spooled into the app container, which has no
    // volume for it.
    expect(CAPTURE_CODE).toContain('proxy_request_buffering off;');
  });

  it('waits long enough for a transcription plus a local extraction', () => {
    expect(CAPTURE_CODE).toContain('proxy_read_timeout 900s;');
    expect(CAPTURE_CODE).toContain('proxy_send_timeout 900s;');
  });
});

// ─── /api/capture/transcribe (T4.7) ────────────────────────────────────────

const TRANSCRIBE_HEADER = 'location = /api/capture/transcribe {';
const TRANSCRIBE_BLOCK = blockOf(APP_CONF_CODE, TRANSCRIBE_HEADER);
const TRANSCRIBE_CODE = flat(TRANSCRIBE_BLOCK);

describe('deploy/nginx/app.conf — /api/capture/transcribe', () => {
  it('exists, and appears ABOVE the /api/ block', () => {
    const transcribeAt = APP_CONF_CODE.indexOf(TRANSCRIBE_HEADER);
    const apiAt = APP_CONF_CODE.indexOf('location /api/ {');
    expect(transcribeAt).toBeGreaterThan(0);
    expect(transcribeAt).toBeLessThan(apiAt);
  });

  it('appears ABOVE /api/capture/local (both are exact-match, order is for readers)', () => {
    const transcribeAt = APP_CONF_CODE.indexOf(TRANSCRIBE_HEADER);
    const captureAt = APP_CONF_CODE.indexOf(CAPTURE_HEADER);
    expect(transcribeAt).toBeLessThan(captureAt);
  });

  it('is POST-only', () => {
    expect(TRANSCRIBE_CODE).toContain('limit_except POST { deny all; }');
  });

  it('resolves the upstream at request time through a VARIABLE', () => {
    expect(TRANSCRIBE_CODE).toContain('resolver 127.0.0.11');
    expect(TRANSCRIBE_CODE).toContain('proxy_pass $transcribe_upstream/transcribe;');
    expect(TRANSCRIBE_CODE).not.toMatch(/proxy_pass\s+http:\/\/capture-service/);
  });

  it('adds the shared-secret header', () => {
    expect(TRANSCRIBE_CODE).toContain(
      'proxy_set_header X-Capture-Token "${CAPTURE_SHARED_SECRET}";',
    );
  });

  it('has a smaller body limit than /api/capture/local (chunks, not full meetings)', () => {
    const match = /client_max_body_size\s+(\d+)([km]?);/.exec(TRANSCRIBE_CODE);
    expect(match, 'no client_max_body_size in the transcribe block').not.toBeNull();
    const value = Number(match?.[1]);
    const unit = match?.[2];
    const bytes =
      unit === 'k' ? value * 1024 : unit === 'm' ? value * 1024 * 1024 : value;
    // 10m for a chunk; well under the 200m for a full meeting.
    expect(bytes).toBeGreaterThanOrEqual(10 * 1024 * 1024);
    expect(bytes).toBeLessThan(209_715_200);
  });

  it('has shorter timeouts than /api/capture/local (Whisper only, no LLM)', () => {
    expect(TRANSCRIBE_CODE).toContain('proxy_read_timeout 120s;');
    expect(TRANSCRIBE_CODE).toContain('proxy_send_timeout 120s;');
  });
});

// ─── Substitution ───────────────────────────────────────────────────────────

describe('deploy/nginx/app.conf — envsubst surface', () => {
  it('has exactly one placeholder, and it is the capture secret', () => {
    // Matched against the RAW file, comments included: envsubst does not know
    // what a comment is, so every ${...} anywhere in here is substituted.
    const placeholders = APP_CONF.match(/\$\{[^}]*\}/g) ?? [];
    expect(placeholders.length).toBeGreaterThan(0);
    // Every other `${...}` would be substituted too — from an environment
    // variable nobody set, which means an empty string in a directive, which
    // means a config that parses and silently does the wrong thing.
    expect([...new Set(placeholders)]).toEqual(['${CAPTURE_SHARED_SECRET}']);
  });

  it('keeps using nginx runtime variables, which the filter must not eat', () => {
    for (const variable of [
      '$uri',
      '$host',
      '$proxy_add_x_forwarded_for',
      '$http_x_forwarded_proto',
    ]) {
      expect(APP_CONF_CODE).toContain(variable);
    }
  });
});

describe('deploy/app.Dockerfile — the template is rendered at start-up', () => {
  it('installs app.conf as a TEMPLATE, not as a finished conf.d file', () => {
    expect(DOCKERFILE).toContain(
      'COPY deploy/nginx/app.conf /etc/nginx/templates/default.conf.template',
    );
    // A conf.d copy would mean the secret had to be present at BUILD time, i.e.
    // baked into a layer and readable from `docker history`.
    expect(DOCKERFILE).not.toContain(
      'COPY deploy/nginx/app.conf /etc/nginx/conf.d/default.conf',
    );
  });

  it('restricts substitution to CAPTURE_* so nginx variables survive', () => {
    expect(DOCKERFILE).toContain('ENV NGINX_ENVSUBST_FILTER=^CAPTURE_');
  });

  it('defines the secret variable so an unset one cannot reach nginx verbatim', () => {
    // envsubst only substitutes names it was given. An unlisted ${...} arrives
    // at nginx as `${CAPTURE_SHARED_SECRET}`, which nginx reads as an unknown
    // variable and refuses to start. Empty is the valid "authentication off"
    // value; undefined is a broken container.
    expect(DOCKERFILE).toMatch(/ENV\s+CAPTURE_SHARED_SECRET=""/);
  });

  it('removes the base image default site', () => {
    expect(DOCKERFILE).toContain('RUN rm -f /etc/nginx/conf.d/default.conf');
  });
});

describe('docker-compose.yml — the app service is given the secret', () => {
  it('passes CAPTURE_SHARED_SECRET to app, with an empty default', () => {
    const app = COMPOSE.services.app;
    expect(app).toBeDefined();
    // `${VAR:-}` rather than `${VAR:?}`: this file must stay validatable before
    // install.sh has written anything, and an empty value is meaningful.
    expect(app.environment?.CAPTURE_SHARED_SECRET).toBe('${CAPTURE_SHARED_SECRET:-}');
    expect(COMPOSE_TEXT).toContain('CAPTURE_SHARED_SECRET: ${CAPTURE_SHARED_SECRET:-}');
  });

  it('still publishes no port for app or capture-service', () => {
    // The whole isolation argument in the compose header comment rests on this:
    // the browser reaches capture-service through `app`, never directly.
    expect(COMPOSE.services.app.ports).toBeUndefined();
    expect(COMPOSE.services['capture-service'].ports).toBeUndefined();
    expect(COMPOSE.services.whisper.ports).toBeUndefined();
  });

  it('keeps app on the internal backend network where capture-service lives', () => {
    expect(COMPOSE.services.app.networks).toContain('backend');
    expect(COMPOSE.services['capture-service'].networks).toContain('backend');
  });
});

// ─── The access-check subrequest ────────────────────────────────────────────
//
// Both capture locations are held to the front-door password through
// `auth_request /_access_check`. That subrequest broke whole-meeting captures
// the day it landed, in a way no small test caught.

describe('deploy/nginx/app.conf — /_access_check', () => {
  const ACCESS_CHECK = flat(blockOf(APP_CONF_CODE, 'location = /_access_check {'));

  it('does not apply a body-size limit to a body it never forwards', () => {
    // nginx checks the PARENT request's declared size against the SUBREQUEST
    // location's client_max_body_size, and `proxy_pass_request_body off` does
    // not exempt it. With the 1m default, posting a recording gave:
    //   "client intended to send too large body ... subrequest /_access_check"
    //   "auth request unexpected status: 413"
    // which nginx reports to the browser as a 500. Live-transcript chunks are
    // ~200 KB so they kept working, and only longer meetings failed — it read
    // as an intermittent capture bug (found 2026-09-23).
    expect(ACCESS_CHECK).toContain('client_max_body_size 0;');
  });

  it('is internal, and never forwards the request body', () => {
    expect(ACCESS_CHECK).toContain('internal;');
    expect(ACCESS_CHECK).toContain('proxy_pass_request_body off;');
  });

  it('guards both capture endpoints', () => {
    expect(flat(blockOf(APP_CONF_CODE, 'location = /api/capture/local {')))
      .toContain('auth_request /_access_check;');
    expect(flat(blockOf(APP_CONF_CODE, 'location = /api/capture/transcribe {')))
      .toContain('auth_request /_access_check;');
  });
});
