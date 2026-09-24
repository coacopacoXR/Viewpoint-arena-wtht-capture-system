// @vitest-environment node
//
// The default provider, and the one the Docker install actually runs. What is
// worth a red test here is not that a file gets written — it is the three
// properties a room full of people depends on and that fail silently:
//
//   1. a reader that arrives MID-WRITE must never see a partial object, which
//      is what the temp-file-plus-rename is for;
//   2. putting the same bytes twice must not rewrite, or three browsers
//      uploading one revision would each churn 200 MB of disk;
//   3. a hash-shaped string is the ONLY thing that decides a path, so a
//      traversal attempt cannot escape the directory even if a caller forgets
//      to validate it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalModelStore } from '../localModelStore.ts';
import { sha256Hex } from '../hash.ts';

// `renameSync` is swapped for a spy so one test can make the second half of an
// atomic write fail and then look at what the first half left behind.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

const BYTES = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
const HASH = sha256Hex(BYTES);
const META = {
  fileName: 'bracket.glb',
  contentType: 'model/gltf-binary',
  uploadedAt: '2026-09-24T09:00:00.000Z',
};

let dir: string;
let store: LocalModelStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vp-models-'));
  store = new LocalModelStore(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Every entry in the directory, so "no leftovers" is a real assertion. */
function entries(): string[] {
  return readdirSync(dir).sort();
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/**
 * Whether the object is there, for the tests that assert presence rather than
 * contents. `createReadStream` opens lazily, so a stream nobody reads and
 * nobody destroys reports ENOENT as an unhandled 'error' once afterEach has
 * removed the directory.
 */
async function isPresent(hash: string): Promise<boolean> {
  const stream = await store.get(hash);
  if (!stream) return false;
  stream.on('error', () => {});
  stream.destroy();
  return true;
}

describe('LocalModelStore.put', () => {
  it('stores the bytes under their own sha256, and says what it stored', async () => {
    const ref = await store.put(BYTES, META);
    expect(ref).toEqual({ hash: HASH, size: BYTES.byteLength });
    expect(readFileSync(join(dir, HASH))).toEqual(Buffer.from(BYTES));
  });

  it('creates the directory when it does not exist yet', async () => {
    const nested = new LocalModelStore(join(dir, 'models', 'deep'));
    await nested.put(BYTES, META);
    expect(existsSync(join(dir, 'models', 'deep', HASH))).toBe(true);
  });

  it('writes a sidecar naming the file, its size, type and upload time', async () => {
    await store.put(BYTES, META);
    expect(JSON.parse(readFileSync(join(dir, `${HASH}.json`), 'utf8'))).toEqual({
      fileName: 'bracket.glb',
      size: BYTES.byteLength,
      contentType: 'model/gltf-binary',
      uploadedAt: '2026-09-24T09:00:00.000Z',
    });
  });

  it('records the length of the bytes, not a size the caller claimed', async () => {
    await store.put(BYTES, { ...META, fileName: 'lies.glb' });
    const head = await store.head(HASH);
    // The hash was computed over these bytes, so they are the only authority on
    // how long they are; a Content-Length built from a caller's number would be
    // one the object itself contradicts.
    expect(head?.size).toBe(BYTES.byteLength);
  });

  it('is idempotent: the same bytes a second time rewrite nothing', async () => {
    await store.put(BYTES, META);
    // Push the object's mtime into the past, so a rewrite would be visible.
    const past = new Date(Date.now() - 60_000);
    utimesSync(join(dir, HASH), past, past);
    utimesSync(join(dir, `${HASH}.json`), past, past);
    const fs = await import('node:fs');
    vi.mocked(fs.renameSync).mockClear();

    const again = await store.put(BYTES, { ...META, fileName: 'renamed-by-someone.glb' });

    expect(again).toEqual({ hash: HASH, size: BYTES.byteLength });
    expect(vi.mocked(fs.renameSync)).not.toHaveBeenCalled();
    const head = await store.head(HASH);
    expect(head?.fileName, 'the first upload is the record').toBe('bracket.glb');
  });

  it('leaves no object and no temp file when the write cannot be finished', async () => {
    const fs = await import('node:fs');
    // The sidecar is written first, so this is the first rename the put does.
    vi.mocked(fs.renameSync).mockImplementationOnce(() => {
      throw new Error('EXDEV: cross-device link');
    });

    await expect(store.put(BYTES, META)).rejects.toThrow(/EXDEV/);

    // The whole point of writing to a temp first: the destination path never
    // exists in a partial state, so a later `put` of the same hash cannot skip
    // a truncated object as "already stored", and a concurrent reader cannot be
    // handed half a STEP file to parse.
    expect(existsSync(join(dir, HASH))).toBe(false);
    expect(existsSync(join(dir, `${HASH}.json`))).toBe(false);
    // And the temp the failed write did produce is gone with it: nothing else
    // knows its name, so nothing else would ever remove it.
    expect(entries()).toEqual([]);
  });
});

describe('LocalModelStore.get / head', () => {
  it('round-trips the bytes and the metadata', async () => {
    await store.put(BYTES, META);
    const stream = await store.get(HASH);
    expect(stream).not.toBeNull();
    expect(await readAll(stream!)).toEqual(Buffer.from(BYTES));
    expect(await store.head(HASH)).toEqual({ ...META, size: BYTES.byteLength });
  });

  it('answers null for an object that was never stored', async () => {
    expect(await store.get(HASH)).toBeNull();
    expect(await store.head(HASH)).toBeNull();
  });

  it('refuses a hash-shaped string it was not given, whatever the caller did', async () => {
    await store.put(BYTES, META);
    // A path built from any of these would leave `dir`. The store is the last
    // thing standing between a request path and the filesystem.
    for (const bad of [
      '../secret',
      '..%2fsecret',
      `${HASH}/../../secret`,
      HASH.toUpperCase(),
      HASH.slice(0, 63),
      `${HASH}g`,
      '',
    ]) {
      expect(await store.get(bad), bad).toBeNull();
      expect(await store.head(bad), bad).toBeNull();
    }
    expect(entries()).toEqual([HASH, `${HASH}.json`]);
  });

  it('answers null when the sidecar is not JSON, rather than throwing', async () => {
    await store.put(BYTES, META);
    writeFileSync(join(dir, `${HASH}.json`), 'not json at all');
    expect(await store.head(HASH)).toBeNull();
    // The bytes are still servable; only the description is gone.
    expect(await isPresent(HASH)).toBe(true);
  });

  it('answers null when the sidecar is JSON but not metadata', async () => {
    await store.put(BYTES, META);
    writeFileSync(join(dir, `${HASH}.json`), JSON.stringify({ fileName: 'x.glb' }));
    expect(await store.head(HASH)).toBeNull();
  });

  it('treats bytes with no sidecar as absent from head, present for get', async () => {
    // The state a crash between the two writes leaves. `head` answering null is
    // what makes the api return 404 instead of serving a file it cannot name.
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, HASH), Buffer.from(BYTES));
    expect(await store.head(HASH)).toBeNull();
    expect(await isPresent(HASH)).toBe(true);
  });
});
