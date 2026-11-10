'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useState } from 'react';
import type { Box3 } from 'three';
import { detectDeviceProfile } from '@/lib/quality';
import { useTourStore } from '@/store/tourStore';
import type { Tour } from '@/types/tour';
import { Annotations } from './Annotations';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { GaussianSplats } from './GaussianSplats';
import { GltfModel } from './GltfModel';
import { PerformanceGovernor } from './PerformanceGovernor';
import { SceneEnvironment } from './SceneEnvironment';
import { SunLight } from './SunLight';

export default function TourCanvas({ tour }: { tour: Tour }) {
  const profile = useMemo(() => detectDeviceProfile(), []);
  const [shadowBounds, setShadowBounds] = useState<Box3 | null>(null);
  const setLoading = useTourStore((state) => state.setLoading);
  const isMesh = tour.scene.type === 'gltf';

  useEffect(() => {
    useTourStore.getState().setQuality(profile.tier);
  }, [profile]);

  return (
    <Canvas
      // Hard cap: 3x retina buffers cost battery and frames for no visible gain.
      dpr={Math.min(window.devicePixelRatio, 2)}
      // Render only when scroll, loading or UI state invalidates the frame.
      frameloop="demand"
      // Splats are display-referred already, so they bypass tone mapping.
      flat={!isMesh}
      shadows={isMesh ? (profile.basicShadows ? 'basic' : 'percentage') : false}
      gl={{ antialias: false, stencil: false, powerPreference: 'high-performance' }}
      camera={{ fov: tour.camera.fov, near: 0.1, far: 600, position: tour.camera.waypoints[0] }}
      resize={{ scroll: false, debounce: { scroll: 50, resize: 150 } }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          setLoading({ error: 'El dispositivo ha liberado la memoria gráfica. Recarga la página para continuar.' });
        });
      }}
    >
      <SceneEnvironment lighting={tour.lighting} lit={isMesh} />
      <CameraRig tour={tour} />
      <Suspense fallback={null}>
        {tour.scene.type === 'gltf' ? (
          <GltfModel
            url={tour.scene.url}
            transform={tour.scene.transform}
            onReady={(bounds) => {
              setShadowBounds(bounds);
              setLoading({ progress: 1, ready: true });
            }}
          />
        ) : (
          <>
            <GaussianSplats url={tour.scene.url} transform={tour.scene.transform} />
            {tour.scene.occluderUrl && <GltfModel url={tour.scene.occluderUrl} transform={tour.scene.transform} hidden />}
          </>
        )}
      </Suspense>
      <Annotations />
      {isMesh && (
        <>
          <SunLight lighting={tour.lighting} bounds={shadowBounds} mapSize={profile.shadowMapSize} />
          <Effects />
          <PerformanceGovernor />
        </>
      )}
    </Canvas>
  );
}
