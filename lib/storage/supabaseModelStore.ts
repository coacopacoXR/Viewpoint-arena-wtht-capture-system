// The `supabase` model store: a Supabase Storage bucket, reached over the
// Storage REST API with the project's SERVICE-ROLE key.
//
// This is the provider for a hosted deployment (Vercel + Supabase cloud), where
// there is no volume to write to. The service-role key bypasses Row Level
// Security entirely, so it is read from the server environment by
// createModelStore and never leaves this class: it is not in an error message,
// not in a log line, and not in a URL.
//
// Objects are addressed exactly as the local store addresses them — `<hash>`
// with a `<hash>.json` sidecar beside it — so the two providers hold the same
// data and one can be copied into the other without translation.
//
// Upsert rather than create-then-check: the name is a content address, so the
// object an upload would replace is byte-identical to the one it writes, and a
// pre-flight HEAD would double the request count to prove something the hash
// already guarantees.

import { Readable } from 'node:stream';
import { isModelHash, sha256Hex } from './hash.ts';
import { buildSidecar, parseSidecar, sidecarName } from './sidecar.ts';
import type { ModelMeta, ModelRef, ModelStore, ModelUploadMeta } from './modelStore.ts';

export interface SupabaseModelStoreOptions {
  /** Project URL with no trailing slash, e.g. https://xyz.supabase.co. */
  url: string;
  bucket: string;
  /** Service-role key. Server-only — see the header. */
  serviceRoleKey: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

/**
 * Supabase Storage answers a missing object with 400 `Object not found` on the
 * download route and 404 on others, depending on version. Both mean "not here",
 * and treating only one of them that way would make `head` throw for a hash
 * nobody uploaded — a 500 where the api owes a 404.
 */
const ABSENT_STATUSES = new Set([400, 404]);

export class SupabaseModelStore implements ModelStore {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: SupabaseModelStoreOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  /** `/storage/v1/object/<bucket>/<path>`, the route that serves raw bytes. */
  private objectUrl(path: string): string {
    const bucket = encodeURIComponent(this.options.bucket);
    return `${this.options.url}/storage/v1/object/${bucket}/${path}`;
  }

  private headers(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.serviceRoleKey}`,
      // Storage checks `apikey` before it looks at Authorization, so a request
      // with only the bearer is a 401 even when the key is right.
      apikey: this.options.serviceRoleKey,
    };
    if (contentType) headers['Content-Type'] = contentType;
    return headers;
  }

  async put(bytes: Uint8Array, meta: ModelUploadMeta): Promise<ModelRef> {
    const hash = sha256Hex(bytes);
    const size = bytes.byteLength;

    // Sidecar first, for the reason the local store gives: an object with no
    // metadata is a 404 from `head`, and metadata with no object is a 404 from
    // `get`. Either way the api answers "not found" rather than serving a file
    // it cannot describe.
    await this.upload(
      sidecarName(hash),
      Buffer.from(buildSidecar(meta, size), 'utf8'),
      'application/json',
    );
    await this.upload(hash, Buffer.from(bytes), meta.contentType);
    return { hash, size };
  }

  async get(hash: string): Promise<Readable | null> {
    if (!isModelHash(hash)) return null;
    const res = await this.fetchFn(this.objectUrl(hash), { headers: this.headers() });
    if (ABSENT_STATUSES.has(res.status)) return null;
    if (!res.ok) throw this.storageError('download', hash, res.status);
    // Streamed, not buffered: the ceiling on a model file is 200 MB and this is
    // the path that serves it to every client in a room.
    return res.body ? Readable.from(webStreamChunks(res.body)) : null;
  }

  async head(hash: string): Promise<ModelMeta | null> {
    if (!isModelHash(hash)) return null;
    const res = await this.fetchFn(this.objectUrl(sidecarName(hash)), {
      headers: this.headers(),
    });
    if (ABSENT_STATUSES.has(res.status)) return null;
    if (!res.ok) throw this.storageError('metadata', hash, res.status);
    return parseSidecar(await res.text());
  }

  async delete(hash: string): Promise<boolean> {
    if (!isModelHash(hash)) return false;
    const objectRes = await this.fetchFn(this.objectUrl(hash), {
      method: 'DELETE',
      headers: this.headers(),
    });
    const sidecarRes = await this.fetchFn(this.objectUrl(sidecarName(hash)), {
      method: 'DELETE',
      headers: this.headers(),
    });
    // Storage returns 400/404 for a missing object. Either success or absent
    // counts: the admin console called this because references were gone, and
    // a file that was already half-cleaned is not a failure.
    const objectGone = ABSENT_STATUSES.has(objectRes.status);
    const sidecarGone = ABSENT_STATUSES.has(sidecarRes.status);
    if (!objectRes.ok && !objectGone) throw this.storageError('delete', hash, objectRes.status);
    if (!sidecarRes.ok && !sidecarGone) throw this.storageError('delete', sidecarName(hash), sidecarRes.status);
    return !objectGone || !sidecarGone;
  }

  private async upload(path: string, body: Buffer, contentType: string): Promise<void> {
    const res = await this.fetchFn(this.objectUrl(path), {
      method: 'POST',
      headers: { ...this.headers(contentType), 'x-upsert': 'true' },
      body,
    });
    if (!res.ok) throw this.storageError('upload', path, res.status);
  }

  /**
   * Status only. The body and the request headers are both left out on purpose:
   * Storage echoes the bucket and can echo request metadata, and the request
   * carried the service-role key.
   */
  private storageError(what: string, path: string, status: number): Error {
    return new Error(`supabase storage ${what} failed for ${path}: HTTP ${status}`);
  }
}

/**
 * A web ReadableStream as the async iterable `Readable.from` wants.
 *
 * Written out rather than cast: `Readable.fromWeb` takes node:stream/web's
 * ReadableStream, and the one a `fetch` Response carries is the DOM-lib type.
 * They are structurally the same thing and nominally different ones, so the
 * only way across without an `as unknown as` is to read it ourselves — which
// also keeps the conversion honest about backpressure, since `Readable.from`
// pulls.
 */
async function* webStreamChunks(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array, void, undefined> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
