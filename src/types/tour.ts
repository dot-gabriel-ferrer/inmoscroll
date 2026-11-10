export type Vec3 = [number, number, number];

export type TimeOfDay = 'day' | 'night';

export interface TourAnnotation {
  id: string;
  label: string;
  detail?: string;
  position: Vec3;
}

export interface TourChapter {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  /** Scroll progress window [start, end] in 0..1 during which the chapter is active. */
  range: [number, number];
  stats?: { label: string; value: string }[];
  /** Side of the viewport the chapter card docks to on wide screens (default: right). */
  cardSide?: 'left' | 'right';
  /** World-space point the camera leans towards (and focuses on) mid-chapter. */
  focusPoint?: Vec3;
  /** 0..1 blend between the look-ahead target and `focusPoint`. */
  focusStrength?: number;
  annotations: TourAnnotation[];
}

export interface SceneTransform {
  position?: Vec3;
  /** Euler XYZ in radians. */
  rotation?: Vec3;
  scale?: number;
}

export type TourScene =
  | {
      type: 'gltf';
      /** File name inside /assets (or absolute URL). */
      url: string;
      transform?: SceneTransform;
    }
  | {
      type: 'splat';
      /** .spz, .ksplat or .splat file inside /assets (or absolute URL). */
      url: string;
      /** Optional invisible GLB proxy used only to occlude annotations. */
      occluderUrl?: string;
      transform?: SceneTransform;
    };

export interface TourLighting {
  /** Direction the sunlight comes from, relative to the scene centre. */
  sunDirection: Vec3;
  day: { sun: number; sunColor: string; ambient: number; background: string };
  night: { sun: number; sunColor: string; ambient: number; background: string };
}

export interface TourCamera {
  fov: number;
  /** Spline control points, in travel order. */
  waypoints: Vec3[];
  /** How far ahead on the spline (0..1) the camera looks. */
  lookAhead: number;
  /** ScrollTrigger scrub lag in seconds. */
  scrub: number;
  /** Total scroll length in viewport heights. */
  scrollLength: number;
}

export interface Tour {
  id: string;
  title: string;
  tagline: string;
  location: string;
  price: number;
  currency: string;
  areaM2: number;
  bedrooms: number;
  bathrooms: number;
  technology: string;
  agent: { name: string; agency: string; email: string; phone: string };
  scene: TourScene;
  lighting: TourLighting;
  camera: TourCamera;
  chapters: TourChapter[];
}
