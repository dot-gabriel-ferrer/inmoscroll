'use client';

import { useTourStore } from '@/store/tourStore';
import type { Tour } from '@/types/tour';
import { CloseIcon, MouseIcon, NodesIcon } from './icons';

/** Floating glass panel describing the chapter the camera is currently travelling through. */
export function ChapterCard({ tour }: { tour: Tour }) {
  const index = useTourStore((state) => state.activeChapter);
  const dismissed = useTourStore((state) => state.cardDismissed);
  const dismissCard = useTourStore((state) => state.dismissCard);
  const setContactOpen = useTourStore((state) => state.setContactOpen);
  const chapter = tour.chapters[index];
  if (!chapter) return null;
  const left = chapter.cardSide === 'left';

  if (index === 0) {
    return (
      <section
        key={chapter.id}
        aria-live="polite"
        className="glass-dark card-in pointer-events-auto fixed inset-x-4 bottom-6 z-30 rounded-[28px] px-7 py-7 sm:inset-x-auto sm:bottom-auto sm:left-[7vw] sm:top-1/2 sm:w-[min(480px,42vw)] sm:-translate-y-1/2 sm:px-11 sm:py-12"
      >
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-white/75">{chapter.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">{chapter.title}</h1>
        <dl className="mt-6 space-y-3 sm:mt-8 sm:space-y-5">
          {chapter.stats?.map((stat) => (
            <div key={stat.label} className="flex flex-wrap items-baseline gap-x-3 text-2xl font-normal tracking-tight sm:text-[2.1rem]">
              <dt>{stat.label}:</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 flex items-center gap-3 text-[15px] text-white/85 sm:mt-8">
          <MouseIcon className="shrink-0" /> {chapter.description}
        </p>
      </section>
    );
  }

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => dismissCard(false)}
        className={`glass card-in pointer-events-auto fixed bottom-6 z-30 rounded-full px-5 py-3 text-sm font-medium ${left ? 'left-4 sm:left-[7vw]' : 'right-14 sm:right-20'}`}
      >
        {chapter.title}
      </button>
    );
  }

  return (
    <section
      key={chapter.id}
      aria-live="polite"
      className={`glass card-in pointer-events-auto fixed inset-x-4 bottom-5 z-30 rounded-[28px] px-6 pb-5 pt-5 sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:w-[min(400px,36vw)] sm:-translate-y-1/2 sm:px-9 sm:pb-7 sm:pt-8 ${left ? 'sm:left-[7vw]' : 'sm:right-20'}`}
    >
      <div className="flex items-center justify-between">
        <NodesIcon className="opacity-80" />
        <button
          type="button"
          onClick={() => dismissCard(true)}
          aria-label="Ocultar ficha"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/50 transition-colors hover:bg-white/80"
        >
          <CloseIcon width={20} height={20} />
        </button>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink/60 sm:mt-8">{chapter.eyebrow}</p>
      <h2 className="mt-2 text-3xl font-medium leading-[1.05] tracking-tight sm:text-[2.9rem]">{chapter.title}</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-ink/85 sm:mt-6 sm:text-base">{chapter.description}</p>
      {chapter.stats && (
        <dl className="mt-4 hidden gap-8 sm:flex">
          {chapter.stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-xs uppercase tracking-wider text-ink/55">{stat.label}</dt>
              <dd className="text-lg font-medium">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <button
        type="button"
        onClick={() => setContactOpen(true)}
        className="mt-5 w-full rounded-xl border border-ink/80 px-5 py-3.5 text-base font-medium transition-colors hover:bg-ink hover:text-white sm:mt-8"
      >
        Contactar al Agente
      </button>
      <div className="mt-5 hidden justify-center text-ink/70 sm:flex">
        <MouseIcon />
      </div>
    </section>
  );
}
