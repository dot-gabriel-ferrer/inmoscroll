import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import type { Tour, Vec3 } from '@/types/tour';
import { chapterIndexAt, focusWeight } from './chapters';

export { cardSideAt, chapterIndexAt, focusWeight } from './chapters';

export interface CameraPose {
  position: Vector3;
  target: Vector3;
  /** 0..1 weight of the active chapter's focus point (drives depth of field). */
  focus: number;
  focusPoint: Vector3 | null;
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
