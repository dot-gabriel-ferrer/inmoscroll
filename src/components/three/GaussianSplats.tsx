'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Group } from 'three';
import { assetUrl } from '@/lib/assets';
import { GaussianSplatMesh } from '@/lib/splat/GaussianSplatMesh';
import { tourRuntime } from '@/store/tourRuntime';
import { useTourStore } from '@/store/tourStore';
import type { SceneTransform } from '@/types/tour';

interface GaussianSplatsProps {
  url: string;
  transform?: SceneTransform;
}

/**
 * Radiance-field ingestion (.spz / .ksplat / .splat). A dedicated worker downloads,
 * decodes and depth-sorts the cloud; because the mesh lives in the same scene graph as
 * the camera rig it follows the ScrollTrigger timeline like any other tour.
 */
export function GaussianSplats({ url, transform }: GaussianSplatsProps) {
  const invalidate = useThree((state) => state.invalidate);
  const group = useRef<Group>(null);

  useEffect(() => {
    const { setLoading } = useTourStore.getState();
    const worker = new Worker(new URL('../../lib/splat/splat.worker.ts', import.meta.url), { type: 'module' });
    const src = new URL(assetUrl(url), window.location.href).href;
    const instance = new GaussianSplatMesh(worker, src, {
      onProgress: (loaded, total) => setLoading({ progress: total > 0 ? Math.min(0.95, loaded / total) : 0 }),
      onLoad: () => setLoading({ progress: 1, ready: true }),
      onError: (message) => setLoading({ error: message }),
      onSorted: () => invalidate(),
    });
    const parent = group.current;
    parent?.add(instance);
    tourRuntime.settled = () => instance.settled;
    return () => {
      tourRuntime.settled = () => true;
      parent?.remove(instance);
      instance.dispose();
    };
  }, [url, invalidate]);

  return <group ref={group} position={transform?.position} rotation={transform?.rotation} scale={transform?.scale ?? 1} />;
}
