import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chapterIndexAt } from '@/lib/chapters';
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

export type ViewMode = 'frames' | 'live';

interface ViewState {
  /** 'frames' plays the pre-rendered sequence; 'live' runs the real-time 3D engine. */
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
}

/** The visitor's choice of viewer, remembered across visits. Tours without a pre-render ignore it. */
export const useViewPreference = create<ViewState>()(
  persist((set) => ({ mode: 'frames', setMode: (mode) => set({ mode }) }), { name: 'inmoscroll-view' }),
);

/** Changes viewer mid-tour: the incoming one starts from a clean loading state. */
export function switchView(mode: ViewMode) {
  if (useViewPreference.getState().mode === mode) return;
  useViewPreference.getState().setMode(mode);
  useTourStore.setState({ loading: initialLoading });
}

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
