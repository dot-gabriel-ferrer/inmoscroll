import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import 'lenis/dist/lenis.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'InmoScroll 3D', template: '%s · InmoScroll 3D' },
  description: 'Recorridos inmobiliarios inmersivos guiados por el scroll.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#14110f',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className="antialiased">
      <body>{children}</body>
    </html>
  );
}
