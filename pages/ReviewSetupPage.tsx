import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  ChevronLeft, Camera, MapPin, ListOrdered, Box, Trash2,
  Play, Plus, GripVertical, X, AlertTriangle, Info, ShieldAlert,
  FileBox
} from 'lucide-react';
import ReviewSetupCanvas, { type ReviewSetupCanvasHandle } from '../components/Scene/ReviewSetupCanvas';
import {
  useReviewSetupStore,
  type ReviewViewpoint,
  type ReviewPin,
  type AgendaItem,
  type PinSeverity,
} from '../lib/reviewSetupStore';
import { useStore } from '../store';
import type { ModelType } from '../types';
import { parseModelFile } from '../utils/modelLoader';

type TabId = 'asset' | 'viewpoints' | 'pins' | 'agenda';

// ─── Page ────────────────────────────────────────────────────────────────────

const ReviewSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { reviewId } = useParams<{ reviewId: string }>();

  const draft = useReviewSetupStore((s) => s.draft);
  const startNewDraft = useReviewSetupStore((s) => s.startNewDraft);
  const setTitle = useReviewSetupStore((s) => s.setTitle);

  const setActiveModelType = useStore((s) => s.setActiveModelType);
  const setImportedModel = useStore((s) => s.setImportedModel);
  const setHideAgents = useStore((s) => s.toggleHideAgents);
  const hideAgents = useStore((s) => s.hideAgents);
  const setIsPlaying = useStore((s) => s.togglePlay);
  const isPlaying = useStore((s) => s.isPlaying);

  const [tab, setTab] = useState<TabId>('asset');
  const [pinMode, setPinMode] = useState(false);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const canvasRef = useRef<ReviewSetupCanvasHandle>(null);

  // ─── Bootstrap draft ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!reviewId) return;
    // If the persisted draft is for a different id, start fresh.
    if (!draft || draft.reviewId !== reviewId) {
      startNewDraft(reviewId);
    }
  }, [reviewId, draft, startNewDraft]);

  // ─── Setup mode defaults: agents hidden, sim paused ────────────────────────
  useEffect(() => {
    if (!hideAgents) setHideAgents();
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
          <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mt-0.5">
            Setup · ID {draft.reviewId.slice(0, 8)}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase text-gray-500">
          <span>{draft.viewpoints.length} VPS</span>
          <span>·</span>
          <span>{draft.pins.length} PINS</span>
          <span>·</span>
          <span>{draft.agenda.length} AGENDA</span>
        </div>
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
  const updateAgendaItem = useReviewSetupStore((s) => s.updateAgendaItem);
  const removeAgendaItem = useReviewSetupStore((s) => s.removeAgendaItem);
  const reorderAgenda = useReviewSetupStore((s) => s.reorderAgenda);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [topicTitle, setTopicTitle] = useState('');

  return (
    <div className="p-5 flex flex-col gap-3">
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Sequence the review. Drag to reorder. Items can reference saved viewpoints, pins, or be free-form topics.
      </p>

      {agenda.length === 0 && (
        <div className="text-center py-10 text-gray-500 text-xs italic">
          <ListOrdered size={28} className="mx-auto mb-2 opacity-30" />
          No agenda items yet
        </div>
      )}

      {agenda.map((item, idx) => {
        const vp = item.refType === 'viewpoint' ? viewpoints.find((v) => v.id === item.refId) : null;
        const pin = item.refType === 'pin' ? pins.find((p) => p.id === item.refId) : null;
        return (
          <div
            key={item.id}
            draggable
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={() => { if (dragIdx !== null) { reorderAgenda(dragIdx, idx); setDragIdx(null); } }}
            className="rounded border border-white/10 bg-white/5 p-2 flex items-start gap-2"
          >
            <div className="flex flex-col items-center pt-1">
              <GripVertical size={12} className="text-gray-600 cursor-grab" />
              <span className="text-[9px] font-mono text-gray-500 tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
            </div>
            <div className="flex-1 min-w-0">
              <input
                value={item.title}
                onChange={(e) => updateAgendaItem(item.id, { title: e.target.value })}
                className="w-full bg-transparent text-xs font-bold outline-none"
              />
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] font-mono uppercase tracking-wider text-gray-500">
                  {item.refType === 'viewpoint' && vp && <>↻ Viewpoint: {vp.label}</>}
                  {item.refType === 'pin' && pin && <>📍 Pin: {pin.label}</>}
                  {item.refType === 'topic' && <>· Topic</>}
                </span>
                {vp && (
                  <button onClick={() => onJumpViewpoint(vp)} className="text-[9px] font-bold uppercase text-emerald-400 hover:text-emerald-300">Jump</button>
                )}
                {pin && (
                  <button onClick={() => onSelectPin(pin.id)} className="text-[9px] font-bold uppercase text-emerald-400 hover:text-emerald-300">Show</button>
                )}
              </div>
            </div>
            <button onClick={() => removeAgendaItem(item.id)} className="text-gray-500 hover:text-red-400">
              <X size={14} />
            </button>
          </div>
        );
      })}

      {/* Add controls */}
      <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Add to agenda</div>
        {viewpoints.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-[10px] text-gray-500">From viewpoints:</div>
            {viewpoints.map((v) => (
              <button
                key={v.id}
                onClick={() => addAgendaItem({ title: v.label, refType: 'viewpoint', refId: v.id })}
                className="text-left text-xs px-2 py-1 rounded bg-white/5 hover:bg-emerald-500/10 hover:text-emerald-200 transition-colors"
              >
                + {v.label}
              </button>
            ))}
          </div>
        )}
        {pins.length > 0 && (
          <div className="flex flex-col gap-1 mt-1">
            <div className="text-[10px] text-gray-500">From pins:</div>
            {pins.map((p) => (
              <button
                key={p.id}
                onClick={() => addAgendaItem({ title: p.label, refType: 'pin', refId: p.id })}
                className="text-left text-xs px-2 py-1 rounded bg-white/5 hover:bg-emerald-500/10 hover:text-emerald-200 transition-colors"
              >
                + {p.label} {p.partName ? <span className="text-gray-500">({p.partName})</span> : null}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-1">
          <input
            value={topicTitle}
            onChange={(e) => setTopicTitle(e.target.value)}
            placeholder="Free topic"
            className="flex-1 bg-white/5 text-xs rounded px-2 py-1.5 border border-white/10 outline-none focus:border-emerald-400/40"
          />
          <button
            disabled={!topicTitle.trim()}
            onClick={() => { addAgendaItem({ title: topicTitle.trim(), refType: 'topic' }); setTopicTitle(''); }}
            className="px-2 py-1.5 rounded bg-white text-black text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
          </button>
        </div>
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

export default ReviewSetupPage;
