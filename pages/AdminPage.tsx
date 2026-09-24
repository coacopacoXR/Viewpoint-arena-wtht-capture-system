// Admin screen — one console with a left section list.
//
// Two authentication modes:
//   - identity.mode 'none': the admin passphrase, exactly as before. The
//     People section is absent. useAdminGate controls access.
//   - identity.mode 'accounts' | 'sso': a signed-in account with the admin
//     role. The passphrase is not used. The user's Supabase access token is
//     sent as Authorization: Bearer to the admin endpoints.
//
// Sections:
//   - People (accounts/sso only) — manage accounts
//   - Reviews — every review, toggle listed, delete
//   - Labels — label field settings
//   - Access — read-only explanation + "Lock this browser"
//   - Activity — audit log
//
// Rooms, Models and AI are not built yet (batches BE, BF). The sidebar leaves
// space for them but does not render placeholder items that do nothing.
//
// First-admin claim: when no admin account exists yet, a signed-in person
// sees "No one administers this install yet. Make me the administrator" —
// one click, checked server-side at the moment of the request.

import React, { useState, useEffect, useCallback } from 'react';
import { useAdminGate } from '../lib/access/useAdminGate.ts';
import { useLabelFieldsStore } from '../lib/labelFieldsStore';
import {
  listAllCurations,
  deleteCuration,
  setCurationListed,
  type CurationSummary,
} from '../lib/curationsRepo';
import { listAuditEvents, type AuditEvent, type AuditListResult } from '../lib/auditRepo';
import AdminUnlockPage from './AdminUnlockPage.tsx';
import LabelFieldsSettings from '../components/UI/LabelFieldsSettings';
import { useConnectorConfig } from '../lib/config/ConfigContext';
import { supabase } from '../lib/supabase';

type Section = 'people' | 'reviews' | 'labels' | 'access' | 'activity';

// ─── Gate logic ──────────────────────────────────────────────────────────────

const AdminPage: React.FC = () => {
  const { config } = useConnectorConfig();
  const mode = config?.identity?.mode ?? 'none';

  if (mode === 'accounts' || mode === 'sso') {
    return <AdminWithAccounts mode={mode} />;
  }

  return <AdminWithPassphrase />;
};

// ─── Passphrase mode (unchanged behaviour) ───────────────────────────────────

const AdminWithPassphrase: React.FC = () => {
  const { required, unlocked, loading } = useAdminGate();

  if (loading) return null;
  if (!required) return <NotConfigured />;
  if (!unlocked) return <AdminUnlockPage />;
  return <AdminContent mode="none" />;
};

// ─── Accounts/SSO mode ───────────────────────────────────────────────────────

const AdminWithAccounts: React.FC<{ mode: 'accounts' | 'sso' }> = ({ mode }) => {
  const [adminCount, setAdminCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const loadAdminCount = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        // Not an admin. Offer the claim only when the install has no admin
        // yet; otherwise say so, instead of a button that can only fail.
        const status = await fetch('/api/admin/claim', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const body = status.ok ? ((await status.json()) as { adminsExist?: boolean }) : null;
        setAdminCount(body && body.adminsExist ? -2 : 0);
        setLoading(false);
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as { users: AdminUser[] };
        const count = data.users.filter((u) => u.role === 'admin').length;
        setAdminCount(count);
      }
    } catch {
      // Endpoint unreachable — stay on the loading state.
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAdminCount();
  }, [loadAdminCount]);

  const handleClaim = async () => {
    setClaiming(true);
    setClaimError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setClaimError('Not signed in.');
        setClaiming(false);
        return;
      }
      const res = await fetch('/api/admin/claim', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        // The admin role lives in the access token's app_metadata, and the
        // token in hand was issued before the claim — without a refresh every
        // admin call is still refused (found live).
        await supabase.auth.refreshSession();
        await loadAdminCount();
      } else if (res.status === 409) {
        setClaimError('An administrator already exists.');
        await loadAdminCount();
      } else {
        setClaimError('Claim failed. Try again.');
      }
    } catch {
      setClaimError('Could not reach the server.');
    }
    setClaiming(false);
  };

  if (loading) return null;

  if (adminCount === -2) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-white text-2xl font-bold">You are not an administrator</h1>
          <p className="text-gray-500 text-sm">
            This install already has an administrator. Ask them to make you one
            in Admin → People.
          </p>
          <a href="/" className="inline-block text-sm text-gray-300 underline">Back to the lobby</a>
        </div>
      </div>
    );
  }

  // No admins yet — show the claim banner.
  if (adminCount === 0) {
    return <ClaimBanner onClaim={handleClaim} claiming={claiming} error={claimError} mode={mode} />;
  }

  return <AdminContent mode={mode} />;
};

