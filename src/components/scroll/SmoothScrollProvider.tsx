'use client';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react';

gsap.registerPlugin(ScrollTrigger);

const LenisContext = createContext<RefObject<Lenis | null>>({ current: null });

/** Ref to the active Lenis instance; read `.current` inside effects and event handlers. */
export function useLenis() {
  return useContext(LenisContext);
}

/**
 * Single clock for scroll physics and scroll-driven animation: Lenis has no rAF loop of
 * its own and only advances when the GSAP ticker pulses, ScrollTrigger is refreshed
 * from Lenis' scroll callback, and GSAP lag smoothing is off so a long frame can never
 * make the timeline jump ahead of the inertia simulation.
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const lenis = useRef<Lenis | null>(null);

  useEffect(() => {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const instance = new Lenis({ autoRaf: false, lerp: reducedMotion ? 1 : 0.1 });
    instance.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => instance.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    lenis.current = instance;

    return () => {
      gsap.ticker.remove(tick);
      instance.destroy();
      lenis.current = null;
    };
  }, []);

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>;
}
