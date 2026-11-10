'use client';

import { Environment, Lightformer } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { useTourStore } from '@/store/tourStore';
import type { TourLighting } from '@/types/tour';

/**
 * Ambient lighting without extra shadow passes: a procedurally generated environment
 * map (no HDRI download) plus a hemisphere fill, both scaled by the time of day.
 */
export function SceneEnvironment({ lighting, lit }: { lighting: TourLighting; lit: boolean }) {
  const timeOfDay = useTourStore((state) => state.timeOfDay);
  const mood = lighting[timeOfDay];
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => invalidate(), [timeOfDay, invalidate]);

  return (
    <>
      <color attach="background" args={[mood.background]} />
      <fog attach="fog" args={[mood.background, 70, 380]} />
      {lit && (
        <>
          <hemisphereLight args={['#ffffff', '#b9a58e', 0.55 * mood.ambient]} />
          <Environment resolution={64} frames={1} environmentIntensity={0.75 * mood.ambient}>
            <color attach="background" args={['#8f959c']} />
            <Lightformer form="rect" intensity={3} color="#eaf2ff" position={[0, 2, 12]} scale={[30, 8, 1]} />
            <Lightformer form="rect" intensity={1.4} color="#fff4e6" position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
            <Lightformer form="rect" intensity={0.6} color="#d8c7b2" position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[20, 20, 1]} />
            <Lightformer form="rect" intensity={0.8} color="#ffffff" position={[0, 2, -12]} rotation-y={Math.PI} scale={[30, 8, 1]} />
          </Environment>
        </>
      )}
    </>
  );
}
