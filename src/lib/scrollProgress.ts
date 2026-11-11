import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef } from 'react';

gsap.registerPlugin(ScrollTrigger);

/** Element whose scroll height is the tour timeline. */
export const SCROLL_TRACK_ID = 'tour-scroll-track';

/**
 * Scrubs a 0..1 value along the scroll track and reports every change. Shared by the
 * live camera rig and the pre-rendered viewer, so both follow the scroll identically.
 */
export function useScrollProgress(scrub: number, onProgress: (progress: number) => void) {
  const callback = useRef(onProgress);
  useEffect(() => {
    callback.current = onProgress;
  });

  useEffect(() => {
    const track = document.getElementById(SCROLL_TRACK_ID);
    if (!track) return;
    const state = { value: 0 };
    const tween = gsap.to(state, {
      value: 1,
      ease: 'none',
      scrollTrigger: { trigger: track, start: 'top top', end: 'bottom bottom', scrub },
      onUpdate: () => callback.current(state.value),
    });
    // A scrubbed tween starts at 0 and catches up with the scroll. When the viewer mounts
    // mid-page (a switch of viewer, a rebuilt canvas) start where the scroll already is.
    const start = tween.scrollTrigger?.progress ?? 0;
    if (start > 0) tween.progress(start);
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [scrub]);
}
