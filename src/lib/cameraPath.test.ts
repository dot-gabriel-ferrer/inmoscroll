import { describe, expect, it } from 'vitest';
import { tours } from '@/data/tours';
import type { Tour } from '@/types/tour';
import { CameraPath, cardSideAt, chapterIndexAt, createPose, focusWeight } from './cameraPath';
import { FrameBudgetMonitor } from './quality';

const base = {
  camera: {
    fov: 50,
    lookAhead: 0.1,
    scrub: 1,
    scrollLength: 5,
    waypoints: [
      [0, 1, 0],
      [10, 1, 0],
      [20, 1, 0],
    ],
  },
  chapters: [
    { id: 'a', eyebrow: '', title: 'A', description: '', range: [0, 0.5], cardSide: 'left', annotations: [] },
    {
      id: 'b',
      eyebrow: '',
      title: 'B',
      description: '',
      range: [0.5, 1],
      focusPoint: [15, 1, 10],
      focusStrength: 1,
      annotations: [],
    },
  ],
} as unknown as Pick<Tour, 'camera' | 'chapters'>;

describe('CameraPath', () => {
  const path = new CameraPath(base);

  it('maps progress to arc length and clamps out-of-range values', () => {
    const pose = createPose();
    expect(path.sample(0, pose).position.x).toBeCloseTo(0, 3);
    expect(path.sample(0.25, pose).position.x).toBeCloseTo(5, 1);
    expect(path.sample(2, pose).position.x).toBeCloseTo(20, 3);
    expect(path.sample(-1, pose).position.x).toBeCloseTo(0, 3);
  });

  it('looks ahead along the spline, extrapolating past its end', () => {
    const pose = createPose();
    path.sample(0.2, pose);
    expect(pose.target.x).toBeCloseTo(6, 1);
    path.sample(1, pose);
    expect(pose.target.x).toBeGreaterThan(pose.position.x + 1);
  });

  it('leans towards the focus point mid-chapter only', () => {
    const pose = createPose();
    path.sample(0.75, pose);
    expect(pose.focus).toBe(1);
    // focusStrength 1: looking straight at the point of interest (0, 0, 1 from x=15).
    expect(pose.target.z - pose.position.z).toBeGreaterThan(9);
    path.sample(0.5, pose);
    expect(pose.focus).toBe(0);
    expect(pose.target.z).toBeCloseTo(0, 5);
    path.sample(0.25, pose);
    expect(pose.focusPoint).toBeNull();
  });

  it('rejects degenerate rails', () => {
    expect(() => new CameraPath({ ...base, camera: { ...base.camera, waypoints: [[0, 0, 0]] } })).toThrow();
  });
});

describe('chapter helpers', () => {
  it('finds the active chapter', () => {
    expect(chapterIndexAt(base.chapters, 0)).toBe(0);
    expect(chapterIndexAt(base.chapters, 0.49)).toBe(0);
    expect(chapterIndexAt(base.chapters, 0.5)).toBe(1);
    expect(chapterIndexAt(base.chapters, 1)).toBe(1);
  });

  it('weights focus as a plateau with eased edges', () => {
    expect(focusWeight([0.2, 0.6], 0.2)).toBe(0);
    expect(focusWeight([0.2, 0.6], 0.4)).toBe(1);
    expect(focusWeight([0.2, 0.6], 0.6)).toBe(0);
    const rising = focusWeight([0.2, 0.6], 0.25);
    expect(rising).toBeGreaterThan(0);
    expect(rising).toBeLessThan(1);
  });

  it('eases the card side across chapter boundaries', () => {
    expect(cardSideAt(base.chapters, 0.2)).toBe(-1);
    expect(cardSideAt(base.chapters, 0.5)).toBeCloseTo(0, 5);
    expect(cardSideAt(base.chapters, 0.8)).toBe(1);
  });
});

describe('tour data', () => {
  it.each(tours.map((tour) => [tour.id, tour] as const))('%s is well formed', (_id, tour) => {
    expect(tour.chapters[0].range[0]).toBe(0);
    expect(tour.chapters.at(-1)?.range[1]).toBe(1);
    tour.chapters.forEach((chapter, i) => {
      expect(chapter.range[1]).toBeGreaterThan(chapter.range[0]);
      if (i > 0) expect(chapter.range[0]).toBe(tour.chapters[i - 1].range[1]);
    });
    const ids = tour.chapters.flatMap((chapter) => chapter.annotations.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(() => new CameraPath(tour)).not.toThrow();
  });
});

describe('FrameBudgetMonitor', () => {
  it('fires only after the budget is exceeded continuously for the tolerance', () => {
    const monitor = new FrameBudgetMonitor(20, 1000);
    for (let i = 0; i < 20; i++) expect(monitor.sample(40)).toBe(false);
    // One good frame resets the streak.
    expect(monitor.sample(16)).toBe(false);
    let fired = false;
    for (let i = 0; i < 26 && !fired; i++) fired = monitor.sample(40);
    expect(fired).toBe(true);
    expect(monitor.sample(40)).toBe(false);
  });

  it('never fires within budget', () => {
    const monitor = new FrameBudgetMonitor();
    for (let i = 0; i < 500; i++) expect(monitor.sample(16.7)).toBe(false);
  });
});
