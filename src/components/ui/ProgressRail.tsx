'use client';

import { useEffect, useRef } from 'react';
import { useTourStore } from '@/store/tourStore';
import type { Tour } from '@/types/tour';

/** Segmented vertical progress indicator; each segment is a chapter and jumps to it. */
export function ProgressRail({ tour, onJump }: { tour: Tour; onJump: (chapterIndex: number) => void }) {
  const active = useTourStore((state) => state.activeChapter);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const paint = (progress: number) => {
      tour.chapters.forEach((chapter, i) => {
        const [start, end] = chapter.range;
        const local = Math.min(1, Math.max(0, (progress - start) / (end - start)));
        const fill = fills.current[i];
        if (fill) fill.style.transform = `scaleY(${local})`;
      });
    };
    paint(useTourStore.getState().progress);
    // Imperative subscription: progress changes every frame and must not re-render React.
    return useTourStore.subscribe((state, previous) => {
      if (state.progress !== previous.progress) paint(state.progress);
    });
  }, [tour]);

  return (
    <nav aria-label="Capítulos del recorrido" className="pointer-events-auto fixed right-3 top-[36%] z-30 flex h-[34vh] -translate-y-1/2 flex-col gap-2 sm:right-7 sm:top-1/2 sm:h-[46vh]">
      {tour.chapters.map((chapter, i) => (
        <button
          key={chapter.id}
          type="button"
          onClick={() => onJump(i)}
          aria-label={chapter.title}
          aria-current={i === active ? 'step' : undefined}
          title={chapter.title}
          style={{ flexGrow: chapter.range[1] - chapter.range[0] }}
          className="group relative w-5 basis-0"
        >
          <span
            className={`absolute inset-y-0 left-1/2 -translate-x-1/2 overflow-hidden rounded-full bg-white/35 shadow-[0_0_10px_rgb(0_0_0/0.25)] transition-[width] duration-300 group-hover:w-[6px] ${i === active ? 'w-[6px]' : 'w-[3px]'}`}
          >
            <span ref={(el) => { fills.current[i] = el; }} className="absolute inset-0 origin-top scale-y-0 rounded-full bg-white" />
          </span>
        </button>
      ))}
    </nav>
  );
}
