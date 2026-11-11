'use client';

import { type CSSProperties, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { chapterIndexAt } from '@/lib/chapters';
import { FrameSequence } from '@/lib/frameSequence';
import { frameIndexAt, type FrameVariant, frameUrl, markersUrl, type Prerender, type PrerenderMarkers } from '@/lib/prerender';
import { detectDeviceProfile } from '@/lib/quality';
import { useScrollProgress } from '@/lib/scrollProgress';
import { useTourStore } from '@/store/tourStore';
import type { Tour, TourAnnotation } from '@/types/tour';
import { AnnotationPill, useAnnotationSelection } from './AnnotationPill';

function FrameMarker({ annotation, x, y, visible }: { annotation: TourAnnotation; x: number; y: number; visible: boolean }) {
  const { selected, toggle } = useAnnotationSelection(annotation.id);

  return (
    <div className="frame-marker" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
      <AnnotationPill annotation={annotation} selected={selected} onToggle={toggle} occluded={!visible} />
    </div>
  );
}

const UNAVAILABLE_MESSAGE = 'No se pudieron descargar las imágenes del recorrido. Comprueba la conexión y vuelve a intentarlo.';

const PORTRAIT = '(orientation: portrait)';

function subscribeOrientation(onChange: () => void) {
  const query = matchMedia(PORTRAIT);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const getVariant = (): FrameVariant => (matchMedia(PORTRAIT).matches ? 'portrait' : 'landscape');

/**
 * The tour as a scroll-driven image sequence rendered ahead of time: no WebGL, no 3D
 * engine and no scene download, so it runs on any browser. The scroll position picks a
 * frame; markers are placed from positions baked together with the frames.
 */
export default function FrameViewer({ tour, prerender }: { tour: Tour; prerender: Prerender }) {
  const variant = useSyncExternalStore(subscribeOrientation, getVariant, () => 'landscape' as const);
  const timeOfDay = useTourStore((state) => state.timeOfDay);
  const time = prerender.times.includes(timeOfDay) ? timeOfDay : prerender.times[0];
  const image = useRef<HTMLImageElement>(null);
  const [shown, setShown] = useState(0);
  const [markers, setMarkers] = useState<{ variant: FrameVariant; data: PrerenderMarkers } | null>(null);

  useScrollProgress(tour.camera.scrub, (progress) => useTourStore.getState().setProgress(progress));

  useEffect(() => {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    let target = -1;
    const paint = () => {
      const index = sequence.nearest(target);
      if (index < 0 || !image.current) return;
      const url = sequence.url(index);
      // The browser keeps the previous picture on screen until the new one is decoded.
      if (image.current.getAttribute('src') !== url) image.current.src = url;
      setShown(index);
      const { loading, setLoading } = useTourStore.getState();
      if (!loading.ready) setLoading({ progress: 1, ready: true });
    };
    const sequence = new FrameSequence(
      prerender.frames,
      (index) => frameUrl(tour.id, prerender, variant, time, index),
      paint,
      !saveData,
      () => useTourStore.getState().setLoading({ error: UNAVAILABLE_MESSAGE }),
    );
    const follow = () => {
      const next = frameIndexAt(useTourStore.getState().progress, prerender.frames);
      if (next === target) return;
      target = next;
      sequence.prioritise(target);
      paint();
    };
    follow();
    const unsubscribe = useTourStore.subscribe(follow);
    return () => {
      unsubscribe();
      sequence.dispose();
    };
  }, [tour.id, prerender, variant, time]);

  useEffect(() => {
    // Entry-level devices also drop the interface's backdrop blur (see globals.css).
    if (detectDeviceProfile().tier !== 1) return;
    document.documentElement.dataset.quality = '1';
    return () => {
      delete document.documentElement.dataset.quality;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(markersUrl(tour.id, prerender, variant))
      .then((response) => (response.ok ? (response.json() as Promise<PrerenderMarkers>) : null))
      .then((data) => {
        if (data && !cancelled) setMarkers({ variant, data });
      })
      // Markers are an extra: the frames play without them.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tour.id, prerender, variant]);

  const { width, height } = prerender.variants[variant];
  const chapter = tour.chapters[chapterIndexAt(tour.chapters, shown / Math.max(1, prerender.frames - 1))];
  const placement = markers?.variant === variant ? markers.data.frames[shown] : undefined;

  return (
    <div className="frame-cover" style={{ '--frame-ratio': width / height } as CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-img-element -- frames are swapped imperatively, far too often for next/image */}
      <img ref={image} alt="" width={width} height={height} decoding="async" draggable={false} className="frame-image" />
      {placement &&
        chapter?.annotations.map((annotation, i) => (
          <FrameMarker
            key={annotation.id}
            annotation={annotation}
            x={placement[i * 3]}
            y={placement[i * 3 + 1]}
            visible={placement[i * 3 + 2] === 1}
          />
        ))}
    </div>
  );
}