// ─── Claim banner ────────────────────────────────────────────────────────────

const ClaimBanner: React.FC<{
  onClaim: () => void;
  claiming: boolean;
  error: string | null;
  mode: 'accounts' | 'sso';
}> = ({ onClaim, claiming, error }) => (
  <div
    className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-6"
    style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
  >
    <div className="w-full max-w-sm space-y-4 text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
          <span className="text-black font-black text-sm">VA</span>
        </div>
        <span className="font-mono text-white text-sm font-bold tracking-widest uppercase">
          Viewpoint Arena
        </span>
      </div>
      <h1 className="text-white text-2xl font-bold">No administrator yet</h1>
      <p className="text-gray-500 text-sm leading-relaxed">
        No one administers this install yet. Whoever clicks the button below
        becomes the administrator — and can then manage accounts from the
        People section.
      </p>
      <button
        onClick={onClaim}
        disabled={claiming}
        className="w-full text-sm font-semibold px-4 py-2.5 rounded-lg bg-white text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {claiming ? 'Claiming…' : 'Make me the administrator'}
      </button>
      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}
    </div>
  </div>
);

// ─── Not configured ──────────────────────────────────────────────────────────

const NotConfigured: React.FC = () => (
  <div
    className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-6"
    style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
  >
    <div className="w-full max-w-sm space-y-4 text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
          <span className="text-black font-black text-sm">VA</span>
        </div>
        <span className="font-mono text-white text-sm font-bold tracking-widest uppercase">
          Viewpoint Arena
        </span>
      </div>
      <h1 className="text-white text-2xl font-bold">Admin not available</h1>
      <p className="text-gray-500 text-sm leading-relaxed">
        The admin passphrase is not set on this deployment. Run{' '}
        <code className="text-gray-400 bg-white/5 px-1.5 py-0.5 rounded text-xs font-mono">
          ./install.sh
        </code>{' '}
        to configure one.
      </p>
    </div>
  </div>
);

// ─── Admin content (sidebar + sections) ──────────────────────────────────────

