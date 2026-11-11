'use client';

import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import { AnnotationPill, useAnnotationSelection } from '@/components/ui/AnnotationPill';
import { useTourStore } from '@/store/tourStore';
import type { TourAnnotation } from '@/types/tour';
import { createOcclusionRaycaster, isOccluded } from './occlusion';

const point = new Vector3();

function Marker({ annotation, register }: { annotation: TourAnnotation; register: (el: HTMLDivElement | null) => void }) {
  const { selected, toggle } = useAnnotationSelection(annotation.id);

  return (
    <Html position={annotation.position} center zIndexRange={[20, 10]}>
      <AnnotationPill annotation={annotation} selected={selected} onToggle={toggle} register={register} />
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
  const raycaster = useMemo(() => createOcclusionRaycaster(), []);
  const invalidate = useThree((state) => state.invalidate);
  // <Html> re-targets itself when the canvas connects its events, which breaks its own
  // teardown if it was already mounted: wait for the connection before mounting markers.
  const connected = useThree((state) => Boolean(state.events.connected));

  useFrame(({ camera }) => {
    if (!chapter) return;
    for (const annotation of chapter.annotations) {
      const element = elements.current.get(annotation.id);
      if (!element) continue;
      const value = isOccluded(camera, point.set(...annotation.position), raycaster) ? 'true' : 'false';
      if (element.dataset.occluded !== value) element.dataset.occluded = value;
    }
  });

  if (!chapter || !connected) return null;
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
