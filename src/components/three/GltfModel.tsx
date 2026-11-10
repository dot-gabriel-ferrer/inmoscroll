'use client';

import { Bvh, useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect } from 'react';
import { Box3, type Material, type Mesh, type Object3D, type WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { assetUrl, publicUrl } from '@/lib/assets';
import { disposeObject3D } from '@/lib/dispose';
import { tourRuntime } from '@/store/tourStore';
import type { SceneTransform } from '@/types/tour';

const DRACO_PATH = publicUrl('/decoders/draco/');
const BASIS_PATH = publicUrl('/decoders/basis/');

/** Mounted <GltfModel> instances per URL; the last one out frees the GPU memory. */
const users = new Map<string, number>();

let ktx2: { loader: KTX2Loader; renderer: WebGLRenderer } | null = null;

function getKtx2Loader(renderer: WebGLRenderer): KTX2Loader {
  if (ktx2?.renderer !== renderer) {
    ktx2?.loader.dispose();
    ktx2 = { loader: new KTX2Loader().setTranscoderPath(BASIS_PATH).detectSupport(renderer), renderer };
  }
  return ktx2.loader;
}

interface GltfModelProps {
  url: string;
  transform?: SceneTransform;
  /** Load as an invisible proxy that only occludes annotations. */
  hidden?: boolean;
  onReady?: (shadowBounds: Box3) => void;
}

/**
 * GLB ingestion: Draco (worker pool), Meshopt and KTX2/Basis decoders are all wired up,
 * so any output of the optimisation pipeline loads. On unmount every geometry, material
 * and texture is disposed and the loader cache entry is cleared to return the VRAM.
 */
export function GltfModel({ url, transform, hidden = false, onReady }: GltfModelProps) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const src = assetUrl(url);
  const { scene } = useGLTF(src, DRACO_PATH, true, (loader) => {
    loader.setKTX2Loader(getKtx2Loader(gl) as unknown as Parameters<typeof loader.setKTX2Loader>[0]);
  });

  useLayoutEffect(() => {
    scene.updateMatrixWorld(true);
    const bounds = new Box3();
    const occluders: Object3D[] = [];
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as Material;
      const backdrop = mesh.name.startsWith('bg_');
      const solid = !material.transparent && !backdrop;
      mesh.castShadow = solid;
      mesh.receiveShadow = !backdrop;
      if (solid) {
        bounds.expandByObject(mesh);
        occluders.push(mesh);
      }
    });
    tourRuntime.occluders = occluders;
    onReady?.(bounds);
    invalidate();
    return () => {
      tourRuntime.occluders = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  useEffect(() => {
    users.set(src, (users.get(src) ?? 0) + 1);
    return () => {
      users.set(src, (users.get(src) ?? 1) - 1);
      // Deferred one tick: React StrictMode (and a tour switch that reuses the same
      // file) remounts immediately, and must find the model still alive.
      setTimeout(() => {
        if (users.get(src)) return;
        users.delete(src);
        disposeObject3D(scene);
        useGLTF.clear(src);
      }, 0);
    };
  }, [scene, src]);

  return (
    <group
      position={transform?.position}
      rotation={transform?.rotation}
      scale={transform?.scale ?? 1}
      visible={!hidden}
    >
      <Bvh firstHitOnly>
        <primitive object={scene} />
      </Bvh>
    </group>
  );
}
