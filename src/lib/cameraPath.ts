import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import type { Tour, TourChapter, Vec3 } from '@/types/tour';

export interface CameraPose {
  position: Vector3;
  target: Vector3;
  /** 0..1 weight of the active chapter's focus point (drives depth of field). */
  focus: number;
  focusPoint: Vector3 | null;
}

export function chapterIndexAt(chapters: TourChapter[], progress: number): number {
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (progress >= chapters[i].range[0]) return i;
  }
  return 0;
}

/** Bell-shaped weight: 0 at the chapter edges, 1 across its middle. */
export function focusWeight(range: [number, number], progress: number): number {
  const [start, end] = range;
  if (progress <= start || progress >= end) return 0;
  const edge = (end - start) * 0.45;
  return Math.min(
    MathUtils.smoothstep(progress, start, start + edge),
    1 - MathUtils.smoothstep(progress, end - edge, end),
  );
}

/**
 * Camera rail: a centripetal Catmull-Rom spline through the tour waypoints. The camera
 * sits at the scroll progress and looks at a point slightly ahead on the same spline,
 * optionally leaning towards the active chapter's point of interest.
 */
export class CameraPath {
  readonly curve: CatmullRomCurve3;
  private readonly tangent = new Vector3();
  private readonly focusVec = new Vector3();
  private readonly focusPoints: (Vector3 | null)[];
  private readonly tour: Pick<Tour, 'camera' | 'chapters'>;

  constructor(tour: Pick<Tour, 'camera' | 'chapters'>) {
    this.tour = tour;
    const points = tour.camera.waypoints.map((p: Vec3) => new Vector3(...p));
    if (points.length < 2) throw new Error('A tour needs at least two camera waypoints');
    this.curve = new CatmullRomCurve3(points, false, 'centripetal');
    this.curve.arcLengthDivisions = Math.max(200, points.length * 40);
    this.focusPoints = tour.chapters.map((c) => (c.focusPoint ? new Vector3(...c.focusPoint) : null));
  }

  sample(progress: number, out: CameraPose): CameraPose {
    const p = MathUtils.clamp(progress, 0, 1);
    const { lookAhead } = this.tour.camera;
    this.curve.getPointAt(p, out.position);

    const ahead = p + lookAhead;
    if (ahead <= 1) {
      this.curve.getPointAt(ahead, out.target);
    } else {
      // Past the end of the rail: keep travelling along the final tangent.
      this.curve.getPointAt(1, out.target);
      this.curve.getTangentAt(1, this.tangent);
      out.target.addScaledVector(this.tangent, (ahead - 1) * this.curve.getLength());
    }

    const index = chapterIndexAt(this.tour.chapters, p);
    const chapter = this.tour.chapters[index];
    const focusPoint = this.focusPoints[index];
    out.focus = 0;
    out.focusPoint = focusPoint;
    if (chapter && focusPoint) {
      out.focus = focusWeight(chapter.range, p);
      const blend = out.focus * (chapter.focusStrength ?? 0.6);
      // Blend view directions (not points) so the pan stays even and never collapses
      // through the camera position.
      const distance = out.position.distanceTo(focusPoint);
      this.tangent.copy(out.target).sub(out.position).normalize();
      this.focusVec.copy(focusPoint).sub(out.position).normalize();
      this.tangent.lerp(this.focusVec, blend).normalize();
      out.target.copy(out.position).addScaledVector(this.tangent, distance);
    }
    return out;
  }
}

export function createPose(): CameraPose {
  return { position: new Vector3(), target: new Vector3(), focus: 0, focusPoint: null };
}

/** Half-width (in progress units) of the hand-over between two chapters' card sides. */
const SIDE_BLEND = 0.025;

/**
 * Horizontal framing bias in -1..1: negative while the chapter card is docked on the
 * left, positive on the right, easing across chapter boundaries. It is a pure function
 * of scroll progress, so it needs no animation loop of its own.
 */
export function cardSideAt(chapters: TourChapter[], progress: number): number {
  const sign = (chapter: TourChapter) => (chapter.cardSide === 'left' ? -1 : 1);
  if (chapters.length === 0) return 0;
  let side = sign(chapters[0]);
  for (let i = 1; i < chapters.length; i++) {
    const boundary = chapters[i].range[0];
    side = MathUtils.lerp(side, sign(chapters[i]), MathUtils.smoothstep(progress, boundary - SIDE_BLEND, boundary + SIDE_BLEND));
  }
  return side;
}
