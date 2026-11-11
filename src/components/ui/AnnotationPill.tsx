'use client';

import { useTourStore } from '@/store/tourStore';
import type { TourAnnotation } from '@/types/tour';

/** Selection state of one marker. Read outside `<Html>`, whose content lives in a separate React root. */
export function useAnnotationSelection(id: string) {
  const selected = useTourStore((state) => state.selectedAnnotation === id);
  const selectAnnotation = useTourStore((state) => state.selectAnnotation);
  return { selected, toggle: () => selectAnnotation(selected ? null : id) };
}

interface AnnotationPillProps {
  annotation: TourAnnotation;
  selected: boolean;
  onToggle: () => void;
  /** Set for markers whose visibility is known up front; live markers toggle the attribute per frame. */
  occluded?: boolean;
  register?: (element: HTMLDivElement | null) => void;
}

/** A spatial marker: a pill that expands into its detail text. Shared by the live and pre-rendered viewers. */
export function AnnotationPill({ annotation, selected, onToggle, occluded = true, register }: AnnotationPillProps) {
  return (
    <div ref={register} className="annotation" data-occluded={occluded} data-selected={selected}>
      <button type="button" className="annotation-pill" aria-expanded={selected} onClick={onToggle}>
        <span className="annotation-dot" aria-hidden />
        {annotation.label}
      </button>
      {selected && annotation.detail && <p className="annotation-detail">{annotation.detail}</p>}
    </div>
  );
}
