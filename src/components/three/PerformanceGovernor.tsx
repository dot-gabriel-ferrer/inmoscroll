'use client';

import { useFrame } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useMemo, useRef } from 'react';
import { FrameBudgetMonitor } from '@/lib/quality';
import { useTourStore } from '@/store/tourStore';

/**
 * Display refreshes that may pass between two frames of the same burst of on-demand
 * rendering. Counting refreshes instead of milliseconds keeps a device that needs half a
 * second per frame from being mistaken for an idle one.
 */
const MAX_SKIPPED_TICKS = 2;
const GRACE_MS = 2000;
/** Most a single frame may count for, so one hitch (shader compile, tab switch) never degrades by itself. */
const MAX_SAMPLE_MS = 250;

/**
 * Real-time frame budget watchdog. If rendering stays over the 60 fps budget for more
 * than a second while the user is scrolling, one quality tier is dropped: resolution
 * on every scene, plus depth of field and then all post-processing on meshes.
 */
export function PerformanceGovernor() {
  const monitor = useMemo(() => new FrameBudgetMonitor(), []);
  const last = useRef(0);
  const graceUntil = useRef(0);
  const ticks = useRef(0);
  const lastTick = useRef(0);

  useEffect(() => {
    // The GSAP ticker (already driving the scroll) fires once per display refresh.
    const count = () => {
      ticks.current++;
    };
    gsap.ticker.add(count);
    return () => gsap.ticker.remove(count);
  }, []);

  useFrame(() => {
    const now = performance.now();
    const delta = now - last.current;
    last.current = now;
    const idle = ticks.current - lastTick.current > MAX_SKIPPED_TICKS;
    lastTick.current = ticks.current;
    const { loading, quality, degradeQuality } = useTourStore.getState();
    if (!loading.ready || quality === 1 || idle || now < graceUntil.current) {
      monitor.reset();
      if (loading.ready && graceUntil.current === 0) graceUntil.current = now + GRACE_MS;
      return;
    }
    if (monitor.sample(Math.min(delta, MAX_SAMPLE_MS))) {
      degradeQuality();
      graceUntil.current = now + GRACE_MS;
    }
  });

  return null;
}
