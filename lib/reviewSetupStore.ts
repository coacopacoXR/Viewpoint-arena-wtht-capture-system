import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModelType } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReviewViewpoint {
  id: string;
  label: string;
  position: [number, number, number];
  lookAt: [number, number, number];
  thumbnail?: string; // dataUrl
  notes?: string;
  createdAt: number;
}

export type PinSeverity = 'info' | 'concern' | 'blocker';

export interface ReviewPin {
  id: string;
  label: string;
  notes?: string;
  worldPos: [number, number, number];
  modelId?: string | null;
  meshIndex?: string | null;
  partName?: string | null;
  severity: PinSeverity;
  createdAt: number;
}

export interface AgendaItem {
  id: string;
  title: string;
  notes?: string;        // speaker notes written at curation time
  followUp?: string;     // notes added live during the meeting by the manager
  viewpointIds: string[];
  pinIds: string[];
  durationMinutes?: number;
}

export interface ReviewAssetReference {
  id: string;
  name: string;
  url?: string;          // external link (spec sheet, prior version)
  // intentionally NOT storing file contents here in v1 — only metadata
}

export interface ReviewAsset {
  modelType: ModelType;
  importedFileBase64?: string;
  importedFileName?: string;
  references: ReviewAssetReference[];
}

export interface ReviewDraft {
  reviewId: string;
  title: string;
  description: string;
  asset: ReviewAsset;
  viewpoints: ReviewViewpoint[];
  pins: ReviewPin[];
  agenda: AgendaItem[];
  createdAt: number;
  updatedAt: number;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ReviewSetupState {
  draft: ReviewDraft | null;

  // Lifecycle
  startNewDraft: (reviewId: string) => void;
  loadDraft: (reviewId: string) => boolean; // returns true if a draft was loaded
  hydrateDraft: (draft: ReviewDraft) => void; // adopt a remote/loaded draft
  discardDraft: () => void;

  // Title / description
  setTitle: (title: string) => void;
  setDescription: (desc: string) => void;

  // Asset
  setModelType: (modelType: ModelType) => void;
  setImportedFile: (fileName: string, base64: string) => void;
  clearImportedFile: () => void;
  addReference: (ref: Omit<ReviewAssetReference, 'id'>) => void;
  removeReference: (id: string) => void;

  // Viewpoints
  addViewpoint: (vp: Omit<ReviewViewpoint, 'id' | 'createdAt'>) => string; // returns id
  updateViewpoint: (id: string, patch: Partial<ReviewViewpoint>) => void;
  removeViewpoint: (id: string) => void;

  // Pins
  addPin: (pin: Omit<ReviewPin, 'id' | 'createdAt'>) => string;
  updatePin: (id: string, patch: Partial<ReviewPin>) => void;
  removePin: (id: string) => void;

  // Agenda
  addAgendaItem: (item: Omit<AgendaItem, 'id' | 'viewpointIds' | 'pinIds'> & Partial<Pick<AgendaItem, 'viewpointIds' | 'pinIds'>>) => string;
  updateAgendaItem: (id: string, patch: Partial<AgendaItem>) => void;
  removeAgendaItem: (id: string) => void;
  reorderAgenda: (fromIdx: number, toIdx: number) => void;
  attachViewpointToAgendaItem: (itemId: string, viewpointId: string) => void;
  detachViewpointFromAgendaItem: (itemId: string, viewpointId: string) => void;
  attachPinToAgendaItem: (itemId: string, pinId: string) => void;
  detachPinFromAgendaItem: (itemId: string, pinId: string) => void;
}

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2);

