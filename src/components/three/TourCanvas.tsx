'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { Component, lazy, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Box3 } from 'three';
import { detectDeviceProfile, pixelRatioCap, type QualityTier } from '@/lib/quality';
import { useTourStore } from '@/store/tourStore';
import type { Tour } from '@/types/tour';
import { Annotations } from './Annotations';
import { CameraRig } from './CameraRig';
import { GaussianSplats } from './GaussianSplats';
import { GltfModel } from './GltfModel';
import { PerformanceGovernor } from './PerformanceGovernor';
import { SceneEnvironment } from './SceneEnvironment';
import { SunLight } from './SunLight';

// Tier 1 devices and splat tours never download or parse the post-processing code.
const Effects = lazy(() => import('./Effects'));

/** Context losses tolerated in quick succession before giving up. */
const MAX_RECOVERIES = 2;
/** A session that survives this long is considered healthy again. */
const STABLE_MS = 30_000;

const CONTEXT_LOST_MESSAGE = 'El dispositivo ha liberado la memoria gráfica. Recarga la página para continuar.';
const WEBGL_UNAVAILABLE_MESSAGE = 'No se pudo iniciar el motor 3D en este dispositivo. Cierra otras pestañas o aplicaciones y vuelve a intentarlo.';

/**
 * Reports the loss of the live WebGL context. The listener is removed on unmount, before
 * React Three Fiber deliberately loses the context to free it, so a tour that was left
 * behind can never report a failure into the next one.
 */
function ContextLossGuard({ onLost }: { onLost: () => void }) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleLost = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    canvas.addEventListener('webglcontextlost', handleLost);
    return () => canvas.removeEventListener('webglcontextlost', handleLost);
  }, [gl, onLost]);

  return null;
}

/** Turns a renderer that cannot start (no WebGL, GPU process gone) into the tour's error screen. */
class RendererBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function TourCanvas({ tour }: { tour: Tour }) {
  const profile = useMemo(() => detectDeviceProfile(), []);
  const [shadowBounds, setShadowBounds] = useState<Box3 | null>(null);
  // Bumped to rebuild the renderer on a fresh WebGL context after the old one is lost.
  const [session, setSession] = useState(0);
  const [lowMemory, setLowMemory] = useState(false);
  const [awaitingVisible, setAwaitingVisible] = useState(false);
  const recovery = useRef({ count: 0, at: 0 });
  const setLoading = useTourStore((state) => state.setLoading);
  const isMesh = tour.scene.type === 'gltf';
  // The store starts at the top tier until the effect below runs; never exceed the device's own.
  const quality = Math.min(useTourStore((state) => state.quality), profile.tier) as QualityTier;

  useEffect(() => {
    useTourStore.getState().setQuality(profile.tier);
  }, [profile]);

  useEffect(() => {
    // Lets the interface shed its own GPU cost (backdrop blur) on the lowest tier.
    document.documentElement.dataset.quality = String(quality);
    return () => {
      delete document.documentElement.dataset.quality;
    };
  }, [quality]);

  // Context attributes are fixed for the lifetime of a context, i.e. per session.
  const contextAttributes = useMemo(
    () => ({
      // Splats are blended in sorted order and never write depth.
      depth: isMesh,
      stencil: false,
      // Post-processing brings its own anti-aliasing; only devices that start without it
      // (tier 1) get multisampling, which mobile GPUs resolve almost for free.
      antialias: isMesh && profile.tier === 1 && !lowMemory,
      powerPreference: profile.tier === 3 && !lowMemory ? ('high-performance' as const) : ('default' as const),
    }),
    [isMesh, profile, lowMemory],
  );

  const restart = useCallback(() => {
    recovery.current.at = performance.now();
    setShadowBounds(null);
    setLoading({ progress: 0, ready: false });
    setSession((value) => value + 1);
  }, [setLoading]);

  const handleContextLost = useCallback(() => {
    const state = recovery.current;
    if (performance.now() - state.at > STABLE_MS) state.count = 0;
    if (state.count >= MAX_RECOVERIES) {
      setLoading({ error: CONTEXT_LOST_MESSAGE });
      return;
    }
    state.count += 1;
    if (document.visibilityState === 'visible') {
      // Lost in plain sight: the GPU ran out of memory, so come back lighter.
      useTourStore.getState().degradeQuality();
      setLowMemory(true);
      restart();
    } else {
      // Browsers reclaim the context of background tabs; rebuild once the tab is back.
      setAwaitingVisible(true);
    }
  }, [restart, setLoading]);

  useEffect(() => {
    if (!awaitingVisible) return;
    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      setAwaitingVisible(false);
      restart();
    };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, [awaitingVisible, restart]);

  const handleRendererError = useCallback(() => setLoading({ error: WEBGL_UNAVAILABLE_MESSAGE }), [setLoading]);

  return (
    <RendererBoundary onError={handleRendererError}>
      <Canvas
        key={session}
        // Resolution follows the quality tier; see pixelRatioCap.
        dpr={Math.min(window.devicePixelRatio, pixelRatioCap(quality, tour.scene.type, lowMemory))}
        // Render only when scroll, loading or UI state invalidates the frame.
        frameloop="demand"
        // Splats are display-referred already, so they bypass tone mapping.
        flat={!isMesh}
        shadows={isMesh ? (profile.basicShadows ? 'basic' : 'percentage') : false}
        gl={contextAttributes}
        camera={{ fov: tour.camera.fov, near: 0.1, far: 600, position: tour.camera.waypoints[0] }}
        resize={{ scroll: false, debounce: { scroll: 50, resize: 150 } }}
      >
        <ContextLossGuard onLost={handleContextLost} />
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
        {isMesh && <SunLight lighting={tour.lighting} bounds={shadowBounds} mapSize={lowMemory ? 1024 : profile.shadowMapSize} />}
        {isMesh && quality >= 2 && (
          <Suspense fallback={null}>
            <Effects quality={quality as 2 | 3} />
          </Suspense>
        )}
        <PerformanceGovernor />
      </Canvas>
    </RendererBoundary>
  );
}
