'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { formatPrice } from '@/data/tours';
import { getPrerender } from '@/lib/prerender';
import { switchView, useTourStore, useViewPreference } from '@/store/tourStore';
import type { Tour } from '@/types/tour';
import { CloseIcon, MoonIcon, SunIcon } from './icons';

const QUALITY_LABEL = { 3: 'Alta · SSAO + Bloom + Profundidad de campo', 2: 'Media · SSAO + Bloom', 1: 'Básica · sin postprocesado' } as const;

const VIEWS = [
  ['frames', 'Imágenes'],
  ['live', '3D en vivo'],
] as const;

const subscribeNever = () => () => {};
const supportsWebGL = () => typeof WebGL2RenderingContext !== 'undefined';

export function MenuDrawer({ tour, onJump }: { tour: Tour; onJump: (chapterIndex: number) => void }) {
  const open = useTourStore((state) => state.menuOpen);
  const setMenuOpen = useTourStore((state) => state.setMenuOpen);
  const active = useTourStore((state) => state.activeChapter);
  const timeOfDay = useTourStore((state) => state.timeOfDay);
  const setTimeOfDay = useTourStore((state) => state.setTimeOfDay);
  const quality = useTourStore((state) => state.quality);
  const dialog = useRef<HTMLDialogElement>(null);
  const isMesh = tour.scene.type === 'gltf';
  const prerender = getPrerender(tour.id);
  const view = useViewPreference((state) => state.mode);
  const live = !prerender || view === 'live';
  // The real-time engine is only offered where it can run at all.
  const canGoLive = useSyncExternalStore(subscribeNever, supportsWebGL, () => false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      onClose={() => setMenuOpen(false)}
      onClick={(event) => event.target === dialog.current && setMenuOpen(false)}
      aria-label="Menú del recorrido"
      className="m-0 h-dvh max-h-none w-[min(380px,88vw)] max-w-none bg-transparent p-3 text-ink backdrop:bg-black/35 backdrop:backdrop-blur-[2px]"
    >
      <div className="glass flex h-full flex-col overflow-y-auto rounded-[28px] px-7 py-7" data-lenis-prevent>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">{tour.location}</p>
            <h2 className="mt-1 text-2xl font-medium tracking-tight">{tour.title}</h2>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/50 hover:bg-white/80"
          >
            <CloseIcon width={20} height={20} />
          </button>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {[
            ['Precio', formatPrice(tour)],
            ['Superficie', `${tour.areaM2} m²`],
            ['Dormitorios', String(tour.bedrooms)],
            ['Baños', String(tour.bathrooms)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wider text-ink/55">{label}</dt>
              <dd className="text-lg font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        <h3 className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">Recorrido</h3>
        <ol className="mt-2 -mx-3">
          {tour.chapters.map((chapter, i) => (
            <li key={chapter.id}>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onJump(i);
                }}
                aria-current={i === active ? 'step' : undefined}
                className={`flex w-full items-baseline gap-3 rounded-xl px-3 py-2.5 text-left text-lg transition-colors hover:bg-white/60 ${i === active ? 'bg-white/55 font-medium' : ''}`}
              >
                <span className="w-6 text-xs tabular-nums text-ink/50">{String(i).padStart(2, '0')}</span>
                {chapter.title}
              </button>
            </li>
          ))}
        </ol>

        {isMesh && (
          <>
            <h3 className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">Ambiente</h3>
            <div role="group" aria-label="Ambiente" className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-white/45 p-1">
              {([['day', 'Día', SunIcon], ['night', 'Noche', MoonIcon]] as const).map(([value, label, IconComponent]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={timeOfDay === value}
                  onClick={() => setTimeOfDay(value)}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors ${timeOfDay === value ? 'bg-ink text-white' : 'hover:bg-white/70'}`}
                >
                  <IconComponent width={18} height={18} /> {label}
                </button>
              ))}
            </div>
          </>
        )}

        {prerender && canGoLive && (
          <>
            <h3 className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">Visualización</h3>
            <div role="group" aria-label="Visualización" className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-white/45 p-1">
              {VIEWS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => switchView(value)}
                  className={`rounded-xl py-2.5 text-sm font-medium transition-colors ${view === value ? 'bg-ink text-white' : 'hover:bg-white/70'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink/60">
              {live
                ? 'Motor 3D en tiempo real: máxima nitidez, necesita una tarjeta gráfica capaz.'
                : 'Recorrido prerenderizado: funciona en cualquier dispositivo y no usa la tarjeta gráfica.'}
            </p>
          </>
        )}

        <div className="mt-auto pt-8 text-xs leading-relaxed text-ink/60">
          <p>{tour.technology}</p>
          {isMesh && live && canGoLive && <p>Calidad adaptativa: {QUALITY_LABEL[quality]}</p>}
        </div>
      </div>
    </dialog>
  );
}
