import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Shell from '@/components/Shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'lab.bingo slots',
  description: 'Machines à sous et jeux de table entièrement fictifs, sans argent, autour d’un classement par saison.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = { themeColor: '#1443d6' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