const emptyDraft = (reviewId: string): ReviewDraft => ({
  reviewId,
  title: 'Untitled Review',
  description: '',
  asset: {
    modelType: 'headphones',
    references: [],
  },
  viewpoints: [],
  pins: [],
  agenda: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const touch = (draft: ReviewDraft): ReviewDraft => ({ ...draft, updatedAt: Date.now() });

export const useReviewSetupStore = create<ReviewSetupState>()(
  persist(
    (set, get) => ({
      draft: null,

      startNewDraft: (reviewId) => set({ draft: emptyDraft(reviewId) }),

      loadDraft: (reviewId) => {
        const current = get().draft;
        if (current && current.reviewId === reviewId) return true;
        // No draft cached for this id — caller should call startNewDraft.
        return false;
      },

      // Adopt a draft loaded from the cloud. Preserves any local
      // importedFileBase64 if the same id is already in memory (the cloud
      // copy strips the blob — see curationsRepo for context).
      hydrateDraft: (incoming) => set((s) => {
        const local = s.draft && s.draft.reviewId === incoming.reviewId ? s.draft : null;
        const preservedAsset = local?.asset.importedFileBase64
          ? { ...incoming.asset, importedFileBase64: local.asset.importedFileBase64, importedFileName: local.asset.importedFileName }
          : incoming.asset;
        return { draft: { ...incoming, asset: preservedAsset } };
      }),

      discardDraft: () => set({ draft: null }),

      setTitle: (title) => set((s) => s.draft ? { draft: touch({ ...s.draft, title }) } : s),
      setDescription: (description) => set((s) => s.draft ? { draft: touch({ ...s.draft, description }) } : s),

      setModelType: (modelType) => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          asset: { ...s.draft.asset, modelType },
        };
        return { draft: touch(next) };
      }),

      setImportedFile: (importedFileName, importedFileBase64) => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          asset: {
            ...s.draft.asset,
            modelType: 'imported',
            importedFileName,
            importedFileBase64,
          },
        };
        return { draft: touch(next) };
      }),

      clearImportedFile: () => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          asset: {
            modelType: s.draft.asset.modelType === 'imported' ? 'headphones' : s.draft.asset.modelType,
            references: s.draft.asset.references,
          },
        };
        return { draft: touch(next) };
      }),

      addReference: (ref) => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          asset: {
            ...s.draft.asset,
            references: [...s.draft.asset.references, { id: uid(), ...ref }],
          },
        };
        return { draft: touch(next) };
      }),

      removeReference: (id) => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          asset: {
            ...s.draft.asset,
            references: s.draft.asset.references.filter((r) => r.id !== id),
          },
        };
        return { draft: touch(next) };
      }),

      addViewpoint: (vp) => {
        const id = uid();
        set((s) => {
          if (!s.draft) return s;
          const next: ReviewDraft = {
            ...s.draft,
            viewpoints: [...s.draft.viewpoints, { id, createdAt: Date.now(), ...vp }],
          };
          return { draft: touch(next) };
        });
        return id;
      },

      updateViewpoint: (id, patch) => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          viewpoints: s.draft.viewpoints.map((v) => v.id === id ? { ...v, ...patch } : v),
        };
        return { draft: touch(next) };
      }),

      removeViewpoint: (id) => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          viewpoints: s.draft.viewpoints.filter((v) => v.id !== id),
          // Cascade: drop the viewpoint reference from every slide that linked it.
          agenda: s.draft.agenda.map((a) => ({
            ...a,
            viewpointIds: a.viewpointIds.filter((vid) => vid !== id),
          })),
        };
        return { draft: touch(next) };
      }),

      addPin: (pin) => {
        const id = uid();
        set((s) => {
          if (!s.draft) return s;
          const next: ReviewDraft = {
            ...s.draft,
            pins: [...s.draft.pins, { id, createdAt: Date.now(), ...pin }],
          };
          return { draft: touch(next) };
        });
        return id;
      },

      updatePin: (id, patch) => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          pins: s.draft.pins.map((p) => p.id === id ? { ...p, ...patch } : p),
        };
        return { draft: touch(next) };
      }),

      removePin: (id) => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          pins: s.draft.pins.filter((p) => p.id !== id),
          agenda: s.draft.agenda.map((a) => ({
            ...a,
            pinIds: a.pinIds.filter((pid) => pid !== id),
          })),
        };
        return { draft: touch(next) };
      }),

      addAgendaItem: (item) => {
        const id = uid();
        set((s) => {
          if (!s.draft) return s;
          const next: ReviewDraft = {
            ...s.draft,
            agenda: [
              ...s.draft.agenda,
              { id, viewpointIds: [], pinIds: [], ...item },
            ],
          };
          return { draft: touch(next) };
        });
        return id;
      },

      updateAgendaItem: (id, patch) => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          agenda: s.draft.agenda.map((a) => a.id === id ? { ...a, ...patch } : a),
        };
        return { draft: touch(next) };
      }),

      removeAgendaItem: (id) => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          agenda: s.draft.agenda.filter((a) => a.id !== id),
        };
        return { draft: touch(next) };
      }),

      reorderAgenda: (fromIdx, toIdx) => set((s) => {
        if (!s.draft) return s;
        const arr = [...s.draft.agenda];
        if (fromIdx < 0 || fromIdx >= arr.length || toIdx < 0 || toIdx >= arr.length) return s;
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        return { draft: touch({ ...s.draft, agenda: arr }) };
      }),

      attachViewpointToAgendaItem: (itemId, viewpointId) => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          agenda: s.draft.agenda.map((a) =>
            a.id === itemId && !a.viewpointIds.includes(viewpointId)
              ? { ...a, viewpointIds: [...a.viewpointIds, viewpointId] }
              : a,
          ),
        };
        return { draft: touch(next) };
      }),

      detachViewpointFromAgendaItem: (itemId, viewpointId) => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          agenda: s.draft.agenda.map((a) =>
            a.id === itemId
              ? { ...a, viewpointIds: a.viewpointIds.filter((id) => id !== viewpointId) }
              : a,
          ),
        };
        return { draft: touch(next) };
      }),

      attachPinToAgendaItem: (itemId, pinId) => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          agenda: s.draft.agenda.map((a) =>
            a.id === itemId && !a.pinIds.includes(pinId)
              ? { ...a, pinIds: [...a.pinIds, pinId] }
              : a,
          ),
        };
        return { draft: touch(next) };
      }),

      detachPinFromAgendaItem: (itemId, pinId) => set((s) => {
        if (!s.draft) return s;
        const next: ReviewDraft = {
          ...s.draft,
          agenda: s.draft.agenda.map((a) =>
            a.id === itemId
              ? { ...a, pinIds: a.pinIds.filter((id) => id !== pinId) }
              : a,
          ),
        };
        return { draft: touch(next) };
      }),
    }),
    {
      name: 'vp_review_draft',
      version: 1,
      // v0 → v1: agenda items moved from { refType, refId } to { viewpointIds, pinIds }.
      // Old single-ref items become slides with that one item attached.
      migrate: (persisted: any, fromVersion: number) => {
        if (!persisted?.draft || fromVersion >= 1) return persisted;
        const agenda = (persisted.draft.agenda ?? []).map((raw: any) => {
          if (Array.isArray(raw?.viewpointIds) && Array.isArray(raw?.pinIds)) return raw;
          const viewpointIds = raw?.refType === 'viewpoint' && raw?.refId ? [raw.refId] : [];
          const pinIds = raw?.refType === 'pin' && raw?.refId ? [raw.refId] : [];
          const { refType: _rt, refId: _ri, ...rest } = raw ?? {};
          return { ...rest, viewpointIds, pinIds };
        });
        return { ...persisted, draft: { ...persisted.draft, agenda } };
      },
    },
  ),
);
