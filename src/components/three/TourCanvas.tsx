'use client';

import { useProgress } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Component, lazy, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Box3 } from 'three';
import { getPrerender } from '@/lib/prerender';
import { type DeviceProfile, detectDeviceProfile, pixelRatioCap, type QualityTier } from '@/lib/quality';
import { switchView, useTourStore } from '@/store/tourStore';
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
const CaptureBridge = lazy(() => import('./CaptureBridge'));

/** Pre-rendering always runs at full quality, whatever machine does it. */
const CAPTURE_PROFILE: DeviceProfile = { tier: 3, basicShadows: false, shadowMapSize: 2048 };

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

/** Mirrors the model download into the loading overlay, which knows nothing about the 3D loaders. */
function LoaderProgress() {
  const progress = useProgress((state) => state.progress) / 100;

  useEffect(() => {
    const { loading, setLoading } = useTourStore.getState();
    if (!loading.ready && progress > loading.progress) setLoading({ progress: Math.min(0.95, progress) });
  }, [progress]);

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

export default function TourCanvas({ tour, capture = false }: { tour: Tour; capture?: boolean }) {
  const profile = useMemo(() => (capture ? CAPTURE_PROFILE : detectDeviceProfile()), [capture]);
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

  // Last resort: a tour with pre-rendered frames falls back to them instead of failing.
  const fail = useCallback(
    (message: string) => {
      if (!capture && getPrerender(tour.id)) switchView('frames');
      else setLoading({ error: message });
    },
    [capture, tour.id, setLoading],
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
      fail(CONTEXT_LOST_MESSAGE);
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
  }, [restart, fail]);

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

  const handleRendererError = useCallback(() => fail(WEBGL_UNAVAILABLE_MESSAGE), [fail]);

  return (
    <RendererBoundary onError={handleRendererError}>
      {isMesh && <LoaderProgress />}
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
        {capture ? (
          <Suspense fallback={null}>
            <CaptureBridge tour={tour} />
          </Suspense>
        ) : (
          <PerformanceGovernor />
        )}
      </Canvas>
    </RendererBoundary>
  );
}
