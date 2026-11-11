import type { TourChapter } from '@/types/tour';

// Chapter timeline helpers. Plain math on purpose: they run in the pre-rendered viewer,
// which never loads the 3D engine.

function smoothstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const t = (x - min) / (max - min);
  return t * t * (3 - 2 * t);
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
  return Math.min(smoothstep(progress, start, start + edge), 1 - smoothstep(progress, end - edge, end));
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
    side += (sign(chapters[i]) - side) * smoothstep(progress, boundary - SIDE_BLEND, boundary + SIDE_BLEND);
  }
  return side;
}
