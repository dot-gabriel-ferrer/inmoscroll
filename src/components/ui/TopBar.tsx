'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFavorites, useTourStore } from '@/store/tourStore';
import type { Tour } from '@/types/tour';
import { BackIcon, HeartIcon, Logo, MenuIcon, ShareIcon } from './icons';

export function TopBar({ tour }: { tour: Tour }) {
  const setMenuOpen = useTourStore((state) => state.setMenuOpen);
  const favorite = useFavorites((state) => state.ids.includes(tour.id));
  const toggleFavorite = useFavorites((state) => state.toggle);
  const [toast, setToast] = useState<string | null>(null);

  const share = async () => {
    const data = { title: tour.title, text: tour.tagline, url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(data.url);
      setToast('Enlace copiado');
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return;
      setToast('No se pudo compartir');
    }
    setTimeout(() => setToast(null), 2200);
  };

  const control =
    'pointer-events-auto inline-flex items-center gap-2 rounded-full px-3 py-2 text-[15px] font-medium transition-colors hover:bg-white/15';

  return (
    <header className="text-shadow-soft pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between px-3 py-3 text-white sm:px-8 sm:py-5">
      <div className="flex items-center gap-1 sm:gap-3">
        <button type="button" className={control} onClick={() => setMenuOpen(true)} aria-haspopup="dialog">
          <MenuIcon /> <span className="hidden sm:inline">Menú</span>
        </button>
        <Link href="/" className={control}>
          <BackIcon /> <span className="hidden sm:inline">Volver</span>
        </Link>
      </div>
      <Link href="/" aria-label="InmoScroll 3D, inicio" className="pointer-events-auto absolute left-1/2 -translate-x-1/2 rounded-full p-1">
        <Logo />
      </Link>
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          className={control}
          onClick={() => toggleFavorite(tour.id)}
          aria-pressed={favorite}
          aria-label={favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
        >
          <HeartIcon fill={favorite ? 'currentColor' : 'none'} />
        </button>
        <button type="button" className={control} onClick={share} aria-label="Compartir">
          <ShareIcon />
        </button>
      </div>
      <div
        role="status"
        className={`glass-dark absolute right-4 top-full rounded-full px-4 py-2 text-sm transition-opacity sm:right-8 ${toast ? 'opacity-100' : 'opacity-0'}`}
      >
        {toast}
      </div>
    </header>
  );
}
