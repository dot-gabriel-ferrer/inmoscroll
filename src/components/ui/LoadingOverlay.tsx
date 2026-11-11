'use client';

import { useTourStore } from '@/store/tourStore';
import type { Tour } from '@/types/tour';
import { Logo } from './icons';

export function LoadingOverlay({ tour }: { tour: Tour }) {
  const loading = useTourStore((state) => state.loading);
  const { progress } = loading;

  if (loading.error) {
    return (
      <div role="alert" className="fixed inset-0 z-50 grid place-items-center bg-ink px-6 text-center">
        <div className="max-w-sm">
          <h2 className="text-2xl font-medium">No se pudo cargar el recorrido</h2>
          <p className="mt-3 text-white/70">{loading.error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-xl border border-white/70 px-6 py-3 font-medium hover:bg-white hover:text-ink"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden={loading.ready}
      className={`fixed inset-0 z-50 grid place-items-center bg-ink transition-opacity duration-700 ${loading.ready ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
    >
      <div className="flex w-56 flex-col items-center text-center">
        <Logo className="opacity-90" />
        <p className="mt-5 text-lg font-medium">{tour.title}</p>
        <p className="mt-1 text-sm text-white/60">Preparando el recorrido…</p>
        <div
          role="progressbar"
          aria-label="Carga del recorrido"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="mt-6 h-[3px] w-full overflow-hidden rounded-full bg-white/20"
        >
          <div className="h-full origin-left bg-white transition-transform duration-300" style={{ transform: `scaleX(${progress})` }} />
        </div>
      </div>
    </div>
  );
}
