import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  ChevronLeft, Camera, MapPin, ListOrdered, Box, Trash2,
  Play, Plus, GripVertical, X, AlertTriangle, Info, ShieldAlert,
  FileBox, Layers, Cloud, CloudOff, Check, Link2
} from 'lucide-react';
import ReviewSetupCanvas, { type ReviewSetupCanvasHandle } from '../components/Scene/ReviewSetupCanvas';
import {
  useReviewSetupStore,
  type ReviewViewpoint,
  type ReviewPin,
  type AgendaItem,
  type PinSeverity,
  type ReviewDraft,
} from '../lib/reviewSetupStore';
import { useStore } from '../store';
import type { ModelType } from '../types';
import { parseModelFile } from '../utils/modelLoader';
import { loadCuration, saveCuration, subscribeCuration, trackCurationPresence, type CurationPresence, type SyncStatus } from '../lib/curationsRepo';
import { getIdentity } from '../lib/identity';
import OnshapeBrowser from '../components/UI/OnshapeBrowser';

type TabId = 'asset' | 'viewpoints' | 'pins' | 'agenda';

// ─── Page ────────────────────────────────────────────────────────────────────

const ReviewSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { reviewId } = useParams<{ reviewId: string }>();

  const draft = useReviewSetupStore((s) => s.draft);
  const startNewDraft = useReviewSetupStore((s) => s.startNewDraft);
  const hydrateDraft = useReviewSetupStore((s) => s.hydrateDraft);
  const setTitle = useReviewSetupStore((s) => s.setTitle);

  const setActiveModelType = useStore((s) => s.setActiveModelType);
  const setImportedModel = useStore((s) => s.setImportedModel);
  const setIsPlaying = useStore((s) => s.togglePlay);
  const isPlaying = useStore((s) => s.isPlaying);

  const [tab, setTab] = useState<TabId>('asset');
  const [pinMode, setPinMode] = useState(false);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const canvasRef = useRef<ReviewSetupCanvasHandle>(null);

  // Hydration + save state. `hydrated` gates the auto-save effect so we don't
  // immediately overwrite the cloud version with the local one on first load.
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Last serialized payload we either pushed to the cloud or accepted from a
  // remote update. Used to suppress save-loops when realtime echoes our own
  // write back, and to skip no-op saves when realtime delivers a peer's edit.
  const lastSyncedRef = useRef<string>('');

  // Serialize a draft for the loop-detector — strip the giant base64 blob and
  // local timestamps so equivalent content compares equal across machines.
  const fingerprint = (d: ReviewDraft): string => {
    const { importedFileBase64: _b, ...asset } = d.asset;
    return JSON.stringify({
      title: d.title, description: d.description, asset,
      viewpoints: d.viewpoints, pins: d.pins, agenda: d.agenda,
    });
  };

  // ─── Bootstrap draft: prefer cloud, fall back to local, then create fresh ──
  useEffect(() => {
    let cancelled = false;
    if (!reviewId) return;
    setHydrated(false);
    (async () => {
      const remote = await loadCuration(reviewId);
      if (cancelled) return;
      if (remote) {
        lastSyncedRef.current = fingerprint(remote);
        hydrateDraft(remote);
      } else if (!draft || draft.reviewId !== reviewId) {
        startNewDraft(reviewId);
      }
      setHydrated(true);
    })();
    return () => { cancelled = true; };
    // We intentionally do NOT depend on `draft` — only the route id matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewId, hydrateDraft, startNewDraft]);

  // ─── Auto-save the draft to the cloud (debounced + fingerprint) ───────────
  useEffect(() => {
    if (!hydrated || !draft || draft.reviewId !== reviewId) return;
    const fp = fingerprint(draft);
    if (fp === lastSyncedRef.current) return; // no change since last sync
    setSaveState('saving');
    const handle = setTimeout(async () => {
      const res = await saveCuration(draft);
      if (res.ok) lastSyncedRef.current = fp;
      setSaveState(res.ok ? 'saved' : 'error');
    }, 800);
    return () => clearTimeout(handle);
  }, [hydrated, draft, reviewId]);

  // ─── Live multi-user sync: pull remote edits as they happen ───────────────
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');
  useEffect(() => {
    if (!hydrated || !reviewId) return;
    const off = subscribeCuration(
      reviewId,
      (incoming) => {
        const fp = fingerprint(incoming);
        if (fp === lastSyncedRef.current) return; // our own echo, ignore
        lastSyncedRef.current = fp;
        hydrateDraft(incoming);
      },
      setSyncStatus,
    );
    return off;
  }, [hydrated, reviewId, hydrateDraft]);

  // Refetch when the user comes back to the tab — covers gaps where the
  // browser throttled the realtime channel while the tab was hidden.
  useEffect(() => {
    if (!hydrated || !reviewId) return;
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      const fresh = await loadCuration(reviewId);
      if (!fresh) return;
      const fp = fingerprint(fresh);
      if (fp === lastSyncedRef.current) return;
      lastSyncedRef.current = fp;
      hydrateDraft(fresh);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [hydrated, reviewId, hydrateDraft]);

  // ─── Presence: who else is editing right now ──────────────────────────────
  const [peers, setPeers] = useState<CurationPresence[]>([]);
  useEffect(() => {
    if (!reviewId) return;
    const identity = getIdentity();
    let userId = sessionStorage.getItem('vp_userId');
    if (!userId) {
      userId = crypto.randomUUID();
      sessionStorage.setItem('vp_userId', userId);
    }
    const off = trackCurationPresence(
      reviewId,
      { userId, name: identity?.name || 'Guest', color: identity?.color || '#4F8EF7' },
      setPeers,
    );
    return off;
  }, [reviewId]);
  const selfUserId = typeof window !== 'undefined' ? sessionStorage.getItem('vp_userId') : null;
  const otherPeers = peers.filter((p) => p.userId !== selfUserId);

  // ─── Setup mode defaults: sim paused (agents are hard-removed in the canvas) ─
  useEffect(() => {
    if (isPlaying) setIsPlaying();
    // intentionally empty deps: run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Apply draft asset to the main store so World renders it ───────────────
  const importedFileBase64 = draft?.asset.importedFileBase64;
  const importedFileName = draft?.asset.importedFileName;
  const modelType = draft?.asset.modelType;

  useEffect(() => {
    if (!modelType) return;
    if (modelType === 'imported') {
      if (importedFileBase64 && importedFileName) {
        const ext = importedFileName.split('.').pop()?.toLowerCase() || 'glb';
        const mimeMap: Record<string, string> = {
          glb: 'model/gltf-binary', gltf: 'model/gltf+json',
          obj: 'text/plain', fbx: 'application/octet-stream', stl: 'application/octet-stream',
        };
        const mime = mimeMap[ext] || 'application/octet-stream';
        const bytes = Uint8Array.from(atob(importedFileBase64), (c) => c.charCodeAt(0));
        const file = new File([bytes], importedFileName, { type: mime });
        parseModelFile(file)
          .then((r) => setImportedModel(r.root, r.sceneTree, r.fileName, r.baseScale, r.basePosition))
          .catch((err) => console.error('[ReviewSetup] failed to parse imported model:', err));
      }
    } else {
      setActiveModelType(modelType);
    }
  }, [modelType, importedFileBase64, importedFileName, setActiveModelType, setImportedModel]);

  if (!draft) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[#0A0A0A] text-white font-mono text-sm">
        Loading draft…
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-[#0A0A0A] text-white font-sans">
      {/* Top bar */}
      <header className="flex items-center gap-4 px-6 py-3 border-b border-white/10 bg-[#0A0A0A] z-10 shrink-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-xs font-mono uppercase text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={14} /> Lobby
        </button>
        <div className="w-px h-6 bg-white/10" />
        <div className="flex-1 max-w-2xl">
          <input
            value={draft.title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Review title (e.g. 'Headphones Q3 Concept Review')"
            className="w-full bg-transparent text-lg font-bold tracking-tight outline-none placeholder:text-gray-600"
          />
          <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mt-0.5 flex items-center gap-2">
            <span>Setup · ID {draft.reviewId.slice(0, 8)}</span>
            <span className="text-gray-700">·</span>
            <SaveIndicator state={saveState} />
            <span className="text-gray-700">·</span>
            <SyncIndicator status={syncStatus} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase text-gray-500">
          <span>{draft.viewpoints.length} VPS</span>
          <span>·</span>
          <span>{draft.pins.length} PINS</span>
          <span>·</span>
          <span>{draft.agenda.length} AGENDA</span>
        </div>
        <PresenceStack peers={otherPeers} />
        <ShareButton reviewId={draft.reviewId} peerCount={otherPeers.length} />
        <button
          onClick={() => {
            sessionStorage.setItem('vp_enteredRoom', draft.reviewId);
            navigate(`/room/${draft.reviewId}`, { state: { fromLobby: true } });
          }}
          className="flex items-center gap-2 px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase tracking-wide transition-colors"
        >
          <Play size={14} /> Open Review Room
        </button>
      </header>

      {/* Main split */}
      <div className="flex-1 flex min-h-0">
        {/* Left: 3D viewer */}
        <div className="flex-1 relative bg-[#1a1a1a]">
          <ReviewSetupCanvas
            ref={canvasRef}
            pinMode={pinMode}
            selectedPinId={selectedPinId}
            onSelectPin={setSelectedPinId}
          />
          {pinMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-amber-500/95 text-black text-xs font-bold uppercase tracking-widest pointer-events-none shadow-lg">
              Pin mode · Click on a part
            </div>
          )}
          <button
            onClick={() => {
              const vp = canvasRef.current?.captureViewpoint();
              if (!vp) return;
              useReviewSetupStore.getState().addViewpoint({
                label: `Viewpoint ${draft.viewpoints.length + 1}`,
                position: vp.position,
                lookAt: vp.lookAt,
                thumbnail: vp.thumbnail,
              });
              setTab('viewpoints');
            }}
            className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-2 rounded-md bg-white text-black text-xs font-bold uppercase tracking-wide shadow-lg hover:bg-emerald-300 transition-colors"
          >
            <Camera size={14} /> Capture View
          </button>
          <button
            onClick={() => { setPinMode((v) => !v); setSelectedPinId(null); }}
            className={clsx(
              'absolute bottom-4 left-44 flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wide shadow-lg transition-colors',
              pinMode
                ? 'bg-amber-500 text-black hover:bg-amber-400'
                : 'bg-white text-black hover:bg-amber-200'
            )}
          >
            <MapPin size={14} /> {pinMode ? 'Exit Pin Mode' : 'Drop Pin'}
          </button>
        </div>

        {/* Right: Sidebar */}
        <aside className="w-[400px] shrink-0 border-l border-white/10 flex flex-col bg-[#111]">
          <nav className="flex border-b border-white/10 shrink-0">
            <TabButton id="asset" current={tab} onSelect={setTab} icon={<Box size={13} />}>Asset</TabButton>
            <TabButton id="viewpoints" current={tab} onSelect={setTab} icon={<Camera size={13} />} count={draft.viewpoints.length}>Viewpoints</TabButton>
            <TabButton id="pins" current={tab} onSelect={setTab} icon={<MapPin size={13} />} count={draft.pins.length}>Pins</TabButton>
            <TabButton id="agenda" current={tab} onSelect={setTab} icon={<ListOrdered size={13} />} count={draft.agenda.length}>Agenda</TabButton>
          </nav>
          <div className="flex-1 overflow-y-auto">
            {tab === 'asset' && <AssetTab />}
            {tab === 'viewpoints' && (
              <ViewpointsTab
                viewpoints={draft.viewpoints}
                onJump={(vp) => canvasRef.current?.jumpTo({ position: vp.position, lookAt: vp.lookAt })}
              />
            )}
            {tab === 'pins' && (
              <PinsTab
                pins={draft.pins}
                selectedId={selectedPinId}
                onSelect={setSelectedPinId}
                onEnterPinMode={() => setPinMode(true)}
              />
            )}
            {tab === 'agenda' && (
              <AgendaTab
                agenda={draft.agenda}
                viewpoints={draft.viewpoints}
                pins={draft.pins}
                onJumpViewpoint={(vp) => canvasRef.current?.jumpTo({ position: vp.position, lookAt: vp.lookAt })}
                onSelectPin={(id) => { setSelectedPinId(id); setTab('pins'); }}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

// ─── Tab button ─────────────────────────────────────────────────────────────

const TabButton: React.FC<{
  id: TabId; current: TabId; onSelect: (id: TabId) => void;
  icon: React.ReactNode; count?: number; children: React.ReactNode;
}> = ({ id, current, onSelect, icon, count, children }) => (
  <button
    onClick={() => onSelect(id)}
    className={clsx(
      'flex-1 py-3 text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors',
      current === id
        ? 'bg-white/5 text-white border-b-2 border-emerald-400'
        : 'text-gray-500 hover:text-gray-300'
    )}
  >
    {icon} {children}
    {typeof count === 'number' && count > 0 && (
      <span className="text-[9px] font-mono bg-white/10 px-1.5 rounded">{count}</span>
    )}
  </button>
);

// ─── Asset tab ──────────────────────────────────────────────────────────────

const PRESET_MODELS: { type: ModelType; label: string; subtitle: string }[] = [
  { type: 'headphones', label: 'Headphones', subtitle: 'Sennheiser Momentum 4' },
  { type: 'bicycle',    label: 'Bicycle',    subtitle: 'Sample frame' },
  { type: 'synth',      label: 'Synth',      subtitle: 'Procedural placeholder' },
];

const AssetTab: React.FC = () => {
  const draft = useReviewSetupStore((s) => s.draft)!;
  const setModelType = useReviewSetupStore((s) => s.setModelType);
  const setImportedFile = useReviewSetupStore((s) => s.setImportedFile);
  const addReference = useReviewSetupStore((s) => s.addReference);
  const removeReference = useReviewSetupStore((s) => s.removeReference);
  const setDescription = useReviewSetupStore((s) => s.setDescription);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [refName, setRefName] = useState('');
  const [refUrl, setRefUrl] = useState('');
  const [showOnshapeBrowser, setShowOnshapeBrowser] = useState(false);

  const handleFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    const base64 = btoa(binary);
    setImportedFile(file.name, base64);
  };

  return (
    <div className="p-5 flex flex-col gap-6">
      <Section label="Description">
        <textarea
          value={draft.description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this review covering? What outcomes do you want?"
          className="w-full h-20 bg-white/5 text-sm rounded p-2 border border-white/10 outline-none focus:border-emerald-400/50 placeholder:text-gray-600"
        />
      </Section>

      <Section label="Model">
        <div className="grid grid-cols-3 gap-2">
          {PRESET_MODELS.map((m) => {
            const active = draft.asset.modelType === m.type;
            return (
              <button
                key={m.type}
                onClick={() => setModelType(m.type)}
                className={clsx(
                  'flex flex-col items-center gap-1 p-3 rounded border text-left transition-all',
                  active
                    ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-100'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:border-white/30'
                )}
              >
                <Box size={20} className={active ? 'text-emerald-300' : 'text-gray-500'} />
                <span className="text-xs font-bold">{m.label}</span>
                <span className="text-[9px] font-mono text-gray-500 text-center leading-tight">{m.subtitle}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf,.obj,.fbx,.stl"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={clsx(
              'w-full flex items-center justify-center gap-2 p-3 rounded border-2 border-dashed transition-colors',
              draft.asset.modelType === 'imported'
                ? 'border-emerald-400/50 bg-emerald-500/5 text-emerald-200'
                : 'border-white/15 hover:border-white/30 text-gray-400'
            )}
          >
            <FileBox size={16} />
            <span className="text-xs font-bold">
              {draft.asset.importedFileName ? `Imported: ${draft.asset.importedFileName}` : 'Upload your own (.glb, .obj, .fbx)'}
            </span>
          </button>
          <button
            onClick={() => setShowOnshapeBrowser(true)}
            className="mt-2 w-full flex items-center justify-center gap-2 p-3 rounded border-2 border-dashed border-emerald-500/30 hover:border-emerald-400/60 hover:bg-emerald-500/5 text-emerald-200 transition-colors"
          >
            <span className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold text-black bg-gradient-to-br from-emerald-300 to-emerald-500">OS</span>
            <span className="text-xs font-bold">Import from Onshape</span>
          </button>
        </div>
      </Section>

      <Section label="Reference Materials">
        <div className="flex flex-col gap-2">
          {draft.asset.references.length === 0 && (
            <div className="text-[11px] text-gray-500 italic">No references yet. Link spec sheets, prior reviews, briefs…</div>
          )}
          {draft.asset.references.map((r) => (
            <div key={r.id} className="flex items-center gap-2 p-2 rounded bg-white/5 border border-white/10">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{r.name}</div>
                {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-emerald-400 hover:underline truncate block">{r.url}</a>}
              </div>
              <button onClick={() => removeReference(r.id)} className="text-gray-500 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="flex gap-2 mt-1">
            <input
              value={refName}
              onChange={(e) => setRefName(e.target.value)}
              placeholder="Name"
              className="flex-1 bg-white/5 text-xs rounded px-2 py-1.5 border border-white/10 outline-none focus:border-emerald-400/40"
            />
            <input
              value={refUrl}
              onChange={(e) => setRefUrl(e.target.value)}
              placeholder="URL (optional)"
              className="flex-[1.5] bg-white/5 text-xs rounded px-2 py-1.5 border border-white/10 outline-none focus:border-emerald-400/40"
            />
            <button
              disabled={!refName.trim()}
              onClick={() => {
                addReference({ name: refName.trim(), url: refUrl.trim() || undefined });
                setRefName(''); setRefUrl('');
              }}
              className="px-2 py-1.5 rounded bg-white text-black text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </Section>

      {showOnshapeBrowser && (
        <OnshapeBrowser
          onClose={() => setShowOnshapeBrowser(false)}
          onImported={(file) => { handleFile(file); }}
        />
      )}
    </div>
  );
};

// ─── Viewpoints tab ────────────────────────────────────────────────────────

const ViewpointsTab: React.FC<{
  viewpoints: ReviewViewpoint[];
  onJump: (vp: ReviewViewpoint) => void;
}> = ({ viewpoints, onJump }) => {
  const updateViewpoint = useReviewSetupStore((s) => s.updateViewpoint);
  const removeViewpoint = useReviewSetupStore((s) => s.removeViewpoint);

  return (
    <div className="p-5 flex flex-col gap-3">
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Orbit the model with the mouse, then click <strong className="text-white">Capture View</strong> below the canvas. Saved viewpoints become jump-to anchors during the review.
      </p>
      {viewpoints.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-xs italic">
          <Camera size={28} className="mx-auto mb-2 opacity-30" />
          No viewpoints saved yet
        </div>
      )}
      {viewpoints.map((v, i) => (
        <div key={v.id} className="rounded border border-white/10 bg-white/5 overflow-hidden">
          {v.thumbnail && (
            <button onClick={() => onJump(v)} className="block w-full aspect-video bg-black overflow-hidden">
              <img src={v.thumbnail} alt={v.label} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
            </button>
          )}
          <div className="p-2 flex items-center gap-2">
            <span className="text-[10px] font-mono text-gray-500 tabular-nums w-6">{String(i + 1).padStart(2, '0')}</span>
            <input
              value={v.label}
              onChange={(e) => updateViewpoint(v.id, { label: e.target.value })}
              placeholder="Viewpoint title"
              className="flex-1 bg-transparent text-xs font-bold outline-none placeholder:text-gray-600"
            />
            <button onClick={() => onJump(v)} className="text-[10px] font-bold uppercase text-emerald-400 hover:text-emerald-300 px-1.5">
              Jump
            </button>
            <button onClick={() => removeViewpoint(v.id)} className="text-gray-500 hover:text-red-400">
              <Trash2 size={13} />
            </button>
          </div>
          {/* Explainer notes — surfaces in-room as the viewpoint's comment content */}
          <div className="px-2 pb-2">
            <textarea
              value={v.notes ?? ''}
              onChange={(e) => updateViewpoint(v.id, { notes: e.target.value })}
              placeholder="Notes / explainer — what should the room discuss at this view?"
              className="w-full h-14 bg-black/30 text-[11px] rounded p-1.5 border border-white/10 outline-none focus:border-emerald-400/40 placeholder:text-gray-600 resize-none"
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Pins tab ──────────────────────────────────────────────────────────────

const SEVERITY_META: Record<PinSeverity, { label: string; icon: React.ReactNode; color: string }> = {
  info:    { label: 'Info',    icon: <Info size={12} />,         color: '#3b82f6' },
  concern: { label: 'Concern', icon: <AlertTriangle size={12} />, color: '#f59e0b' },
  blocker: { label: 'Blocker', icon: <ShieldAlert size={12} />,  color: '#ef4444' },
};

const PinsTab: React.FC<{
  pins: ReviewPin[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEnterPinMode: () => void;
}> = ({ pins, selectedId, onSelect, onEnterPinMode }) => {
  const updatePin = useReviewSetupStore((s) => s.updatePin);
  const removePin = useReviewSetupStore((s) => s.removePin);

  return (
    <div className="p-5 flex flex-col gap-3">
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Drop pins on specific parts of the model to flag talking points. Each pin auto-captures the part name and your chosen severity.
      </p>
      <button
        onClick={onEnterPinMode}
        className="w-full flex items-center justify-center gap-2 p-2 rounded border border-dashed border-white/20 text-xs font-bold uppercase text-amber-300 hover:bg-amber-500/10 hover:border-amber-400/50 transition-colors"
      >
        <MapPin size={14} /> Enter pin-drop mode
      </button>
      {pins.length === 0 && (
        <div className="text-center py-10 text-gray-500 text-xs italic">
          <MapPin size={28} className="mx-auto mb-2 opacity-30" />
          No pins yet
        </div>
      )}
      {pins.map((p) => {
        const sev = SEVERITY_META[p.severity];
        const selected = p.id === selectedId;
        return (
          <div
            key={p.id}
            onClick={() => onSelect(selected ? null : p.id)}
            className={clsx(
              'rounded border p-2 flex flex-col gap-2 cursor-pointer transition-colors',
              selected ? 'bg-white/10 border-emerald-400/40' : 'bg-white/5 border-white/10 hover:bg-white/8'
            )}
          >
            <div className="flex items-center gap-2">
              <span style={{ color: sev.color }} className="flex items-center">{sev.icon}</span>
              <input
                value={p.label}
                onChange={(e) => updatePin(p.id, { label: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-transparent text-xs font-bold outline-none"
              />
              <button
                onClick={(e) => { e.stopPropagation(); removePin(p.id); }}
                className="text-gray-500 hover:text-red-400"
              >
                <Trash2 size={13} />
              </button>
            </div>
            {p.partName && (
              <div className="text-[10px] font-mono text-gray-500 ml-6">on {p.partName}</div>
            )}
            <div className="flex items-center gap-1 ml-5" onClick={(e) => e.stopPropagation()}>
              {(['info', 'concern', 'blocker'] as PinSeverity[]).map((s) => {
                const m = SEVERITY_META[s];
                const active = p.severity === s;
                return (
                  <button
                    key={s}
                    onClick={() => updatePin(p.id, { severity: s })}
                    className={clsx(
                      'flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-colors',
                      active ? 'text-white' : 'text-gray-500 hover:text-gray-300',
                    )}
                    style={active ? { background: m.color } : { background: 'rgba(255,255,255,0.04)' }}
                  >
                    {m.icon} {m.label}
                  </button>
                );
              })}
            </div>
            {selected && (
              <textarea
                value={p.notes ?? ''}
                onChange={(e) => updatePin(p.id, { notes: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                placeholder="Notes…"
                className="ml-5 mt-1 w-[calc(100%-1.25rem)] h-16 bg-black/30 text-xs rounded p-2 border border-white/10 outline-none focus:border-emerald-400/40"
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── Agenda tab ────────────────────────────────────────────────────────────

const AgendaTab: React.FC<{
  agenda: AgendaItem[];
  viewpoints: ReviewViewpoint[];
  pins: ReviewPin[];
  onJumpViewpoint: (vp: ReviewViewpoint) => void;
  onSelectPin: (id: string) => void;
}> = ({ agenda, viewpoints, pins, onJumpViewpoint, onSelectPin }) => {
  const addAgendaItem = useReviewSetupStore((s) => s.addAgendaItem);
  const removeAgendaItem = useReviewSetupStore((s) => s.removeAgendaItem);
  const reorderAgenda = useReviewSetupStore((s) => s.reorderAgenda);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  return (
    <div className="p-5 flex flex-col gap-3">
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Build the deck. Each slide has a title, speaker notes, and any number of viewpoints and pins. Drag to reorder.
      </p>

      {agenda.length === 0 && (
        <div className="text-center py-10 text-gray-500 text-xs italic">
          <Layers size={28} className="mx-auto mb-2 opacity-30" />
          No slides yet
        </div>
      )}

      {agenda.map((item, idx) => (
        <SlideCard
          key={item.id}
          item={item}
          idx={idx}
          viewpoints={viewpoints}
          pins={pins}
          onJumpViewpoint={onJumpViewpoint}
          onSelectPin={onSelectPin}
          onRemove={() => removeAgendaItem(item.id)}
          onDragStart={() => setDragIdx(idx)}
          onDrop={() => { if (dragIdx !== null) { reorderAgenda(dragIdx, idx); setDragIdx(null); } }}
        />
      ))}

      <button
        onClick={() => addAgendaItem({ title: `Slide ${agenda.length + 1}` })}
        className="mt-3 flex items-center justify-center gap-2 p-3 rounded border-2 border-dashed border-white/15 hover:border-emerald-400/50 hover:bg-emerald-500/5 text-xs font-bold uppercase tracking-wide text-gray-400 hover:text-emerald-200 transition-colors"
      >
        <Plus size={14} /> Add blank slide
      </button>
    </div>
  );
};

// ─── Slide card ─────────────────────────────────────────────────────────────

const SlideCard: React.FC<{
  item: AgendaItem;
  idx: number;
  viewpoints: ReviewViewpoint[];
  pins: ReviewPin[];
  onJumpViewpoint: (vp: ReviewViewpoint) => void;
  onSelectPin: (id: string) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}> = ({ item, idx, viewpoints, pins, onJumpViewpoint, onSelectPin, onRemove, onDragStart, onDrop }) => {
  const updateAgendaItem = useReviewSetupStore((s) => s.updateAgendaItem);
  const attachVp = useReviewSetupStore((s) => s.attachViewpointToAgendaItem);
  const detachVp = useReviewSetupStore((s) => s.detachViewpointFromAgendaItem);
  const attachPin = useReviewSetupStore((s) => s.attachPinToAgendaItem);
  const detachPin = useReviewSetupStore((s) => s.detachPinFromAgendaItem);
  const [pickerOpen, setPickerOpen] = useState<'viewpoint' | 'pin' | null>(null);

  const linkedVps = item.viewpointIds
    .map((vid) => viewpoints.find((v) => v.id === vid))
    .filter((v): v is ReviewViewpoint => Boolean(v));
  const linkedPins = item.pinIds
    .map((pid) => pins.find((p) => p.id === pid))
    .filter((p): p is ReviewPin => Boolean(p));

  const availableVps = viewpoints.filter((v) => !item.viewpointIds.includes(v.id));
  const availablePins = pins.filter((p) => !item.pinIds.includes(p.id));

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="rounded border border-white/10 bg-white/5 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start gap-2 p-2 border-b border-white/5">
        <div className="flex flex-col items-center pt-1">
          <GripVertical size={12} className="text-gray-600 cursor-grab" />
          <span className="text-[9px] font-mono text-gray-500 tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
        </div>
        <input
          value={item.title}
          onChange={(e) => updateAgendaItem(item.id, { title: e.target.value })}
          placeholder="Slide title"
          className="flex-1 bg-transparent text-xs font-bold outline-none placeholder:text-gray-600"
        />
        <button onClick={onRemove} className="text-gray-500 hover:text-red-400" title="Remove slide">
          <X size={14} />
        </button>
      </div>

      {/* Speaker notes */}
      <div className="px-2 pt-2">
        <textarea
          value={item.notes ?? ''}
          onChange={(e) => updateAgendaItem(item.id, { notes: e.target.value })}
          placeholder="Speaker notes — what should you say at this slide?"
          className="w-full h-14 bg-black/30 text-[11px] rounded p-1.5 border border-white/10 outline-none focus:border-emerald-400/40 placeholder:text-gray-600 resize-none"
        />
      </div>

      {/* Attachments */}
      <div className="p-2 flex flex-col gap-2">
        {/* Viewpoints */}
        {linkedVps.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {linkedVps.map((v) => (
              <div key={v.id} className="flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-400/30 pl-1 pr-1">
                {v.thumbnail && (
                  <img src={v.thumbnail} alt="" className="w-6 h-4 object-cover rounded-sm" />
                )}
                <button
                  onClick={() => onJumpViewpoint(v)}
                  className="text-[10px] font-bold text-emerald-100 hover:text-white px-1 truncate max-w-[140px]"
                  title="Jump camera to this viewpoint"
                >
                  <Camera size={9} className="inline -mt-0.5 mr-0.5" />{v.label}
                </button>
                <button
                  onClick={() => detachVp(item.id, v.id)}
                  className="text-emerald-300/60 hover:text-red-300"
                  title="Remove from slide"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pins */}
        {linkedPins.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {linkedPins.map((p) => {
              const sev = SEVERITY_META[p.severity];
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-1 rounded border pl-1 pr-1"
                  style={{ background: `${sev.color}1a`, borderColor: `${sev.color}66` }}
                >
                  <span style={{ color: sev.color }} className="flex items-center">{sev.icon}</span>
                  <button
                    onClick={() => onSelectPin(p.id)}
                    className="text-[10px] font-bold text-white hover:text-white px-1 truncate max-w-[140px]"
                    title="Show pin in Pins tab"
                  >
                    {p.label}
                  </button>
                  <button
                    onClick={() => detachPin(item.id, p.id)}
                    className="text-white/40 hover:text-red-300"
                    title="Remove from slide"
                  >
                    <X size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Attach buttons */}
        <div className="flex gap-1.5 flex-wrap">
          {availableVps.length > 0 && (
            <button
              onClick={() => setPickerOpen(pickerOpen === 'viewpoint' ? null : 'viewpoint')}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors',
                pickerOpen === 'viewpoint'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
              )}
            >
              <Camera size={11} /> + Viewpoint
            </button>
          )}
          {availablePins.length > 0 && (
            <button
              onClick={() => setPickerOpen(pickerOpen === 'pin' ? null : 'pin')}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors',
                pickerOpen === 'pin'
                  ? 'bg-amber-500/20 text-amber-200'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
              )}
            >
              <MapPin size={11} /> + Pin
            </button>
          )}
          {availableVps.length === 0 && availablePins.length === 0 && linkedVps.length === 0 && linkedPins.length === 0 && (
            <span className="text-[10px] text-gray-600 italic">No viewpoints or pins captured yet — add them in the other tabs.</span>
          )}
        </div>

        {/* Pickers */}
        {pickerOpen === 'viewpoint' && availableVps.length > 0 && (
          <div className="flex flex-col gap-0.5 rounded bg-black/40 border border-white/10 p-1 max-h-40 overflow-y-auto">
            {availableVps.map((v) => (
              <button
                key={v.id}
                onClick={() => { attachVp(item.id, v.id); setPickerOpen(null); }}
                className="flex items-center gap-2 px-2 py-1 rounded text-left text-[11px] hover:bg-emerald-500/10 hover:text-emerald-200"
              >
                {v.thumbnail && <img src={v.thumbnail} alt="" className="w-8 h-5 object-cover rounded-sm" />}
                <span className="truncate">{v.label}</span>
              </button>
            ))}
          </div>
        )}
        {pickerOpen === 'pin' && availablePins.length > 0 && (
          <div className="flex flex-col gap-0.5 rounded bg-black/40 border border-white/10 p-1 max-h-40 overflow-y-auto">
            {availablePins.map((p) => {
              const sev = SEVERITY_META[p.severity];
              return (
                <button
                  key={p.id}
                  onClick={() => { attachPin(item.id, p.id); setPickerOpen(null); }}
                  className="flex items-center gap-2 px-2 py-1 rounded text-left text-[11px] hover:bg-amber-500/10 hover:text-amber-100"
                >
                  <span style={{ color: sev.color }} className="flex items-center">{sev.icon}</span>
                  <span className="truncate flex-1">{p.label}</span>
                  {p.partName && <span className="text-[9px] text-gray-500 truncate">{p.partName}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Small helpers ──────────────────────────────────────────────────────────

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">{label}</div>
    {children}
  </div>
);

const PresenceStack: React.FC<{ peers: CurationPresence[] }> = ({ peers }) => {
  if (peers.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-gray-600" title="No other contributors editing right now">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-700" /> Solo
      </div>
    );
  }
  const visible = peers.slice(0, 4);
  const extra = peers.length - visible.length;
  return (
    <div className="flex items-center gap-2" title={peers.map((p) => p.name).join(', ') + ' editing now'}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      <div className="flex -space-x-1.5">
        {visible.map((p) => (
          <div
            key={p.userId}
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-[#0A0A0A]"
            style={{ background: p.color }}
            title={`${p.name} · editing now`}
          >
            {p.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {extra > 0 && (
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-gray-300 bg-white/10 border-2 border-[#0A0A0A]">
            +{extra}
          </div>
        )}
      </div>
    </div>
  );
};

const ShareButton: React.FC<{ reviewId: string; peerCount: number }> = ({ reviewId, peerCount }) => {
  const [copied, setCopied] = useState<'setup' | 'room' | null>(null);
  const [open, setOpen] = useState(false);
  const setupUrl = `${window.location.origin}/review/${reviewId}/setup`;
  const roomUrl = `${window.location.origin}/room/${reviewId}`;
  const draftTitle = useReviewSetupStore((s) => s.draft?.title) || 'Untitled Review';

  const copy = async (kind: 'setup' | 'room', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function';
  const nativeShare = async (kind: 'setup' | 'room', url: string) => {
    try {
      await (navigator as any).share({
        title: draftTitle,
        text: kind === 'room' ? `Join the design review: ${draftTitle}` : `Help curate: ${draftTitle}`,
        url,
      });
    } catch { /* user cancelled or unsupported */ }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-2 rounded bg-emerald-500/15 border border-emerald-400/30 hover:bg-emerald-500/25 hover:border-emerald-400/50 text-[11px] font-bold uppercase tracking-wide text-emerald-200 transition-colors relative"
        title="Share this curation"
      >
        <Link2 size={13} /> Share
        {peerCount > 0 && (
          <span className="ml-1 min-w-[14px] h-3.5 px-1 rounded-full text-[8px] flex items-center justify-center font-bold bg-emerald-400 text-black">
            {peerCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[380px] bg-[#111] border border-white/10 rounded-lg shadow-2xl p-3 flex flex-col gap-3">
            <div className="text-[10px] text-gray-400 leading-relaxed">
              Send <span className="text-emerald-300">contributors</span> the curation link so they can add content before the meeting. On meeting day, send the <span className="text-emerald-300">room link</span> so they jump straight in.
            </div>

            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Invite contributors (curation)</div>
              <div className="flex gap-1.5">
                <input
                  readOnly
                  value={setupUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 bg-black/40 text-[11px] font-mono text-gray-300 rounded px-2 py-1.5 border border-white/10 outline-none"
                />
                <button
                  onClick={() => copy('setup', setupUrl)}
                  className={clsx(
                    'px-2 rounded text-[10px] font-bold uppercase tracking-wider transition-colors',
                    copied === 'setup' ? 'bg-emerald-500 text-black' : 'bg-white/10 hover:bg-white/20 text-white',
                  )}
                >
                  {copied === 'setup' ? <Check size={12} /> : 'Copy'}
                </button>
                {canNativeShare && (
                  <button
                    onClick={() => nativeShare('setup', setupUrl)}
                    className="px-2 rounded text-[10px] font-bold uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white transition-colors"
                    title="Send via your device's share sheet (email, Slack, Messages…)"
                  >
                    Send…
                  </button>
                )}
              </div>
            </div>

            <div className="h-px bg-white/5" />

            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Meeting-day link (room)</div>
              <div className="flex gap-1.5">
                <input
                  readOnly
                  value={roomUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 bg-black/40 text-[11px] font-mono text-gray-300 rounded px-2 py-1.5 border border-white/10 outline-none"
                />
                <button
                  onClick={() => copy('room', roomUrl)}
                  className={clsx(
                    'px-2 rounded text-[10px] font-bold uppercase tracking-wider transition-colors',
                    copied === 'room' ? 'bg-emerald-500 text-black' : 'bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-200',
                  )}
                >
                  {copied === 'room' ? <Check size={12} /> : 'Copy'}
                </button>
                {canNativeShare && (
                  <button
                    onClick={() => nativeShare('room', roomUrl)}
                    className="px-2 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-200 transition-colors"
                    title="Send via your device's share sheet"
                  >
                    Send…
                  </button>
                )}
              </div>
            </div>

            {peerCount > 0 && (
              <div className="text-[10px] text-emerald-400/80 flex items-center gap-1.5 pt-1 border-t border-white/5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {peerCount} other {peerCount === 1 ? 'person is' : 'people are'} editing right now
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const SyncIndicator: React.FC<{ status: SyncStatus }> = ({ status }) => {
  if (status === 'live') return (
    <span className="inline-flex items-center gap-1 text-emerald-400/80 normal-case" title="Realtime sync active — peers see your edits instantly">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live sync
    </span>
  );
  if (status === 'polling') return (
    <span className="inline-flex items-center gap-1 text-amber-400/80 normal-case" title="Realtime not available — falling back to polling every 5s">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Polling
    </span>
  );
  if (status === 'offline') return (
    <span className="inline-flex items-center gap-1 text-red-400/80 normal-case" title="Sync stopped">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Offline
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-gray-500 normal-case">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-pulse" /> Connecting…
    </span>
  );
};

const SaveIndicator: React.FC<{ state: 'idle' | 'saving' | 'saved' | 'error' }> = ({ state }) => {
  if (state === 'saving') return (
    <span className="inline-flex items-center gap-1 text-amber-400/80 normal-case">
      <Cloud size={11} className="animate-pulse" /> Saving…
    </span>
  );
  if (state === 'saved') return (
    <span className="inline-flex items-center gap-1 text-emerald-400/80 normal-case">
      <Check size={11} /> Saved
    </span>
  );
  if (state === 'error') return (
    <span className="inline-flex items-center gap-1 text-red-400/80 normal-case" title="Failed to save to cloud — your edits stay in this browser">
      <CloudOff size={11} /> Local only
    </span>
  );
  return <span className="inline-flex items-center gap-1 text-gray-600 normal-case"><Cloud size={11} /> Idle</span>;
};

export default ReviewSetupPage;
