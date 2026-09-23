// Admin screen — unlocked by the admin passphrase, not an admin account.
//
// Three sections on one page:
//   1. Reviews — every review on this install, toggle listed, delete
//   2. Label fields — the same modal the tracker uses (extracted, shared)
//   3. Access — read-only explanation + "Lock this browser"
//
// Gate states:
//   - loading: blank (the shell is mounting)
//   - required: false → "passphrase not set" page (closed, not open)
//   - required && !unlocked → unlock form
//   - unlocked → the three sections
//
// `required: false` means the admin passphrase is NOT configured. On the
// front door that means "open to everyone"; here it means CLOSED — this
// screen can delete other people's reviews, so no passphrase means no
// access. The comment in useAdminGate.ts explains why the fail-safe
// direction is the opposite of the front door's fail-open.

import React, { useState, useEffect, useCallback } from 'react';
import { useAdminGate } from '../lib/access/useAdminGate.ts';
import { useLabelFieldsStore } from '../lib/labelFieldsStore';
import {
  listAllCurations,
  deleteCuration,
  setCurationListed,
  type CurationSummary,
} from '../lib/curationsRepo';
import AdminUnlockPage from './AdminUnlockPage.tsx';
import LabelFieldsSettings from '../components/UI/LabelFieldsSettings';

// ─── Gate logic ──────────────────────────────────────────────────────────────

const AdminPage: React.FC = () => {
  const { required, unlocked, loading } = useAdminGate();

  if (loading) return null;
  if (!required) return <NotConfigured />;
  if (!unlocked) return <AdminUnlockPage />;
  return <AdminContent />;
};

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

// ─── Admin content (three sections) ─────────────────────────────────────────

const AdminContent: React.FC = () => {
  const { lock } = useAdminGate();
  const [labelSettingsOpen, setLabelSettingsOpen] = useState(false);
  const labelFields = useLabelFieldsStore((s) => s.fields);
  const loadLabelFields = useLabelFieldsStore((s) => s.load);
  const labelFieldsLoaded = useLabelFieldsStore((s) => s.loaded);

  useEffect(() => {
    if (!labelFieldsLoaded) loadLabelFields();
  }, [labelFieldsLoaded, loadLabelFields]);

  return (
    <div
      className="min-h-screen bg-[#0A0A0A] text-white"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-black font-black text-sm">VA</span>
            </div>
            <span className="font-mono text-white text-sm font-bold tracking-widest uppercase">
              Admin
            </span>
          </div>
          <button
            onClick={lock}
            className="text-xs font-mono text-gray-500 hover:text-white transition-colors"
          >
            Lock this browser
          </button>
        </header>

        <ReviewsSection />
        <LabelFieldsSection onOpen={() => setLabelSettingsOpen(true)} />
        <AccessSection onLock={lock} />
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
        Reviews
      </h2>
      {!loaded ? (
        <p className="text-gray-600 text-xs">Loading…</p>
      ) : curations.length === 0 ? (
        <p className="text-gray-600 text-xs">No reviews yet.</p>
      ) : (
        <div className="space-y-2">
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

const AccessSection: React.FC<{ onLock: () => void }> = ({ onLock }) => (
  <section>
    <h2 className="text-sm font-bold font-mono text-gray-400 uppercase tracking-widest mb-4">
      Access
    </h2>
    <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 space-y-3">
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
      <button
        onClick={onLock}
        className="text-xs font-semibold px-4 py-2 rounded-lg border border-white/10 hover:border-white/30 text-gray-300 hover:text-white transition-colors"
      >
        Lock this browser
      </button>
    </div>
  </section>
);

export default AdminPage;
