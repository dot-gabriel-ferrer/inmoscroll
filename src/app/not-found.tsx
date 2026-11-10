import Link from 'next/link';
import { Logo } from '@/components/ui/icons';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <Logo className="mx-auto opacity-80" />
        <h1 className="mt-6 text-3xl font-medium tracking-tight">Este recorrido no existe</h1>
        <p className="mt-3 text-white/60">Puede que la propiedad ya no esté publicada.</p>
        <Link href="/" className="mt-8 inline-block rounded-xl border border-white/70 px-6 py-3 font-medium hover:bg-white hover:text-ink">
          Ver propiedades
        </Link>
      </div>
    </main>
  );
}
