import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import {
  X, Search, Loader2, Box, Layers, ChevronLeft, LogOut, ExternalLink,
} from 'lucide-react';
import {
  getCurrentOnshapeUser, listOnshapeDocuments, listOnshapeElements,
  importOnshapeModel, startOnshapeSignIn, signOutOnshape,
  type OnshapeUser, type OnshapeDocument, type OnshapeElement, type OnshapeDocFilter,
} from '../../lib/onshape';

interface Props {
  onClose: () => void;
  onImported: (file: File) => void;
}

type Step = 'checking' | 'auth' | 'documents' | 'elements' | 'loading';

const OnshapeBrowser: React.FC<Props> = ({ onClose, onImported }) => {
  const [user, setUser] = useState<OnshapeUser | null | undefined>(undefined);
  // Start in 'checking' so we don't flash the Connect CTA at users who are
  // already signed in. The auth-status effect will flip us to 'auth' or
  // 'documents' once /api/onshape/me responds.
  const [step, setStep] = useState<Step>('checking');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<OnshapeDocFilter>('recent');
  const [documents, setDocuments] = useState<OnshapeDocument[] | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<OnshapeDocument | null>(null);
  const [elements, setElements] = useState<OnshapeElement[] | null>(null);
  const [allElementTypes, setAllElementTypes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState('');

  // On mount: check auth status. Show the doc list if signed in, else sign-in CTA.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await getCurrentOnshapeUser();
      if (cancelled) return;
      setUser(me);
      setStep(me ? 'documents' : 'auth');
    })();
    return () => { cancelled = true; };
  }, []);

  // Load documents on first entry / search / filter change.
  useEffect(() => {
    if (step !== 'documents') return;
    let cancelled = false;
    setDocuments(null);
    setDocsError(null);
    const handle = setTimeout(async () => {
      const { items, error } = await listOnshapeDocuments(query, filter);
      if (cancelled) return;
      setDocuments(items);
      setDocsError(error ?? null);
    }, query ? 300 : 0);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [step, query, filter]);

  const openDocument = async (doc: OnshapeDocument) => {
    if (!doc.defaultWorkspaceId) {
      setError('Document has no default workspace.');
      return;
    }
    setSelectedDoc(doc);
    setElements(null);
    setAllElementTypes([]);
    setStep('elements');
    const { items, allTypes } = await listOnshapeElements(doc.id, doc.defaultWorkspaceId);
    setElements(items);
    setAllElementTypes(allTypes);
  };

  const [loadingPhase, setLoadingPhase] = useState<'starting' | 'translating' | 'downloading'>('starting');
  const [loadingElapsed, setLoadingElapsed] = useState(0);

  const importElement = async (el: OnshapeElement) => {
    if (!selectedDoc?.defaultWorkspaceId) return;
    setError(null);
    setStep('loading');
    setLoadingMsg(el.name);
    setLoadingPhase('starting');
    setLoadingElapsed(0);
    try {
      const file = await importOnshapeModel(
        selectedDoc.id, selectedDoc.defaultWorkspaceId, el.id, el.type,
        (phase, elapsed) => { setLoadingPhase(phase); setLoadingElapsed(elapsed); },
      );
      onImported(file);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setStep('elements');
    }
  };

  const handleSignOut = async () => {
    await signOutOnshape();
    setUser(null);
    setStep('auth');
    setDocuments(null);
    setSelectedDoc(null);
    setElements(null);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#0f0f10] text-white w-full max-w-2xl rounded-lg shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-[#0f172a] via-[#134e4a] to-[#0f172a] shrink-0">
          <div className="flex items-center gap-2.5">
            {step === 'elements' && (
              <button onClick={() => { setStep('documents'); setElements(null); setSelectedDoc(null); }} className="text-white/50 hover:text-white p-1 rounded hover:bg-white/10 -ml-1">
                <ChevronLeft size={14} />
              </button>
            )}
            <OnshapeMark />
            <div className="flex flex-col">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/90">Import from Onshape</div>
              {step === 'elements' && selectedDoc && (
                <div className="text-[11px] text-white/60 truncate max-w-[300px]">{selectedDoc.name}</div>
              )}
              {user && step !== 'auth' && step !== 'elements' && (
                <div className="text-[11px] text-white/60 truncate max-w-[300px]">{user.name || user.email}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {user && step !== 'auth' && (
              <button onClick={handleSignOut} className="text-white/40 hover:text-white/90 px-2 py-1 rounded hover:bg-white/10 text-[10px] font-bold uppercase flex items-center gap-1" title="Sign out of Onshape">
                <LogOut size={11} /> Sign out
              </button>
            )}
            <button onClick={onClose} className="text-white/50 hover:text-white p-1 rounded hover:bg-white/10" title="Close">
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {step === 'checking' && (
            <div className="px-8 py-16 text-center">
              <Loader2 size={22} className="mx-auto text-emerald-400 animate-spin" />
              <div className="text-[12px] text-white/70 mt-3">Checking Onshape session…</div>
            </div>
          )}

          {step === 'auth' && (
            <div className="px-8 py-10 text-center">
              <OnshapeMark large />
              <h2 className="text-base font-bold mt-3 text-white">Sign in with Onshape</h2>
              <p className="text-[12px] text-white/60 mt-1.5 leading-relaxed max-w-sm mx-auto">
                Browse your Onshape documents and import any assembly or part studio as a curated review model. We only request read access — your data stays in Onshape.
              </p>
              <button
                onClick={() => startOnshapeSignIn()}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase tracking-wide transition-colors"
              >
                Connect Onshape <ExternalLink size={12} />
              </button>
              <p className="text-[10px] text-white/40 mt-3">
                You'll be redirected to Onshape to approve access.
              </p>
            </div>
          )}

          {step === 'documents' && (
            <div className="flex flex-col">
              <div className="px-4 py-2.5 border-b border-white/5 sticky top-0 bg-[#0f0f10]/95 backdrop-blur-sm z-10 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Search size={13} className="text-white/40" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search your documents…"
                    autoFocus
                    className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-white/30"
                  />
                </div>
                <div className="flex gap-0.5 text-[10px] font-bold uppercase tracking-wider">
                  {(['recent', 'mine', 'shared', 'public'] as OnshapeDocFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={clsx(
                        'px-2.5 py-1 rounded transition-colors',
                        filter === f
                          ? 'bg-emerald-500/20 text-emerald-200'
                          : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                      )}
                    >
                      {f === 'mine' ? 'My docs' : f === 'shared' ? 'Shared' : f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-2 py-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {documents === null && (
                  <div className="col-span-full py-12 text-center text-white/40 text-[11px]">
                    <Loader2 size={18} className="mx-auto mb-2 animate-spin" />
                    Loading documents…
                  </div>
                )}
                {docsError && (
                  <div className="col-span-full py-6 text-center text-red-300 text-[11px]">
                    Failed to load documents: {docsError}
                  </div>
                )}
                {documents && documents.length === 0 && !docsError && (
                  <div className="col-span-full py-10 text-center text-white/40 text-[11px] italic">
                    {query
                      ? 'No matches'
                      : filter === 'shared'
                        ? 'No documents have been shared with you.'
                        : filter === 'mine'
                          ? 'No documents owned by you yet.'
                          : filter === 'public'
                            ? 'No public documents found.'
                            : 'No recent documents.'}
                  </div>
                )}
                {documents?.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => openDocument(d)}
                    className="text-left rounded border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-emerald-400/40 transition-all p-2 flex items-center gap-2"
                  >
                    {d.thumbnail ? (
                      <img src={d.thumbnail} alt="" className="w-10 h-10 rounded object-cover bg-black/40" loading="lazy" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center"><Box size={16} className="text-white/40" /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold text-white truncate">{d.name}</div>
                      <div className="text-[10px] text-white/40 truncate">{new Date(d.modifiedAt).toLocaleDateString()}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'elements' && (
            <div className="flex flex-col">
              <div className="px-4 py-2 border-b border-white/5 text-[10px] font-bold uppercase tracking-widest text-white/40">
                Pick an assembly or part studio
              </div>
              <div className="px-2 py-2 flex flex-col gap-1">
                {elements === null && (
                  <div className="py-10 text-center text-white/40 text-[11px]">
                    <Loader2 size={18} className="mx-auto mb-2 animate-spin" />
                    Loading elements…
                  </div>
                )}
                {elements && elements.length === 0 && (
                  <div className="py-10 text-center text-white/40 text-[11px] italic">
                    This document has no assemblies or part studios.
                    {allElementTypes.length > 0 && (
                      <div className="mt-2 text-white/30 not-italic font-mono">
                        Element types found: {allElementTypes.join(', ')}
                      </div>
                    )}
                  </div>
                )}
                {elements?.map((el) => (
                  <div
                    key={el.id}
                    className="group flex items-center rounded border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-emerald-400/40 transition-all"
                  >
                    <button
                      onClick={() => importElement(el)}
                      className="text-left p-2 flex items-center gap-2 flex-1 min-w-0"
                    >
                      {el.thumbnail ? (
                        <img src={el.thumbnail} alt="" className="w-10 h-10 rounded object-cover bg-black/40" loading="lazy" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center">
                          {el.type === 'ASSEMBLY' ? <Layers size={16} className="text-emerald-400" /> : <Box size={16} className="text-blue-400" />}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-bold text-white truncate">{el.name}</div>
                        <div className="text-[10px] text-white/40 uppercase tracking-wider">
                          {el.type === 'ASSEMBLY' ? 'Assembly' : 'Part Studio'}
                        </div>
                      </div>
                    </button>
                    {selectedDoc?.defaultWorkspaceId && (
                      <a
                        href={`/api/onshape/debug-translate?d=${selectedDoc.id}&w=${selectedDoc.defaultWorkspaceId}&e=${el.id}&type=${el.type}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Diagnostic: try 9 different translation bodies and report which work (opens in new tab, takes ~30s)"
                        className="opacity-0 group-hover:opacity-100 text-[9px] font-bold uppercase tracking-wider text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/10 px-2 py-1 mr-2 rounded transition-all"
                      >
                        debug
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'loading' && (
            <div className="px-8 py-12 text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">Importing</div>
              <div className="text-[14px] text-white mt-1.5 font-bold truncate">{loadingMsg}</div>
              <div className="relative mt-5 mx-auto max-w-[280px] h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="absolute inset-y-0 w-1/3 rounded-full bg-emerald-400 animate-onshape-progress" />
              </div>
              <div className="text-[10px] text-white/50 mt-3 flex items-center justify-center gap-2">
                <span>
                  {loadingPhase === 'starting' && 'Starting…'}
                  {loadingPhase === 'translating' && 'Translating in Onshape…'}
                  {loadingPhase === 'downloading' && 'Downloading model…'}
                </span>
                {loadingElapsed > 0 && <span className="font-mono text-white/30">{loadingElapsed}s</span>}
              </div>
              <style>{`
                @keyframes onshape-progress {
                  0%   { transform: translateX(-100%); }
                  100% { transform: translateX(400%); }
                }
                .animate-onshape-progress {
                  animation: onshape-progress 1.4s ease-in-out infinite;
                }
              `}</style>
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 border-t border-red-500/30 bg-red-500/10 text-[11px] text-red-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

const OnshapeMark: React.FC<{ large?: boolean }> = ({ large }) => (
  <div
    className={clsx(
      'rounded flex items-center justify-center font-bold text-black bg-gradient-to-br from-emerald-300 to-emerald-500',
      large ? 'w-12 h-12 text-base mx-auto' : 'w-6 h-6 text-[9px]',
    )}
  >
    OS
  </div>
);

export default OnshapeBrowser;
