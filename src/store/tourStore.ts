import type { Object3D } from 'three';
import { Vector3 } from 'three';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chapterIndexAt } from '@/lib/cameraPath';
import type { QualityTier } from '@/lib/quality';
import type { TimeOfDay, Tour, TourAnnotation } from '@/types/tour';

interface LoadingState {
  progress: number;
  ready: boolean;
  error: string | null;
}

interface TourState {
  /** Immutable JSON tree describing the active tour (chapters -> annotations). */
  tour: Tour | null;
  progress: number;
  activeChapter: number;
  timeOfDay: TimeOfDay;
  quality: QualityTier;
  selectedAnnotation: string | null;
  cardDismissed: boolean;
  menuOpen: boolean;
  contactOpen: boolean;
  loading: LoadingState;

  setTour: (tour: Tour | null) => void;
  setProgress: (progress: number) => void;
  setTimeOfDay: (timeOfDay: TimeOfDay) => void;
  setQuality: (quality: QualityTier) => void;
  degradeQuality: () => void;
  selectAnnotation: (id: string | null) => void;
  dismissCard: (dismissed: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  setContactOpen: (open: boolean) => void;
  setLoading: (loading: Partial<LoadingState>) => void;
  /** Editor entry point: replaces one annotation without mutating the tree. */
  updateAnnotation: (chapterId: string, annotationId: string, patch: Partial<TourAnnotation>) => void;
}

const initialLoading: LoadingState = { progress: 0, ready: false, error: null };

export const useTourStore = create<TourState>()((set) => ({
  tour: null,
  progress: 0,
  activeChapter: 0,
  timeOfDay: 'day',
  quality: 3,
  selectedAnnotation: null,
  cardDismissed: false,
  menuOpen: false,
  contactOpen: false,
  loading: initialLoading,

  setTour: (tour) =>
    set((state) => {
      // Same tour, new data (an edit): keep the session, only swap the tree.
      if (tour && state.tour?.id === tour.id) return { tour };
      return {
        tour,
        progress: 0,
        activeChapter: 0,
        timeOfDay: 'day',
        selectedAnnotation: null,
        cardDismissed: false,
        menuOpen: false,
        contactOpen: false,
        loading: initialLoading,
      };
    }),
  setProgress: (progress) =>
    set((state) => {
      if (!state.tour) return { progress };
      const activeChapter = chapterIndexAt(state.tour.chapters, progress);
      if (activeChapter === state.activeChapter) return { progress };
      return { progress, activeChapter, selectedAnnotation: null, cardDismissed: false };
    }),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  setQuality: (quality) => set({ quality }),
  degradeQuality: () => set((state) => ({ quality: Math.max(1, state.quality - 1) as QualityTier })),
  selectAnnotation: (selectedAnnotation) => set({ selectedAnnotation }),
  dismissCard: (cardDismissed) => set({ cardDismissed }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  setContactOpen: (contactOpen) => set({ contactOpen }),
  setLoading: (loading) => set((state) => ({ loading: { ...state.loading, ...loading } })),
  updateAnnotation: (chapterId, annotationId, patch) =>
    set((state) => {
      if (!state.tour) return state;
      return {
        tour: {
          ...state.tour,
          chapters: state.tour.chapters.map((chapter) =>
            chapter.id !== chapterId
              ? chapter
              : {
                  ...chapter,
                  annotations: chapter.annotations.map((a) => (a.id === annotationId ? { ...a, ...patch } : a)),
                },
          ),
        },
      };
    }),
}));

interface FavoritesState {
  ids: string[];
  toggle: (id: string) => void;
}

export const useFavorites = create<FavoritesState>()(
  persist(
    (set) => ({
      ids: [],
      toggle: (id) =>
        set((state) => ({ ids: state.ids.includes(id) ? state.ids.filter((x) => x !== id) : [...state.ids, id] })),
    }),
    { name: 'inmoscroll-favorites' },
  ),
);

/**
 * Per-frame values shared between scene components. Kept outside React state on
 * purpose: they change every rendered frame and must never trigger re-renders.
 */
export const tourRuntime = {
  /** 0..1 weight of the active chapter's point of interest. */
  focus: 0,
  focusPoint: new Vector3(),
  /** Opaque meshes that can hide annotations. */
  occluders: [] as Object3D[],
};
