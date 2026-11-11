'use client';

import dynamic from 'next/dynamic';
import { Component, type ReactNode, useEffect, useState } from 'react';
import { SmoothScrollProvider, useLenis } from '@/components/scroll/SmoothScrollProvider';
import { getPrerender } from '@/lib/prerender';
import { SCROLL_TRACK_ID } from '@/lib/scrollProgress';
import { switchView, useTourStore, useViewPreference } from '@/store/tourStore';
import type { Tour } from '@/types/tour';
import { ChapterCard } from './ChapterCard';
import { ContactDialog } from './ContactDialog';
import { LoadingOverlay } from './LoadingOverlay';
import { MenuDrawer } from './MenuDrawer';
import { ProgressRail } from './ProgressRail';
import { TopBar } from './TopBar';

// WebGL never renders on the server. Both viewers are separate chunks: the pre-rendered
// one never pulls in the 3D engine.
const TourCanvas = dynamic(() => import('@/components/three/TourCanvas'), { ssr: false });
const FrameViewer = dynamic(() => import('./FrameViewer'), { ssr: false });

const LIVE_UNAVAILABLE_MESSAGE = 'No se pudo iniciar el motor 3D. Recarga la página para volver a intentarlo.';

/**
 * Catches a live viewer that cannot even load (its code failed to download, the engine
 * threw while starting) and falls back to the pre-rendered frames when the tour has them.
 */
class LiveViewerBoundary extends Component<{ fallbackToFrames: boolean; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    if (this.props.fallbackToFrames) switchView('frames');
    else useTourStore.getState().setLoading({ error: LIVE_UNAVAILABLE_MESSAGE });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

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
  // `?capture` turns the page into the render source of scripts/prerender-tours.mjs.
  const [capture, setCapture] = useState(false);
  const prerender = getPrerender(tour.id);
  const live = useViewPreference((state) => state.mode === 'live') || capture;

  useEffect(() => {
    useTourStore.getState().setTour(tour);
    window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors Activity visibility
    setActive(true);
    setCapture(new URLSearchParams(window.location.search).has('capture'));
    return () => {
      setActive(false);
      useTourStore.getState().setTour(null);
    };
  }, [tour]);

  return (
    <SmoothScrollProvider>
      <div className="tour-stage">
        {active &&
          storeTour?.id === tour.id &&
          (live || !prerender ? (
            <LiveViewerBoundary fallbackToFrames={Boolean(prerender) && !capture}>
              <TourCanvas tour={storeTour} capture={capture} />
            </LiveViewerBoundary>
          ) : (
            <FrameViewer tour={storeTour} prerender={prerender} />
          ))}
      </div>
      {/* The page's scroll height is the tour timeline. */}
      <div id={SCROLL_TRACK_ID} style={{ height: `${tour.camera.scrollLength * 100}vh` }} aria-hidden />
      <TourInterface tour={tour} />
    </SmoothScrollProvider>
  );
}
