declare module 'n8ao' {
  import type { Pass } from 'postprocessing';
  import type { Camera, Scene, ShaderMaterial, WebGLRenderTarget } from 'three';

  /** Ambient occlusion for the `postprocessing` composer: reads its colour and depth buffers. */
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    readonly configuration: {
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      halfRes: boolean;
      depthAwareUpsampling: boolean;
      transparencyAware: boolean;
    };
    /** When set, `transparencyAware` follows the materials found in the scene. */
    autoDetectTransparency: boolean;
    /** Half-resolution depth/normal target; only exists while `halfRes` is on. */
    readonly depthDownsampleTarget?: WebGLRenderTarget | null;
    /** Full-screen quad that blends the occlusion over the scene. */
    readonly effectCompositerQuad: { material: ShaderMaterial };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}
