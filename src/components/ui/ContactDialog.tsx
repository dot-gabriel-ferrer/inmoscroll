'use client';

import { useEffect, useRef, type FormEvent } from 'react';
import { formatPrice } from '@/data/tours';
import { useTourStore } from '@/store/tourStore';
import type { Tour } from '@/types/tour';
import { CloseIcon } from './icons';

/**
 * Contact form for the listing agent. There is no backend yet, so submitting composes
 * the enquiry in the visitor's own mail client via a mailto: link.
 */
export function ContactDialog({ tour }: { tour: Tour }) {
  const open = useTourStore((state) => state.contactOpen);
  const setContactOpen = useTourStore((state) => state.setContactOpen);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const chapter = tour.chapters[useTourStore.getState().activeChapter];
    const subject = `Consulta sobre ${tour.title} (${formatPrice(tour)})`;
    const body = [
      String(form.get('message') ?? ''),
      '',
      `Nombre: ${form.get('name')}`,
      `Teléfono: ${form.get('phone') || '—'}`,
      `Estancia consultada: ${chapter?.title ?? tour.title}`,
      `Recorrido: ${window.location.href}`,
    ].join('\n');
    window.location.href = `mailto:${tour.agent.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setContactOpen(false);
  };

  const field = 'mt-1 w-full rounded-xl border border-ink/25 bg-white/70 px-4 py-3 text-base text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none';

  return (
    <dialog
      ref={dialog}
      onClose={() => setContactOpen(false)}
      onClick={(event) => event.target === dialog.current && setContactOpen(false)}
      aria-labelledby="contact-title"
      className="m-auto max-h-[92dvh] w-[min(460px,92vw)] bg-transparent p-0 text-ink backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="glass overflow-y-auto rounded-[28px] px-7 py-7 sm:px-9" data-lenis-prevent>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">{tour.agent.agency}</p>
            <h2 id="contact-title" className="mt-1 text-2xl font-medium tracking-tight">
              Contactar con {tour.agent.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setContactOpen(false)}
            aria-label="Cerrar"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/50 hover:bg-white/80"
          >
            <CloseIcon width={20} height={20} />
          </button>
        </div>
        <p className="mt-3 text-sm text-ink/75">
          {tour.title} · {formatPrice(tour)} · {tour.areaM2} m²
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-medium">
            Nombre
            <input name="name" required autoComplete="name" className={field} />
          </label>
          <label className="block text-sm font-medium">
            Teléfono <span className="font-normal text-ink/50">(opcional)</span>
            <input name="phone" type="tel" autoComplete="tel" className={field} />
          </label>
          <label className="block text-sm font-medium">
            Mensaje
            <textarea
              name="message"
              required
              rows={3}
              defaultValue={`Hola, me interesa ${tour.title} y me gustaría concertar una visita.`}
              className={field}
            />
          </label>
          <button type="submit" className="w-full rounded-xl bg-ink px-5 py-3.5 text-base font-medium text-white transition-opacity hover:opacity-90">
            Abrir correo y enviar
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-ink/75">
          o llama al{' '}
          <a href={`tel:${tour.agent.phone.replace(/\s/g, '')}`} className="font-medium underline underline-offset-4">
            {tour.agent.phone}
          </a>
        </p>
      </div>
    </dialog>
  );
}
