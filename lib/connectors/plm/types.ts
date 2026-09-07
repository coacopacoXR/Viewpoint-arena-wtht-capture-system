// PLM adapter interface — see docs/plan/02-connector-adapters.md §1.
//
// Every PLM implementation (Onshape, Teamcenter, custom) implements this
// interface. A shared contract test suite (plm.contract.test.ts) asserts
// the behavioural guarantees so any implementation — ours or a corp's —
// can be verified against the same checks.

export interface PLMDocumentRef {
  id: string;
  workspaceId?: string;
  elementId?: string;
}

export interface PLMElement {
  id: string;
  name: string;
  type: string;
}

/**
 * Opaque session reference passed to every adapter method.
 *
 * Must never contain a raw credential (password, API key, OAuth token).
 * Implementations map this to whatever server-side state they need to
 * authenticate upstream calls (e.g. a session ID that resolves to an
 * HttpOnly-cookie jar on the server).
 */
export interface PLMAuthContext {
  sessionRef: string;
}

export interface PLMAdapter {
  /** OAuth/SSO entry point — redirect URL or auth-start handler name. */
  authStartPath: string;

  listDocuments(auth: PLMAuthContext): Promise<PLMDocumentRef[]>;

  getElement(auth: PLMAuthContext, ref: PLMDocumentRef): Promise<PLMElement>;

  exportGeometry(
    auth: PLMAuthContext,
    ref: PLMDocumentRef,
    format: 'gltf',
  ): Promise<Blob>;

  /** Resolves a deep-link launched FROM the PLM system into a room context. */
  resolveLaunchContext(
    query: Record<string, string>,
  ): Promise<{ roomHint: string; doc: PLMDocumentRef } | null>;
}
