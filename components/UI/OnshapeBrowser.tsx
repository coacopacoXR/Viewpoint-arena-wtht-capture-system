import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import {
  X, Search, Loader2, Box, Layers, ChevronLeft, LogOut, ExternalLink,
} from 'lucide-react';
import {
  getCurrentOnshapeUser, listOnshapeDocuments, listOnshapeElements,
  fetchOnshapeGltf, startOnshapeSignIn, signOutOnshape,
  type OnshapeUser, type OnshapeDocument, type OnshapeElement,
} from '../../lib/onshape';

interface Props {
  onClose: () => void;
  onImported: (file: File) => void;
}

type Step = 'auth' | 'documents' | 'elements' | 'loading';

const OnshapeBrowser: React.FC<Props> = ({ onClose, onImported }) => {
  const [user, setUser] = useState<OnshapeUser | null | undefined>(undefined);
  const [step, setStep] = useState<Step>('auth');
  const [query, setQuery] = useState('');
  const [documents, setDocuments] = useState<OnshapeDocument[] | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<OnshapeDocument | null>(null);
  const [elements, setElements] = useState<OnshapeElement[] | null>(null);
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

  // Load documents on first entry / search change.
  useEffect(() => {
    if (step !== 'documents') return;
    let cancelled = false;
    setDocuments(null);
    const handle = setTimeout(async () => {
      const docs = await listOnshapeDocuments(query);
      if (!cancelled) setDocuments(docs);
    }, query ? 300 : 0);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [step, query]);

  const openDocument = async (doc: OnshapeDocument) => {
    if (!doc.defaultWorkspaceId) {
      setError('Document has no default workspace.');
      return;
    }
    setSelectedDoc(doc);
    setElements(null);
    setStep('elements');
    const els = await listOnshapeElements(doc.id, doc.defaultWorkspaceId);
    setElements(els);
  };

  const importElement = async (el: OnshapeElement) => {
    if (!selectedDoc?.defaultWorkspaceId) return;
    setError(null);
    setStep('loading');
    setLoadingMsg(`Translating ${el.name} to GLTF…`);
    try {
      const file = await fetchOnshapeGltf(
        selectedDoc.id, selectedDoc.defaultWorkspaceId, el.id, el.type,
      );
      setLoadingMsg('Parsing model…');
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
              <div className="px-4 py-2.5 border-b border-white/5 sticky top-0 bg-[#0f0f10]/95 backdrop-blur-sm z-10 flex items-center gap-2">
                <Search size={13} className="text-white/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your documents…"
                  autoFocus
                  className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-white/30"
                />
              </div>
              <div className="px-2 py-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {documents === null && (
                  <div className="col-span-full py-12 text-center text-white/40 text-[11px]">
                    <Loader2 size={18} className="mx-auto mb-2 animate-spin" />
                    Loading documents…
                  </div>
                )}
                {documents && documents.length === 0 && (
                  <div className="col-span-full py-10 text-center text-white/40 text-[11px] italic">
                    {query ? 'No matches' : 'No documents in your Onshape account yet.'}
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
                  </div>
                )}
                {elements?.map((el) => (
                  <button
                    key={el.id}
                    onClick={() => importElement(el)}
                    className="text-left rounded border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-emerald-400/40 transition-all p-2 flex items-center gap-2"
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
                ))}
              </div>
            </div>
          )}

          {step === 'loading' && (
            <div className="px-8 py-16 text-center">
              <Loader2 size={28} className="mx-auto text-emerald-400 animate-spin" />
              <div className="text-[13px] text-white mt-4 font-bold">{loadingMsg || 'Loading…'}</div>
              <div className="text-[11px] text-white/40 mt-1">Large assemblies may take 10–30 seconds.</div>
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
