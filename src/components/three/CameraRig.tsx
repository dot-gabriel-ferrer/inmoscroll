'use client';

import { useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { MathUtils, type PerspectiveCamera } from 'three';
import { CameraPath, cardSideAt, createPose } from '@/lib/cameraPath';
import { tourRuntime, useTourStore } from '@/store/tourStore';
import type { Tour } from '@/types/tour';

gsap.registerPlugin(ScrollTrigger);

export const SCROLL_TRACK_ID = 'tour-scroll-track';

/** Matches the `sm:` breakpoint where the chapter card moves from the bottom to the side. */
const WIDE_BREAKPOINT = 640;
/** Principal point offset as a fraction of the viewport. */
const CARD_SHIFT = 0.11;
const MIN_HORIZONTAL_FOV = 50;
const MAX_VERTICAL_FOV = 82;

/**
 * Binds scroll progress to the camera rail. ScrollTrigger scrubs a 0..1 value, each
 * change invalidates the on-demand canvas, and the pose is applied inside useFrame so
 * the camera only moves in lockstep with a rendered frame.
 */
export function CameraRig({ tour }: { tour: Tour }) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const path = useMemo(() => new CameraPath(tour), [tour]);
  const pose = useMemo(() => createPose(), []);

  const size = useThree((state) => state.size);

  const applyPose = (progress: number) => {
    path.sample(progress, pose);
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);

    // Shift the principal point away from the floating card so the subject stays in
    // the clear part of the frame: sideways on wide screens (following the card's
    // side), upwards on narrow ones where the card docks at the bottom.
    const wide = size.width >= WIDE_BREAKPOINT;
    const shiftX = wide ? CARD_SHIFT * cardSideAt(tour.chapters, progress) : 0;
    const shiftY = wide ? 0 : CARD_SHIFT;
    const offsetX = Math.round(shiftX * size.width);
    const offsetY = Math.round(shiftY * size.height);
    const perspective = camera as PerspectiveCamera;
    const view = perspective.view;
    if (!view || view.offsetX !== offsetX || view.offsetY !== offsetY || view.fullWidth !== size.width || view.fullHeight !== size.height) {
      perspective.setViewOffset(size.width, size.height, offsetX, offsetY, size.width, size.height);
    }
    tourRuntime.focus = pose.focus;
    if (pose.focusPoint) tourRuntime.focusPoint.copy(pose.focusPoint);
  };

  useLayoutEffect(() => {
    // Portrait screens would crop the room to a sliver: widen the vertical field of
    // view until the horizontal one reaches a comfortable minimum.
    const perspective = camera as PerspectiveCamera;
    const aspect = size.width / size.height;
    const minVertical = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(MIN_HORIZONTAL_FOV) / 2) / aspect));
    perspective.fov = Math.min(MAX_VERTICAL_FOV, Math.max(tour.camera.fov, minVertical));
    perspective.updateProjectionMatrix();
    applyPose(useTourStore.getState().progress);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, size, tour.camera.fov]);

  useEffect(() => {
    const track = document.getElementById(SCROLL_TRACK_ID);
    if (!track) return;
    const state = { value: 0 };
    const tween = gsap.to(state, {
      value: 1,
      ease: 'none',
      scrollTrigger: { trigger: track, start: 'top top', end: 'bottom bottom', scrub: tour.camera.scrub },
      onUpdate: () => {
        useTourStore.getState().setProgress(state.value);
        invalidate();
      },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [tour.camera.scrub, invalidate]);

  useFrame(() => applyPose(useTourStore.getState().progress));

  return null;
}
