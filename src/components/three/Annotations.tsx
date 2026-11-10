'use client';

import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Raycaster, Vector3 } from 'three';
import { tourRuntime, useTourStore } from '@/store/tourStore';
import type { TourAnnotation } from '@/types/tour';

/** Markers closer than this to a surface are considered to sit on it, not behind it. */
const SURFACE_TOLERANCE = 0.12;

const direction = new Vector3();
const forward = new Vector3();
const point = new Vector3();

function Marker({ annotation, register }: { annotation: TourAnnotation; register: (el: HTMLDivElement | null) => void }) {
  const selected = useTourStore((state) => state.selectedAnnotation === annotation.id);
  const selectAnnotation = useTourStore((state) => state.selectAnnotation);

  return (
    <Html position={annotation.position} center zIndexRange={[20, 10]}>
      <div ref={register} className="annotation" data-occluded="true" data-selected={selected}>
        <button
          type="button"
          className="annotation-pill"
          aria-expanded={selected}
          onClick={() => selectAnnotation(selected ? null : annotation.id)}
        >
          <span className="annotation-dot" aria-hidden />
          {annotation.label}
        </button>
        {selected && annotation.detail && <p className="annotation-detail">{annotation.detail}</p>}
      </div>
    </Html>
  );
}

/**
 * Spatial annotations rendered as DOM nodes anchored in the scene. Content and position
 * come from the tour JSON tree in the store. On every rendered frame a ray is cast from
 * the camera to each visible marker (BVH-accelerated); markers behind the camera or hidden by opaque geometry fade
 * out through a CSS opacity transition.
 */
export function Annotations() {
  const chapter = useTourStore((state) => state.tour?.chapters[state.activeChapter]);
  const elements = useRef(new Map<string, HTMLDivElement>());
  const raycaster = useMemo(() => {
    const instance = new Raycaster();
    (instance as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
    return instance;
  }, []);
  const invalidate = useThree((state) => state.invalidate);

  useFrame(({ camera }) => {
    if (!chapter) return;
    camera.getWorldDirection(forward);
    for (const annotation of chapter.annotations) {
      const element = elements.current.get(annotation.id);
      if (!element) continue;
      point.set(...annotation.position);
      direction.copy(point).sub(camera.position);
      const distance = direction.length();
      direction.divideScalar(distance || 1);

      let occluded = direction.dot(forward) < 0.2;
      if (!occluded && tourRuntime.occluders.length > 0) {
        raycaster.set(camera.position, direction);
        raycaster.near = 0;
        raycaster.far = Math.max(0, distance - SURFACE_TOLERANCE);
        occluded = raycaster.intersectObjects(tourRuntime.occluders, false).length > 0;
      }
      const value = occluded ? 'true' : 'false';
      if (element.dataset.occluded !== value) element.dataset.occluded = value;
    }
  });

  if (!chapter) return null;
  return (
    <>
      {chapter.annotations.map((annotation) => (
        <Marker
          key={annotation.id}
          annotation={annotation}
          register={(element) => {
            if (element) {
              elements.current.set(annotation.id, element);
              // <Html> mounts its content in a separate React root, after this tree
              // commits; markers start hidden and need a frame to be evaluated.
              invalidate();
            } else elements.current.delete(annotation.id);
          }}
        />
      ))}
    </>
  );
}
