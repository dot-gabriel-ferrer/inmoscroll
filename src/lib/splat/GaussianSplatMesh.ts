import {
  type Camera,
  CustomBlending,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  BufferAttribute,
  Matrix4,
  Mesh,
  NearestFilter,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RGBAIntegerFormat,
  type Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { SPLATS_PER_ROW, type SplatWorkerRequest, type SplatWorkerResponse } from './types';

const vertexShader = /* glsl */ `
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D splatTexture;
uniform vec2 focal;
uniform vec2 viewport;

in uint splatIndex;

out vec4 vColor;
out vec2 vOffset;

const uint ROW_MASK = ${SPLATS_PER_ROW - 1}u;
const int ROW_SHIFT = ${Math.log2(SPLATS_PER_ROW)};

void main() {
  ivec2 texel = ivec2(int((splatIndex & ROW_MASK) << 1), int(splatIndex >> ROW_SHIFT));
  uvec4 t0 = texelFetch(splatTexture, texel, 0);
  vec3 center = uintBitsToFloat(t0.xyz);
  vec4 view = modelViewMatrix * vec4(center, 1.0);
  vec4 clip = projectionMatrix * view;

  // Cull splats behind the camera or well outside the frustum.
  float bound = 1.3 * clip.w;
  if (view.z > -0.05 || clip.x < -bound || clip.x > bound || clip.y < -bound || clip.y > bound) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }

  uvec4 t1 = texelFetch(splatTexture, texel + ivec2(1, 0), 0);
  float magnitude = uintBitsToFloat(t0.w);
  vec2 c0 = unpackHalf2x16(t1.x);
  vec2 c1 = unpackHalf2x16(t1.y);
  vec2 c2 = unpackHalf2x16(t1.z);
  mat3 cov3d = magnitude * mat3(c0.x, c0.y, c1.x, c0.y, c1.y, c2.x, c1.x, c2.x, c2.y);

  // Jacobian of the perspective projection (camera looks down -Z), in pixels.
  float invZ = 1.0 / view.z;
  mat3 J = mat3(
    -focal.x * invZ, 0.0, 0.0,
    0.0, -focal.y * invZ, 0.0,
    focal.x * view.x * invZ * invZ, focal.y * view.y * invZ * invZ, 0.0
  );
  mat3 T = J * mat3(modelViewMatrix);
  mat3 cov2d = T * cov3d * transpose(T);

  // Low-pass filter so sub-pixel splats stay stable.
  float a = cov2d[0][0] + 0.3;
  float d = cov2d[1][1] + 0.3;
  float b = cov2d[0][1];
  float mid = 0.5 * (a + d);
  float radius = length(vec2(0.5 * (a - d), b));
  float lambda1 = mid + radius;
  float lambda2 = max(mid - radius, 0.1);
  vec2 axis = normalize(vec2(b, lambda1 - a) + vec2(1e-12, 0.0));
  vec2 major = min(sqrt(2.0 * lambda1), 1024.0) * axis;
  vec2 minor = min(sqrt(2.0 * lambda2), 1024.0) * vec2(-axis.y, axis.x);

  vColor = vec4(
    float(t1.w & 0xffu), float((t1.w >> 8) & 0xffu), float((t1.w >> 16) & 0xffu), float(t1.w >> 24)
  ) / 255.0;
  vOffset = position.xy;

  vec2 ndc = clip.xy / clip.w + (position.x * major + position.y * minor) * 2.0 / viewport;
  gl_Position = vec4(ndc, clip.z / clip.w, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

in vec4 vColor;
in vec2 vOffset;

layout(location = 0) out highp vec4 fragColor;

void main() {
  float power = -dot(vOffset, vOffset);
  if (power < -4.0) discard;
  float alpha = exp(power) * vColor.a;
  fragColor = vec4(vColor.rgb * alpha, alpha);
}
`;

export interface GaussianSplatMeshEvents {
  onProgress?: (loaded: number, total: number) => void;
  onLoad?: (count: number) => void;
  onError?: (message: string) => void;
  /** A fresh draw order was uploaded; the scene needs a new frame. */
  onSorted?: () => void;
}

/** Cosine of the view rotation that triggers a re-sort (~0.6 degrees). */
const RESORT_THRESHOLD = 0.99995;

/**
 * Instanced-quad Gaussian splat renderer. Decoding and depth sorting run in a dedicated
 * worker; this object only uploads the packed texture and the sorted index buffer.
 * The depth order depends solely on the view direction, so it is re-sorted on rotation.
 */
export class GaussianSplatMesh extends Mesh<InstancedBufferGeometry, ShaderMaterial> {
  private readonly worker: Worker;
  private readonly modelView = new Matrix4();
  private readonly direction = new Vector3();
  private readonly sortedDirection = new Vector3();
  private readonly size = new Vector2();
  private texture: DataTexture | null = null;
  private orderAttribute: InstancedBufferAttribute | null = null;
  private spare: Uint32Array | null = null;
  private sorting = false;
  private hasOrder = false;
  private disposed = false;

  constructor(worker: Worker, url: string, private readonly events: GaussianSplatMeshEvents = {}) {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([-2, -2, 0, 2, -2, 0, 2, 2, 0, -2, 2, 0]), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.instanceCount = 0;

    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        splatTexture: { value: null },
        focal: { value: new Vector2(1, 1) },
        viewport: { value: new Vector2(1, 1) },
      },
      transparent: true,
      // Screen-space quads have no meaningful facing.
      side: DoubleSide,
      depthTest: true,
      depthWrite: false,
      // Premultiplied "over" compositing; requires back-to-front order.
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    });

    super(geometry, material);
    this.frustumCulled = false;
    this.visible = false;
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<SplatWorkerResponse>) => this.handleMessage(event.data);
    worker.onerror = (event) => this.events.onError?.(event.message || 'Splat worker failed');
    this.send({ type: 'load', url });
  }

  private send(message: SplatWorkerRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(message, transfer);
  }

  private handleMessage(message: SplatWorkerResponse) {
    if (this.disposed) return;
    switch (message.type) {
      case 'progress':
        this.events.onProgress?.(message.loaded, message.total);
        break;
      case 'error':
        this.events.onError?.(message.message);
        break;
      case 'loaded': {
        const texture = new DataTexture(message.texture, message.width, message.height, RGBAIntegerFormat, UnsignedIntType);
        texture.internalFormat = 'RGBA32UI';
        texture.minFilter = NearestFilter;
        texture.magFilter = NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        this.texture = texture;
        this.material.uniforms.splatTexture.value = texture;

        const order = new Uint32Array(message.count);
        for (let i = 0; i < order.length; i++) order[i] = i;
        const attribute = new InstancedBufferAttribute(order, 1);
        attribute.setUsage(DynamicDrawUsage);
        this.orderAttribute = attribute;
        this.geometry.setAttribute('splatIndex', attribute);
        this.geometry.instanceCount = message.count;
        this.visible = true;
        this.events.onLoad?.(message.count);
        this.events.onSorted?.();
        break;
      }
      case 'sorted': {
        this.sorting = false;
        if (!this.orderAttribute) break;
        this.spare = this.orderAttribute.array as Uint32Array;
        this.orderAttribute.array = message.order;
        this.orderAttribute.needsUpdate = true;
        this.hasOrder = true;
        this.events.onSorted?.();
        break;
      }
    }
  }

  override onBeforeRender = (renderer: WebGLRenderer, _scene: Scene, camera: Camera) => {
    const target = renderer.getRenderTarget();
    if (target) this.size.set(target.width, target.height);
    else renderer.getDrawingBufferSize(this.size);
    const projection = camera.projectionMatrix.elements;
    const uniforms = this.material.uniforms;
    uniforms.viewport.value.copy(this.size);
    uniforms.focal.value.set((projection[0] * this.size.x) / 2, (projection[5] * this.size.y) / 2);

    if (this.sorting || !this.orderAttribute) return;
    const e = this.modelView.multiplyMatrices(camera.matrixWorldInverse, this.matrixWorld).elements;
    this.direction.set(e[2], e[6], e[10]).normalize();
    if (this.hasOrder && this.direction.dot(this.sortedDirection) > RESORT_THRESHOLD) return;
    this.sortedDirection.copy(this.direction);
    this.sorting = true;
    const recycle = this.spare ?? undefined;
    this.spare = null;
    this.send(
      { type: 'sort', direction: [this.direction.x, this.direction.y, this.direction.z], recycle },
      recycle ? [recycle.buffer] : [],
    );
  };

  dispose() {
    this.disposed = true;
    this.worker.terminate();
    this.texture?.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
