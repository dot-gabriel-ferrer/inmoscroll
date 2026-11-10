'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { type Box3, type DirectionalLight, Matrix4, Vector3 } from 'three';
import { useTourStore } from '@/store/tourStore';
import type { TourLighting } from '@/types/tour';

const corner = new Vector3();
const lightView = new Matrix4();
const up = new Vector3(0, 1, 0);

interface SunLightProps {
  lighting: TourLighting;
  /** World-space bounds of everything that casts shadows. */
  bounds: Box3 | null;
  mapSize: number;
}

/**
 * The only shadow-casting light of a tour: one directional "sun". Its orthographic
 * shadow frustum is fitted to the caster bounds for maximum texel density, and the
 * shadow map is rendered once and then frozen until the lighting changes.
 */
export function SunLight({ lighting, bounds, mapSize }: SunLightProps) {
  const light = useRef<DirectionalLight>(null);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const timeOfDay = useTourStore((state) => state.timeOfDay);
  const mood = lighting[timeOfDay];
  const direction = useMemo(() => new Vector3(...lighting.sunDirection).normalize(), [lighting.sunDirection]);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);

  useEffect(() => {
    const sun = light.current;
    if (!sun || !bounds || bounds.isEmpty()) return;
    const center = bounds.getCenter(new Vector3());
    const radius = bounds.getSize(new Vector3()).length() / 2;
    sun.position.copy(center).addScaledVector(direction, radius + 5);
    sun.target.position.copy(center);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();

    // Fit the orthographic frustum to the bounds as seen from the light.
    lightView.lookAt(sun.position, center, up).setPosition(sun.position).invert();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner
        .set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z)
        .applyMatrix4(lightView);
      minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y);
      minZ = Math.min(minZ, corner.z); maxZ = Math.max(maxZ, corner.z);
    }
    const margin = 0.25;
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = minX - margin;
    shadowCamera.right = maxX + margin;
    shadowCamera.bottom = minY - margin;
    shadowCamera.top = maxY + margin;
    shadowCamera.near = Math.max(0.1, -maxZ - margin);
    shadowCamera.far = -minZ + margin;
    shadowCamera.updateProjectionMatrix();
    sun.shadow.needsUpdate = true;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [bounds, direction, mapSize, gl, invalidate]);

  useEffect(() => {
    // Day/night switches re-render the frozen shadow map exactly once.
    if (light.current) light.current.shadow.needsUpdate = true;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [timeOfDay, gl, invalidate]);

  return (
    <directionalLight
      ref={light}
      castShadow
      color={mood.sunColor}
      intensity={mood.sun}
      shadow-mapSize={[mapSize, mapSize]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.03}
      shadow-autoUpdate={false}
    />
  );
}
