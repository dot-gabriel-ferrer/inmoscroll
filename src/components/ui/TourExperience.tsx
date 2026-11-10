'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { SmoothScrollProvider, useLenis } from '@/components/scroll/SmoothScrollProvider';
import { SCROLL_TRACK_ID } from '@/components/three/CameraRig';
import { useTourStore } from '@/store/tourStore';
import type { Tour } from '@/types/tour';
import { ChapterCard } from './ChapterCard';
import { ContactDialog } from './ContactDialog';
import { LoadingOverlay } from './LoadingOverlay';
import { MenuDrawer } from './MenuDrawer';
import { ProgressRail } from './ProgressRail';
import { TopBar } from './TopBar';

// WebGL never renders on the server.
const TourCanvas = dynamic(() => import('@/components/three/TourCanvas'), { ssr: false });

function TourInterface({ tour }: { tour: Tour }) {
  const lenis = useLenis();
  const ready = useTourStore((state) => state.loading.ready);
  const overlayOpen = useTourStore((state) => state.menuOpen || state.contactOpen);

  useEffect(() => {
    if (overlayOpen) lenis.current?.stop();
    else lenis.current?.start();
  }, [lenis, overlayOpen]);

  const jumpTo = (chapterIndex: number) => {
    const track = document.getElementById(SCROLL_TRACK_ID);
    const chapter = tour.chapters[chapterIndex];
    if (!track || !chapter) return;
    const scrollable = track.offsetHeight - window.innerHeight;
    // Land slightly inside the chapter so its card and markers are already active.
    const inset = chapterIndex === 0 ? 0 : (chapter.range[1] - chapter.range[0]) * 0.35;
    const top = track.offsetTop + (chapter.range[0] + inset) * scrollable;
    if (lenis.current) lenis.current.scrollTo(top, { duration: 2.2 });
    else window.scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <>
      <TopBar tour={tour} />
      {ready && (
        <>
          <ChapterCard tour={tour} />
          <ProgressRail tour={tour} onJump={jumpTo} />
        </>
      )}
      <MenuDrawer tour={tour} onJump={jumpTo} />
      <ContactDialog tour={tour} />
      <LoadingOverlay tour={tour} />
    </>
  );
}

export function TourExperience({ tour }: { tour: Tour }) {
  const storeTour = useTourStore((state) => state.tour);
  // Next.js keeps visited routes alive in a hidden <Activity>, which only runs effect
  // cleanups. Local state flipped from that cleanup is what actually unmounts the
  // canvas, so a tour left behind releases its WebGL context and VRAM.
  const [active, setActive] = useState(false);

  useEffect(() => {
    useTourStore.getState().setTour(tour);
    window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors Activity visibility
    setActive(true);
    return () => {
      setActive(false);
      useTourStore.getState().setTour(null);
    };
  }, [tour]);

  return (
    <SmoothScrollProvider>
      <div className="tour-stage">{active && storeTour?.id === tour.id && <TourCanvas tour={storeTour} />}</div>
      {/* The page's scroll height is the tour timeline. */}
      <div id={SCROLL_TRACK_ID} style={{ height: `${tour.camera.scrollLength * 100}vh` }} aria-hidden />
      <TourInterface tour={tour} />
    </SmoothScrollProvider>
  );
}
