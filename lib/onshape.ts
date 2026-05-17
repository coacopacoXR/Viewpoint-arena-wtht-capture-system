// Browser-side wrappers for the /api/onshape/* serverless functions.
// All requests use credentials: 'include' so the HTTP-only OAuth cookies
// are sent automatically.

export interface OnshapeUser {
  name?: string;
  email?: string;
  image?: string;
  id?: string;
  [k: string]: any;
}

export interface OnshapeDocument {
  id: string;
  name: string;
  modifiedAt: string;
  createdAt: string;
  thumbnail?: string;
  defaultWorkspaceId?: string;
  defaultWorkspaceName?: string;
}

export interface OnshapeElement {
  id: string;
  name: string;
  type: 'ASSEMBLY' | 'PARTSTUDIO';
  thumbnail?: string;
}

async function api<T>(path: string): Promise<T | { status: number; error: string }> {
  const resp = await fetch(path, { credentials: 'include' });
  if (!resp.ok) {
    let body: any = null;
    try { body = await resp.json(); } catch { /* ignore */ }
    return { status: resp.status, error: body?.error || resp.statusText };
  }
  return (await resp.json()) as T;
}

export async function getCurrentOnshapeUser(): Promise<OnshapeUser | null> {
  const result = await api<OnshapeUser>('/api/onshape/me');
  if ('error' in result) return null;
  return result;
}

/**
 * Like getCurrentOnshapeUser but exposes the failure reason for diagnostic UI.
 * Tagged union so callers can narrow safely on `ok`.
 */
export type OnshapeUserResult =
  | { ok: true; user: OnshapeUser }
  | { ok: false; status: number; error: string };

export async function getCurrentOnshapeUserWithStatus(): Promise<OnshapeUserResult> {
  const result = await api<OnshapeUser>('/api/onshape/me');
  if ('error' in result) return { ok: false as const, status: result.status, error: result.error };
  return { ok: true as const, user: result };
}

export type OnshapeDocFilter = 'recent' | 'mine' | 'shared' | 'public';

const FILTER_VALUES: Record<OnshapeDocFilter, string> = {
  recent: '5',
  mine: '0',
  shared: '2',
  public: '4',
};

export async function listOnshapeDocuments(
  query?: string,
  filter: OnshapeDocFilter = 'recent',
): Promise<{ items: OnshapeDocument[]; error?: string }> {
  const params = new URLSearchParams({ filter: FILTER_VALUES[filter] });
  if (query) params.set('q', query);
  const result = await api<{ items: OnshapeDocument[] }>(`/api/onshape/documents?${params.toString()}`);
  if ('error' in result) return { items: [], error: result.error };
  return { items: result.items };
}

export async function listOnshapeElements(
  documentId: string,
  workspaceId: string,
): Promise<{ items: OnshapeElement[]; allTypes: string[] }> {
  const result = await api<{ items: OnshapeElement[]; allTypes?: string[] }>(
    `/api/onshape/elements?d=${documentId}&w=${workspaceId}`,
  );
  if ('error' in result) return { items: [], allTypes: [] };
  return { items: result.items, allTypes: result.allTypes ?? [] };
}

export async function fetchOnshapeGltf(
  documentId: string,
  workspaceId: string,
  elementId: string,
  type: 'ASSEMBLY' | 'PARTSTUDIO',
): Promise<File> {
  const url = `/api/onshape/gltf?d=${documentId}&w=${workspaceId}&e=${elementId}&type=${type}`;
  const resp = await fetch(url, { credentials: 'include' });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Onshape GLTF fetch failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  const blob = await resp.blob();
  const filename = `onshape-${elementId}.glb`;
  return new File([blob], filename, { type: 'model/gltf-binary' });
}

export function startOnshapeSignIn(returnTo: string = window.location.pathname + window.location.search) {
  const url = `/api/onshape/auth-start?return=${encodeURIComponent(returnTo)}`;
  window.location.href = url;
}

export async function signOutOnshape(): Promise<void> {
  await fetch('/api/onshape/sign-out', { method: 'POST', credentials: 'include' });
}