const AdminContent: React.FC<{ mode: 'none' | 'accounts' | 'sso' }> = ({ mode }) => {
  const { lock } = useAdminGate();
  const [section, setSection] = useState<Section>(mode !== 'none' ? 'people' : 'reviews');
  const [labelSettingsOpen, setLabelSettingsOpen] = useState(false);
  const labelFields = useLabelFieldsStore((s) => s.fields);
  const loadLabelFields = useLabelFieldsStore((s) => s.load);
  const labelFieldsLoaded = useLabelFieldsStore((s) => s.loaded);

  useEffect(() => {
    if (!labelFieldsLoaded) loadLabelFields();
  }, [labelFieldsLoaded, loadLabelFields]);

  const sections: { id: Section; label: string }[] = [
    ...(mode !== 'none' ? [{ id: 'people' as Section, label: 'People' }] : []),
    { id: 'reviews', label: 'Reviews' },
    { id: 'labels', label: 'Labels' },
    { id: 'access', label: 'Access' },
    { id: 'activity', label: 'Activity' },
  ];

  const handleLock = mode === 'none' ? lock : async () => {
    await supabase.auth.signOut();
  };

  return (
    <div
      className="min-h-screen bg-[#0A0A0A] text-white"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-56 border-r border-white/10 flex flex-col">
          <div className="px-4 py-5 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center">
                <span className="text-black font-black text-xs">VA</span>
              </div>
              <span className="font-mono text-white text-xs font-bold tracking-widest uppercase">
                Admin
              </span>
            </div>
          </div>
          <nav className="flex-1 px-2 py-3 space-y-0.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`w-full text-left text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                  section === s.id
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div className="px-2 py-3 border-t border-white/10">
            <button
              onClick={handleLock}
              className="w-full text-left text-[10px] font-mono text-gray-500 hover:text-white transition-colors px-3 py-2"
            >
              {mode === 'none' ? 'Lock this browser' : 'Sign out'}
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 px-8 py-8 max-w-3xl">
          {section === 'people' && mode !== 'none' && <PeopleSection />}
          {section === 'reviews' && <ReviewsSection />}
          {section === 'labels' && (
            <LabelFieldsSection onOpen={() => setLabelSettingsOpen(true)} />
          )}
          {section === 'access' && <AccessSection mode={mode} onLock={handleLock} />}
          {section === 'activity' && <ActivitySection />}
        </main>
      </div>

      {labelSettingsOpen && (
        <LabelFieldsSettings
          fields={labelFields}
          onClose={() => setLabelSettingsOpen(false)}
        />
      )}
    </div>
  );
};

// ─── People section ──────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  last_sign_in_at: string | null;
  disabled: boolean;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function adminFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error('not_signed_in');
  return fetch(path, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
}

