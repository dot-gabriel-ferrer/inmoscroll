'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { N8AOPostPass } from 'n8ao';
import {
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  FXAAEffect,
  MaskFunction,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import { useEffect, useRef } from 'react';
import { HalfFloatType } from 'three';
import { tourRuntime } from '@/store/tourRuntime';

const MAX_BOKEH = 3.5;

/** Two fixes n8ao 2.0 needs before its half-resolution mode is usable on three r187. */
function repairHalfResolution(occlusion: N8AOPostPass) {
  // The downsample target exposes `texture` as the attachment list, which three no
  // longer accepts: restore the stock accessor on the instance.
  const downsample = occlusion.depthDownsampleTarget;
  if (downsample && Array.isArray(downsample.texture)) {
    Object.defineProperty(downsample, 'texture', { get: () => downsample.textures[0] });
  }
  // The depth-aware upsample fetches texels past the top and right edges, which darkens
  // a two-pixel border: clamp the lookups.
  const material = occlusion.effectCompositerQuad.material;
  material.fragmentShader = material.fragmentShader.replace(
    /ivec2 p = ivec2\(\s*\(vUv \* resolution \* 0\.5\) \+ offset\s*\);/,
    'ivec2 p = clamp(ivec2((vUv * resolution * 0.5) + offset), ivec2(0), ivec2(resolution * 0.5) - 1);',
  );
  material.needsUpdate = true;
}

/**
 * Cinematic post-processing over HDR (half-float) buffers: screen-space ambient
 * occlusion, thresholded bloom, scroll-driven depth of field (tier 3 only) and ACES
 * Filmic tone mapping.
 *
 * The chain is assembled by hand to keep it lean: the scene is drawn once, occlusion is
 * computed at half resolution without the extra transparency renders, and the final
 * anti-aliasing pass is the only thing appended after tone mapping.
 */
export default function Effects({ quality }: { quality: 2 | 3 }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const chain = useRef<{ composer: EffectComposer; dof: DepthOfFieldEffect | null } | null>(null);
  const applied = useRef({ width: 0, height: 0, pixelRatio: 0 });

  useEffect(() => {
    const composer = new EffectComposer(gl, {
      stencilBuffer: false,
      multisampling: 0,
      frameBufferType: HalfFloatType,
    });

    composer.addPass(new RenderPass(scene, camera));

    const occlusion = new N8AOPostPass(scene, camera);
    occlusion.setQualityMode(quality === 3 ? 'Medium' : 'Performance');
    occlusion.configuration.aoRadius = 0.7;
    occlusion.configuration.distanceFalloff = 1;
    occlusion.configuration.intensity = 2.2;
    // Glazing is nearly clear: skipping the two extra transparency renders (and their
    // full-resolution buffers) is not visible.
    occlusion.autoDetectTransparency = false;
    occlusion.configuration.transparencyAware = false;
    occlusion.configuration.halfRes = true;
    repairHalfResolution(occlusion);
    composer.addPass(occlusion);

    const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1, luminanceSmoothing: 0.2, intensity: 0.55 });
    const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    let dof: DepthOfFieldEffect | null = null;
    if (quality === 3) {
      dof = new DepthOfFieldEffect(camera, { worldFocusRange: 3.2, bokehScale: 0, resolutionScale: 0.5 });
      dof.maskFunction = MaskFunction.MULTIPLY_RGB_SET_ALPHA;
      // Aperture opens as the camera settles on the chapter's point of interest.
      dof.target = tourRuntime.focusPoint;
    }
    composer.addPass(dof ? new EffectPass(camera, bloom, dof, toneMapping) : new EffectPass(camera, bloom, toneMapping));

    // Anti-aliasing runs on the tone-mapped image. FXAA needs no buffers of its own.
    composer.addPass(new EffectPass(camera, quality === 3 ? new SMAAEffect() : new FXAAEffect()));

    chain.current = { composer, dof };
    applied.current = { width: 0, height: 0, pixelRatio: 0 };
    invalidate();
    return () => {
      chain.current = null;
      composer.dispose();
      invalidate();
    };
  }, [gl, scene, camera, quality, invalidate]);

  // A positive priority hands the render loop over to the composer.
  useFrame((state, delta) => {
    if (!chain.current) return;
    const { composer, dof } = chain.current;
    const { width, height } = state.size;
    const pixelRatio = gl.getPixelRatio();
    const last = applied.current;
    if (last.width !== width || last.height !== height || last.pixelRatio !== pixelRatio) {
      composer.setSize(width, height);
      applied.current = { width, height, pixelRatio };
    }
    if (dof) dof.bokehScale = MAX_BOKEH * tourRuntime.focus;
    composer.render(delta);
  }, 1);

  return null;
}
