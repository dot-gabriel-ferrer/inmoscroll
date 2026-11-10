import type { Tour } from '@/types/tour';
import aticoMirador from './atico-mirador.json';

const mesh = aticoMirador as unknown as Tour;

/** Same property captured as a radiance field: identical rail, different pipeline. */
const splat: Tour = {
  ...mesh,
  id: 'atico-mirador-splat',
  title: 'Ático Mirador · Captura 3DGS',
  tagline: 'La misma vivienda servida como Gaussian Splatting en formato SPZ',
  technology: 'Gaussian Splatting · SPZ',
  scene: { type: 'splat', url: 'atico-mirador.spz', occluderUrl: 'atico-mirador.glb' },
};

export const tours: Tour[] = [mesh, splat];

export function getTour(id: string): Tour | undefined {
  return tours.find((tour) => tour.id === id);
}

export function formatPrice(tour: Pick<Tour, 'price' | 'currency'>): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: tour.currency, maximumFractionDigits: 0 }).format(
    tour.price,
  );
}
