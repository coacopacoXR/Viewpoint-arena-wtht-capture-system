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

export type AgendaRefType = 'viewpoint' | 'pin' | 'topic';

export interface AgendaItem {
  id: string;
  title: string;
  refType: AgendaRefType;
  refId?: string;        // viewpointId or pinId; undefined for free topics
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
  addAgendaItem: (item: Omit<AgendaItem, 'id'>) => string;
  updateAgendaItem: (id: string, patch: Partial<AgendaItem>) => void;
  removeAgendaItem: (id: string) => void;
  reorderAgenda: (fromIdx: number, toIdx: number) => void;
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
          // Cascade: drop agenda items pointing at the deleted viewpoint.
          agenda: s.draft.agenda.filter((a) => !(a.refType === 'viewpoint' && a.refId === id)),
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
          agenda: s.draft.agenda.filter((a) => !(a.refType === 'pin' && a.refId === id)),
        };
        return { draft: touch(next) };
      }),

      addAgendaItem: (item) => {
        const id = uid();
        set((s) => {
          if (!s.draft) return s;
          const next: ReviewDraft = {
            ...s.draft,
            agenda: [...s.draft.agenda, { id, ...item }],
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
    }),
    {
      name: 'vp_review_draft',
    },
  ),
);
