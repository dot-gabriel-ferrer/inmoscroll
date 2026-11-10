import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TourExperience } from '@/components/ui/TourExperience';
import { getTour, tours } from '@/data/tours';

export function generateStaticParams() {
  return tours.map((tour) => ({ id: tour.id }));
}

export async function generateMetadata({ params }: PageProps<'/tour/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const tour = getTour(id);
  return tour ? { title: tour.title, description: tour.tagline } : {};
}

export default async function TourPage({ params }: PageProps<'/tour/[id]'>) {
  const { id } = await params;
  const tour = getTour(id);
  if (!tour) notFound();
  // Keyed so switching tours tears the WebGL session down instead of patching it.
  return <TourExperience key={tour.id} tour={tour} />;
}
