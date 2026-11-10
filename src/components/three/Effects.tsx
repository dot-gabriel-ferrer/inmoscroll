'use client';

import { Bloom, DepthOfField, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { useFrame } from '@react-three/fiber';
import { type DepthOfFieldEffect, ToneMappingMode } from 'postprocessing';
import { useRef } from 'react';
import { HalfFloatType } from 'three';
import { tourRuntime, useTourStore } from '@/store/tourStore';

const MAX_BOKEH = 3.5;

/**
 * Cinematic post-processing merged into a single full-screen pass over HDR (half-float)
 * buffers: screen-space ambient occlusion, thresholded bloom, scroll-driven depth of
 * field and ACES Filmic tone mapping. Tiers drop depth of field, then occlusion.
 */
export function Effects() {
  const quality = useTourStore((state) => state.quality);
  const dof = useRef<DepthOfFieldEffect>(null);

  useFrame(() => {
    const effect = dof.current;
    if (!effect) return;
    // Aperture opens as the camera settles on the chapter's point of interest.
    effect.target = tourRuntime.focusPoint;
    effect.bokehScale = MAX_BOKEH * tourRuntime.focus;
  });

  const effects = [];
  if (quality >= 2) {
    effects.push(<N8AO key="ao" aoRadius={0.7} distanceFalloff={1} intensity={2.2} quality="medium" />);
  }
  effects.push(<Bloom key="bloom" mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.55} />);
  if (quality >= 3) {
    effects.push(<DepthOfField key="dof" ref={dof} worldFocusRange={3.2} bokehScale={0} resolutionScale={0.5} />);
  }
  effects.push(<ToneMapping key="tone" mode={ToneMappingMode.ACES_FILMIC} />);
  if (quality >= 2) effects.push(<SMAA key="smaa" />);

  return (
    <EffectComposer multisampling={0} frameBufferType={HalfFloatType} enableNormalPass={false}>
      {effects}
    </EffectComposer>
  );
}
