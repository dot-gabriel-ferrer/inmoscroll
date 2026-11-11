'use client';

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Vector3 } from 'three';
import { chapterIndexAt } from '@/lib/chapters';
import type { GaussianSplatMesh } from '@/lib/splat/GaussianSplatMesh';
import { tourRuntime } from '@/store/tourRuntime';
import { useTourStore } from '@/store/tourStore';
import type { TimeOfDay, Tour } from '@/types/tour';
import { createOcclusionRaycaster, isOccluded } from './occlusion';

export interface CaptureApi {
  ready: () => boolean;
  /** Lighting moods worth rendering: only meshes are relit, splats carry baked light. */
  times: TimeOfDay[];
  setTime: (time: TimeOfDay) => void;
  /** Renders the tour at `progress` and returns the canvas as a data URL plus the marker placement. */
  frame: (progress: number, type: string, quality: number) => Promise<{ image: string; markers: number[] }>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Remote control used by `scripts/prerender-tours.mjs` (mounted only with `?capture`):
 * steps the tour to exact scroll positions and hands back each rendered frame.
 */
export default function CaptureBridge({ tour }: { tour: Tour }) {
  const get = useThree((state) => state.get);

  useEffect(() => {
    const raycaster = createOcclusionRaycaster();
    const point = new Vector3();
    const api: CaptureApi = {
      ready: () => useTourStore.getState().loading.ready && tourRuntime.settled(),
      times: tour.scene.type === 'gltf' ? ['day', 'night'] : ['day'],
      setTime: (time) => useTourStore.getState().setTimeOfDay(time),
      async frame(progress, type, quality) {
        useTourStore.getState().setProgress(progress);
        const { advance, gl, camera, scene } = get();
        const splats = scene.getObjectByProperty('type', 'GaussianSplatMesh') as GaussianSplatMesh | undefined;
        if (splats) {
          // Splats are sorted off-thread for the camera they were last drawn with. An empty
          // draw moves the camera and starts the sort; the real one waits for the order.
          const count = splats.geometry.instanceCount;
          splats.geometry.instanceCount = 0;
          advance(performance.now());
          splats.geometry.instanceCount = count;
          while (!splats.settled) await sleep(5);
        }
        advance(performance.now());
        // Same task as the render: the drawing buffer is still intact.
        const image = gl.domElement.toDataURL(type, quality);
        const markers: number[] = [];
        const chapter = tour.chapters[chapterIndexAt(tour.chapters, progress)];
        for (const annotation of chapter?.annotations ?? []) {
          const visible = !isOccluded(camera, point.set(...annotation.position), raycaster);
          point.project(camera);
          markers.push(Math.round((point.x + 1) * 5000) / 10000, Math.round((1 - point.y) * 5000) / 10000, visible ? 1 : 0);
        }
        return { image, markers };
      },
    };
    const host = window as unknown as { __inmoscrollCapture?: CaptureApi };
    host.__inmoscrollCapture = api;
    return () => {
      delete host.__inmoscrollCapture;
    };
  }, [get, tour]);

  return null;
}
