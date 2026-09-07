// Shared PLMAdapter contract test suite.
//
// Any PLMAdapter implementation — MockPLMAdapter, OnshapePLMAdapter (nightly
// with live creds), TeamcenterPLMAdapter (T3.2), or a corp's custom adapter —
// can be run through this suite by calling runPLMContractTests() with a
// setup function that produces the adapter and a valid auth context.
//
// The suite asserts REAL behaviour, not just that methods exist:
//   - return shapes match the interface types
//   - missing documents produce errors
//   - no adapter method accepts or returns a raw credential

import { describe, it, expect } from 'vitest';
import type {
  PLMAdapter,
  PLMAuthContext,
  PLMDocumentRef,
} from './types.ts';
import { MockPLMAdapter } from './mock.ts';

// Field names that must never appear in PLMAuthContext or in adapter return
// values. Covers the credential shapes across all planned PLM providers.
const CREDENTIAL_FIELD_RE =
  /\b(password|passwd|secret|apiKey|api_key|access_token|refresh_token|client_secret|token|credential)\b/i;

function assertNoCredentialFields(obj: unknown, path = 'root'): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj !== 'object') return;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (CREDENTIAL_FIELD_RE.test(key)) {
      throw new Error(
        `Credential field "${key}" found at ${path}.${key} — adapter interface must not expose raw credentials`,
      );
    }
    if (typeof value === 'object' && value !== null) {
      assertNoCredentialFields(value, `${path}.${key}`);
    }
  }
}

function assertNoCredentialValues(obj: unknown, path = 'root'): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string') {
    // Heuristic: flag strings that look like base64/hex tokens (>40 chars,
    // high entropy). Skip short strings and URLs.
    if (obj.length > 40 && !obj.startsWith('http') && !obj.startsWith('/')) {
      const hexLike = /^[0-9a-f]{32,}$/i.test(obj);
      const base64Like = /^[A-Za-z0-9+/=]{32,}$/.test(obj);
      if (hexLike || base64Like) {
        throw new Error(
          `Possible raw credential value at ${path} (length ${obj.length}) — adapter must not return raw credentials`,
        );
      }
    }
    return;
  }
  if (typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => assertNoCredentialValues(item, `${path}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    assertNoCredentialValues(value, `${path}.${key}`);
  }
}

export interface PLMContractSetup {
  adapter: PLMAdapter;
  auth: PLMAuthContext;
  /** A document ref known to NOT exist, for error-path tests. */
  missingRef: PLMDocumentRef;
  /** A document ref known to exist, for happy-path tests. */
  existingRef: PLMDocumentRef;
}

export function runPLMContractTests(
  name: string,
  setup: () => PLMContractSetup | Promise<PLMContractSetup>,
): void {
  describe(`PLMAdapter contract: ${name}`, () => {
    let ctx: PLMContractSetup;

    it('setup produces a valid adapter and auth context', async () => {
      ctx = await setup();
      expect(ctx.adapter).toBeDefined();
      expect(typeof ctx.adapter.authStartPath).toBe('string');
      expect(ctx.adapter.authStartPath.length).toBeGreaterThan(0);
      expect(ctx.auth).toBeDefined();
      expect(typeof ctx.auth.sessionRef).toBe('string');

      // PLMAuthContext must not have credential-shaped fields.
      assertNoCredentialFields(ctx.auth, 'PLMAuthContext');
    });

    it('listDocuments returns an array of PLMDocumentRef with id strings', async () => {
      ctx ??= await setup();
      const docs = await ctx.adapter.listDocuments(ctx.auth);
      expect(Array.isArray(docs)).toBe(true);
      expect(docs.length).toBeGreaterThan(0);
      for (const doc of docs) {
        expect(typeof doc.id).toBe('string');
        expect(doc.id.length).toBeGreaterThan(0);
        if (doc.workspaceId !== undefined) {
          expect(typeof doc.workspaceId).toBe('string');
        }
        if (doc.elementId !== undefined) {
          expect(typeof doc.elementId).toBe('string');
        }
      }
      // No credential fields in the return value.
      assertNoCredentialFields(docs, 'listDocuments.result');
      assertNoCredentialValues(docs, 'listDocuments.result');
    });

    it('getElement returns a PLMElement with id, name, and type', async () => {
      ctx ??= await setup();
      const el = await ctx.adapter.getElement(ctx.auth, ctx.existingRef);
      expect(typeof el.id).toBe('string');
      expect(el.id.length).toBeGreaterThan(0);
      expect(typeof el.name).toBe('string');
      expect(typeof el.type).toBe('string');
      assertNoCredentialFields(el, 'getElement.result');
      assertNoCredentialValues(el, 'getElement.result');
    });

    it('getElement throws on a missing document', async () => {
      ctx ??= await setup();
      await expect(
        ctx.adapter.getElement(ctx.auth, ctx.missingRef),
      ).rejects.toThrow();
    });

    it('exportGeometry returns a Blob for a valid document', async () => {
      ctx ??= await setup();
      const refWithElement = {
        ...ctx.existingRef,
        elementId: ctx.existingRef.elementId || 'mock-elem-1a',
      };
      const blob = await ctx.adapter.exportGeometry(
        ctx.auth,
        refWithElement,
        'gltf',
      );
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('exportGeometry throws on a missing document', async () => {
      ctx ??= await setup();
      await expect(
        ctx.adapter.exportGeometry(ctx.auth, ctx.missingRef, 'gltf'),
      ).rejects.toThrow();
    });

    it('resolveLaunchContext returns null for an unrecognized source', async () => {
      ctx ??= await setup();
      const result = await ctx.adapter.resolveLaunchContext({
        plmSource: 'unknown-system',
        plmDoc: 'whatever',
      });
      expect(result).toBeNull();
    });

    it('resolveLaunchContext does not accept or return credentials', async () => {
      ctx ??= await setup();
      // Even when called with query params that look credential-like, the
      // adapter must not echo them back or leak them in the result.
      const result = await ctx.adapter.resolveLaunchContext({
        plmSource: 'mock',
        plmDoc: 'mock-doc-1',
        token: 'should-not-appear',
        password: 'should-not-appear',
      });
      if (result) {
        assertNoCredentialFields(result, 'resolveLaunchContext.result');
        assertNoCredentialValues(result, 'resolveLaunchContext.result');
      }
    });
  });
}

// Run the contract suite against MockPLMAdapter — this is the regular CI path.
// The Onshape adapter runs through the same suite in the nightly live-adapter
// job (needs sandbox credentials). T3.2's Teamcenter adapter will plug in
// here the same way.
describe('PLMAdapter contract suite', () => {
  runPLMContractTests('MockPLMAdapter', () => ({
    adapter: new MockPLMAdapter(),
    auth: { sessionRef: 'mock-session' },
    missingRef: { id: 'nonexistent-doc-xyz' },
    existingRef: { id: 'mock-doc-1', workspaceId: 'mock-ws-1' },
  }));
});
