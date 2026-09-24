// @vitest-environment node
//
// The `supabase` provider. It will not be run against a live project in CI, so
// what these tests are really pinning is the CONTRACT: the routes and headers
// Supabase Storage expects, the two status codes that mean "no such object",
// and — above all — that the service-role key never appears anywhere a caller
// or a log reader could pick it up.

import { describe, expect, it, vi } from 'vitest';
import { SupabaseModelStore } from '../supabaseModelStore.ts';
import { sha256Hex } from '../hash.ts';

const SERVICE_ROLE_KEY = 'eyJ-role-secret-do-not-leak';
const PROJECT_URL = 'https://proj.supabase.co';
const BUCKET = 'review-models';
const OBJECT_PREFIX = `${PROJECT_URL}/storage/v1/object/${BUCKET}/`;

const BYTES = new Uint8Array([0x53, 0x54, 0x45, 0x50, 0x3b, 0x0a, 0x00, 0x01]);
const HASH = sha256Hex(BYTES);
const META = {
  fileName: 'bracket.step',
  contentType: 'model/step',
  uploadedAt: '2026-09-24T09:00:00.000Z',
};

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Buffer | null;
}

/**
 * Supabase Storage as a map of objects behind its REST routes.
 *
 * A missing object answers 400 with `Object not found`, which is what the real
 * download route does and why the store treats 400 as "absent" rather than as a
 * failure. `failEveryRequestWith` swaps in a flat status for the error paths.
 */
function fakeStorage() {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const calls: Recorded[] = [];
  let failure: number | null = null;

  const fetchFn = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const rawHeaders = (init?.headers ?? {}) as Record<string, string>;
      calls.push({
        url,
        method: init?.method ?? 'GET',
        headers: { ...rawHeaders },
        body: init?.body ? Buffer.from(init.body as Uint8Array) : null,
      });

      if (failure !== null) {
        return new Response(JSON.stringify({ message: 'internal' }), { status: failure });
      }

      const path = url.slice(OBJECT_PREFIX.length);
      if ((init?.method ?? 'GET') === 'POST') {
        objects.set(path, {
          body: Buffer.from(init?.body as Uint8Array),
          contentType: rawHeaders['Content-Type'] ?? 'application/octet-stream',
        });
        return new Response(JSON.stringify({ Key: path }), { status: 200 });
      }

      const found = objects.get(path);
      if (!found) {
        return new Response(
          JSON.stringify({ statusCode: '400', error: 'Not found', message: 'Object not found' }),
          { status: 400 },
        );
      }
      return new Response(found.body, {
        status: 200,
        headers: { 'Content-Type': found.contentType },
      });
    },
  );

  return {
    fetchFn,
    calls,
    objects,
    failEveryRequestWith: (status: number | null) => {
      failure = status;
    },
  };
}

function makeStore(storage = fakeStorage()) {
  return {
    storage,
    store: new SupabaseModelStore({
      url: PROJECT_URL,
      bucket: BUCKET,
      serviceRoleKey: SERVICE_ROLE_KEY,
      fetchFn: storage.fetchFn,
    }),
  };
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('SupabaseModelStore.put', () => {
  it('uploads the sidecar and then the object, and reports the hash', async () => {
    const { storage, store } = makeStore();
    const ref = await store.put(BYTES, META);

    expect(ref).toEqual({ hash: HASH, size: BYTES.byteLength });
    expect(storage.calls.map((c) => c.url)).toEqual([
      `${OBJECT_PREFIX}${HASH}.json`,
      `${OBJECT_PREFIX}${HASH}`,
    ]);
    expect(storage.calls.map((c) => c.method)).toEqual(['POST', 'POST']);
    // Upsert: a content address cannot collide with different bytes, so the
    // second upload of a revision three people imported is one object.
    expect(storage.calls.every((c) => c.headers['x-upsert'] === 'true')).toBe(true);
    expect(storage.calls[0]?.headers['Content-Type']).toBe('application/json');
    expect(storage.calls[1]?.headers['Content-Type']).toBe('model/step');
    expect(storage.objects.get(HASH)?.body).toEqual(Buffer.from(BYTES));
    expect(JSON.parse(storage.objects.get(`${HASH}.json`)?.body.toString('utf8') ?? 'null')).toEqual(
      { ...META, size: BYTES.byteLength },
    );
  });

  it('sends the service-role key as both bearer and apikey', async () => {
    const { storage, store } = makeStore();
    await store.put(BYTES, META);
    for (const call of storage.calls) {
      expect(call.headers['Authorization']).toBe(`Bearer ${SERVICE_ROLE_KEY}`);
      // Storage checks apikey first; a request with only the bearer is a 401.
      expect(call.headers['apikey']).toBe(SERVICE_ROLE_KEY);
    }
  });

  it('throws on a failed upload, and the message quotes a status, not the key', async () => {
    const { storage, store } = makeStore();
    storage.failEveryRequestWith(500);
    const message = await store.put(BYTES, META).then(
      () => '',
      (err: Error) => err.message,
    );
    expect(message).toMatch(/supabase storage upload failed/);
    expect(message).toContain('HTTP 500');
    expect(message).not.toContain(SERVICE_ROLE_KEY);
  });
});

describe('SupabaseModelStore.get / head', () => {
  it('round-trips the bytes as a stream, and the metadata', async () => {
    const { store } = makeStore();
    await store.put(BYTES, META);
    const stream = await store.get(HASH);
    expect(stream).not.toBeNull();
    expect(await readAll(stream!)).toEqual(Buffer.from(BYTES));
    expect(await store.head(HASH)).toEqual({ ...META, size: BYTES.byteLength });
  });

  it('answers null for an object nobody stored, on both 400 and 404', async () => {
    const { store } = makeStore();
    expect(await store.get(HASH)).toBeNull();
    expect(await store.head(HASH)).toBeNull();
  });

  it('refuses a value that is not a hash, without making a request', async () => {
    const { storage, store } = makeStore();
    for (const bad of ['../etc/passwd', HASH.toUpperCase(), HASH.slice(1), '']) {
      expect(await store.get(bad)).toBeNull();
      expect(await store.head(bad)).toBeNull();
    }
    expect(storage.fetchFn).not.toHaveBeenCalled();
  });

  it('throws on a server error rather than reporting the object absent', async () => {
    const { storage, store } = makeStore();
    await store.put(BYTES, META);
    storage.failEveryRequestWith(503);
    await expect(store.get(HASH)).rejects.toThrow(/HTTP 503/);
    await expect(store.head(HASH)).rejects.toThrow(/HTTP 503/);
  });
});

describe('SupabaseModelStore — the service-role key stays server-side', () => {
  it('never appears in a URL', async () => {
    const { storage, store } = makeStore();
    await store.put(BYTES, META);
    await store.get(HASH);
    await store.head(HASH);
    for (const call of storage.calls) {
      expect(call.url).not.toContain(SERVICE_ROLE_KEY);
      expect(call.url).not.toContain(encodeURIComponent(SERVICE_ROLE_KEY));
    }
  });

  it('never appears in an error message', async () => {
    const { storage, store } = makeStore();
    storage.failEveryRequestWith(403);
    const messages: string[] = [];
    for (const attempt of [
      () => store.put(BYTES, META),
      () => store.get(HASH).then((s) => s && readAll(s)),
      () => store.head(HASH),
    ]) {
      try {
        await attempt();
      } catch (err) {
        messages.push((err as Error).message);
      }
    }
    expect(messages.length).toBe(3);
    for (const message of messages) {
      expect(message).not.toContain(SERVICE_ROLE_KEY);
      expect(message).not.toContain('internal');
    }
  });
});
