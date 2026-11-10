'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { FrameBudgetMonitor } from '@/lib/quality';
import { useTourStore } from '@/store/tourStore';

/** Gap after which two frames are considered separate bursts of on-demand rendering. */
const IDLE_GAP_MS = 250;
const GRACE_MS = 2000;

/**
 * Real-time frame budget watchdog. If rendering stays over the 60 fps budget for more
 * than a second while the user is scrolling, one quality tier is dropped (depth of
 * field first, then ambient occlusion).
 */
export function PerformanceGovernor() {
  const monitor = useMemo(() => new FrameBudgetMonitor(), []);
  const last = useRef(0);
  const graceUntil = useRef(0);

  useFrame(() => {
    const now = performance.now();
    const delta = now - last.current;
    last.current = now;
    const { loading, quality, degradeQuality } = useTourStore.getState();
    if (!loading.ready || quality === 1 || delta > IDLE_GAP_MS || now < graceUntil.current) {
      monitor.reset();
      if (loading.ready && graceUntil.current === 0) graceUntil.current = now + GRACE_MS;
      return;
    }
    if (monitor.sample(delta)) {
      degradeQuality();
      graceUntil.current = now + GRACE_MS;
    }
  });

  return null;
}
