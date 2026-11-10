import Link from 'next/link';
import { Logo } from '@/components/ui/icons';
import { formatPrice, tours } from '@/data/tours';
import { publicUrl } from '@/lib/assets';

const FEATURES = [
  ['Scroll determinista', 'Lenis y ScrollTrigger comparten el reloj de GSAP: la cámara avanza por un spline sin saltos ni temblores.'],
  ['Render bajo demanda', 'El motor sólo dibuja cuando el scroll lo exige. En reposo, cero ciclos de GPU.'],
  ['Mallas y Gaussian Splatting', 'GLB con Draco, Meshopt y KTX2, o capturas 3DGS en SPZ ordenadas en un Web Worker.'],
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 py-8 sm:px-10">
      <header className="flex items-center gap-3">
        <Logo />
        <span className="text-lg font-medium tracking-tight">InmoScroll 3D</span>
      </header>

      <section className="mt-16 max-w-3xl sm:mt-24">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-clay">Recorridos inmobiliarios inmersivos</p>
        <h1 className="mt-4 text-5xl font-medium leading-[1.02] tracking-tight sm:text-7xl">Visita la vivienda con sólo deslizar.</h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
          El scroll de la página conduce una cámara cinematográfica por el interior de cada propiedad. Sin instalar nada,
          a 60 fps, también en el móvil.
        </p>
      </section>

      <section aria-labelledby="tours-title" className="mt-14 sm:mt-20">
        <h2 id="tours-title" className="text-sm font-medium uppercase tracking-[0.2em] text-white/50">
          Propiedades
        </h2>
        <ul className="mt-5 grid gap-5 md:grid-cols-2">
          {tours.map((tour) => (
            <li key={tour.id}>
              <Link
                href={`/tour/${tour.id}`}
                className="group relative flex aspect-[16/11] flex-col justify-end overflow-hidden rounded-[28px] border border-white/15 bg-cover bg-center p-6 sm:p-8"
                style={{ backgroundImage: `url(${publicUrl(`/thumbs/${tour.id}.jpg`)})` }}
              >
                <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent transition-opacity group-hover:opacity-80" />
                <span className="glass-dark absolute left-5 top-5 rounded-full px-3.5 py-1.5 text-xs font-medium">{tour.technology}</span>
                <span className="relative">
                  <span className="block text-sm text-white/75">{tour.location}</span>
                  <span className="mt-1 block text-2xl font-medium tracking-tight sm:text-3xl">{tour.title}</span>
                  <span className="mt-2 block text-white/80">
                    {formatPrice(tour)} · {tour.areaM2} m² · {tour.bedrooms} dorm.
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 grid gap-8 border-t border-white/10 pt-10 sm:mt-20 md:grid-cols-3">
        {FEATURES.map(([title, text]) => (
          <div key={title}>
            <h3 className="text-lg font-medium">{title}</h3>
            <p className="mt-2 leading-relaxed text-white/60">{text}</p>
          </div>
        ))}
      </section>

      <footer className="mt-auto pt-16 text-sm text-white/40">InmoScroll 3D · Fase 1 — núcleo de renderizado</footer>
    </main>
  );
}