const PeopleSection: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/users');
      if (res.status === 401 || res.status === 403) {
        setError('You do not have admin access.');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError('Could not load people.');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { users: AdminUser[] };
      setUsers(data.users);
      setError(null);
    } catch {
      setError('Could not reach the server.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleToggleAdmin = async (user: AdminUser) => {
    const res = await adminFetch(`/api/admin/users?id=${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ admin: user.role !== 'admin' }),
    });
    if (res.ok) {
      await reload();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Operation failed.');
    }
  };

  const handleToggleDisabled = async (user: AdminUser) => {
    const res = await adminFetch(`/api/admin/users?id=${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ disabled: !user.disabled }),
    });
    if (res.ok) {
      await reload();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Operation failed.');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    const res = await adminFetch(`/api/admin/users?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setConfirmDeleteId(null);
      await reload();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Delete failed.');
    }
  };

  if (loading) {
    return <p className="text-gray-600 text-xs">Loading…</p>;
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold font-mono text-gray-400 uppercase tracking-widest">
          People{users.length > 0 ? ` · ${users.length}` : ''}
        </h2>
        <button
          onClick={() => setAddOpen(true)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-gray-900 hover:bg-gray-100 transition-colors"
        >
          Add person
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-xs mb-3">{error}</p>
      )}

      {users.length === 0 ? (
        <p className="text-gray-600 text-xs">No accounts yet.</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {u.name || u.email}
                </p>
                <p className="text-[10px] font-mono text-gray-500 mt-0.5">
                  {u.email} · {u.role === 'admin' ? 'Admin' : 'Member'}
                  {u.disabled ? ' · Disabled' : ''}
                  {u.last_sign_in_at
                    ? ` · Last sign-in ${new Date(u.last_sign_in_at).toLocaleDateString()}`
                    : ' · Never signed in'}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleToggleAdmin(u)}
                  className="text-[10px] font-mono px-2 py-1 rounded border border-white/10 hover:border-white/30 transition-colors"
                >
                  {u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                </button>
                <button
                  onClick={() => handleToggleDisabled(u)}
                  className="text-[10px] font-mono px-2 py-1 rounded border border-white/10 hover:border-white/30 transition-colors"
                >
                  {u.disabled ? 'Enable' : 'Disable'}
                </button>
                {confirmDeleteId === u.id ? (
                  <>
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="text-[10px] font-mono px-2 py-1 rounded bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-[10px] font-mono px-2 py-1 rounded text-gray-500 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleDelete(u.id)}
                    className="text-[10px] font-mono px-2 py-1 rounded text-gray-500 hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && <AddPersonForm onClose={() => setAddOpen(false)} onCreated={reload} />}
    </section>
  );
};

// ─── Add person form ─────────────────────────────────────────────────────────

const AddPersonForm: React.FC<{ onClose: () => void; onCreated: () => void }> = ({
  onClose,
  onCreated,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    if (password !== password2) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim(),
          admin: isAdmin,
        }),
      });
      if (res.ok) {
        onCreated();
        onClose();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not create account.');
      }
    } catch {
      setError('Could not reach the server.');
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
      <div className="w-full max-w-sm bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 space-y-4">
        <h3 className="text-white text-sm font-bold">Add person</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30"
          />
          <input
            type="password"
            placeholder="Temporary password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30"
          />
          <input
            type="password"
            placeholder="Repeat password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            required
            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30"
          />
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              className="rounded border-white/20"
            />
            Make this person an administrator
          </label>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-white text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium px-4 py-2 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Reviews section ─────────────────────────────────────────────────────────

const ReviewsSection: React.FC = () => {
  const [curations, setCurations] = useState<CurationSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await listAllCurations();
    setCurations(list);
    setLoaded(true);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const handleToggleListed = async (c: CurationSummary) => {
    const ok = await setCurationListed(c.id, !c.listed);
    if (ok) {
      setCurations((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, listed: !x.listed } : x)),
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    const ok = await deleteCuration(id);
    if (ok) {
      setCurations((prev) => prev.filter((x) => x.id !== id));
      setConfirmDeleteId(null);
    }
  };

  const cancelDelete = () => setConfirmDeleteId(null);

  return (
    <section>
      <h2 className="text-sm font-bold font-mono text-gray-400 uppercase tracking-widest mb-4">
        Reviews{loaded && curations.length > 0 ? ` · ${curations.length}` : ''}
      </h2>
      {!loaded ? (
        <p className="text-gray-600 text-xs">Loading…</p>
      ) : curations.length === 0 ? (
        <p className="text-gray-600 text-xs">No reviews yet.</p>
      ) : (
        <div className="space-y-2 max-h-[22rem] overflow-y-auto pr-1">
          {curations.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{c.title || 'Untitled'}</p>
                <p className="text-[10px] font-mono text-gray-500 mt-0.5">
                  {new Date(c.updated_at).toLocaleDateString()} · {c.listed ? 'Listed' : 'Link-only'}
                </p>
              </div>
              <button
                onClick={() => handleToggleListed(c)}
                className="text-[10px] font-mono px-2 py-1 rounded border border-white/10 hover:border-white/30 transition-colors flex-shrink-0"
              >
                {c.listed ? 'Make link-only' : 'List in lobby'}
              </button>
              {confirmDeleteId === c.id ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-[10px] font-mono px-2 py-1 rounded bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                  >
                    Confirm delete
                  </button>
                  <button
                    onClick={cancelDelete}
                    className="text-[10px] font-mono px-2 py-1 rounded text-gray-500 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-[10px] font-mono px-2 py-1 rounded text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

// ─── Label fields section ────────────────────────────────────────────────────

const LabelFieldsSection: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <section>
    <h2 className="text-sm font-bold font-mono text-gray-400 uppercase tracking-widest mb-4">
      Label fields
    </h2>
    <p className="text-gray-500 text-xs leading-relaxed mb-3">
      Configure how reviews are organised across the install. Changes apply to
      every review immediately.
    </p>
    <button
      onClick={onOpen}
      className="text-xs font-semibold px-4 py-2 rounded-lg bg-white text-gray-900 hover:bg-gray-100 transition-colors"
    >
      Manage label fields
    </button>
  </section>
);

// ─── Access section ──────────────────────────────────────────────────────────

const AccessSection: React.FC<{ mode: 'none' | 'accounts' | 'sso'; onLock: () => void }> = ({
  mode,
  onLock,
}) => (
  <section>
    <h2 className="text-sm font-bold font-mono text-gray-400 uppercase tracking-widest mb-4">
      Access
    </h2>
    <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 space-y-3">
      {mode === 'none' ? (
        <>
          <p className="text-gray-400 text-xs leading-relaxed">
            The front-door password and the admin passphrase are set by{' '}
            <code className="text-gray-300 bg-white/5 px-1 py-0.5 rounded text-[10px] font-mono">
              ./install.sh
            </code>
            . They are shared passwords, not per-person accounts — anyone with the
            password gets in, and the app cannot tell one person from another.
          </p>
          <p className="text-gray-500 text-[11px] leading-relaxed">
            Rotating a password means editing the deployment's{' '}
            <code className="text-gray-400 font-mono">.env</code> and restarting
            the API container. That is not something a button on this screen can do
            safely, so password rotation is a server-side operation only.
          </p>
        </>
      ) : (
        <p className="text-gray-400 text-xs leading-relaxed">
          This deployment uses per-person accounts. People sign in with their
          email and password (or their company's identity provider). Administrators
          manage accounts from the People section.
        </p>
      )}
      <button
        onClick={onLock}
        className="text-xs font-semibold px-4 py-2 rounded-lg border border-white/10 hover:border-white/30 text-gray-300 hover:text-white transition-colors"
      >
        {mode === 'none' ? 'Lock this browser' : 'Sign out'}
      </button>
    </div>
  </section>
);

// ─── Activity section ────────────────────────────────────────────────────────

function formatAuditEvent(e: AuditEvent): string {
  const actor = e.actor_name || 'Someone';
  const subject = e.subject_name || 'someone';
  const room = e.room_id.slice(0, 8);
  const when = formatAuditTimestamp(e.at);
  switch (e.action) {
    case 'admitted':
      return `${actor} admitted ${subject} · room ${room} · ${when}`;
    case 'declined':
      return `${actor} declined ${subject} · room ${room} · ${when}`;
    case 'join_policy':
      return `${actor} set join policy to ${e.detail} · room ${room} · ${when}`;
    default:
      return `${actor} ${e.action} · room ${room} · ${when}`;
  }
}

function formatAuditTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + ' today';
  }
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const ActivitySection: React.FC = () => {
  const [result, setResult] = React.useState<AuditListResult | null>(null);

  useEffect(() => {
    void listAuditEvents().then(setResult);
  }, []);

  return (
    <section>
      <h2 className="text-sm font-bold font-mono text-gray-400 uppercase tracking-widest mb-4">
        Activity
      </h2>
      <p className="text-gray-500 text-[11px] leading-relaxed mb-3">
        This records grants made through the app; it is not a tamper-proof
        ledger, and names are self-asserted.
      </p>
      {!result ? (
        <p className="text-gray-600 text-xs">Loading…</p>
      ) : result.status === 'not_configured' ? (
        <p className="text-gray-600 text-xs">
          The room server has no database configured — audit logging is
          disabled.
        </p>
      ) : result.events.length === 0 ? (
        <p className="text-gray-600 text-xs">Nothing has happened yet.</p>
      ) : (
        <div className="space-y-1">
          {result.events.map((e) => (
            <p key={e.id} className="text-gray-400 text-xs">
              {formatAuditEvent(e)}
            </p>
          ))}
        </div>
      )}
    </section>
  );
};

export default AdminPage;
