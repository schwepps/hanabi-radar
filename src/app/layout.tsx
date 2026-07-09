import '@/styles/globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Figtree, JetBrains_Mono } from 'next/font/google';

// Variable fonts (no `weight` list) so the full axis is available — the design
// uses Figtree 500/600/700/800 and JetBrains Mono 400/600, all within range.
const figtree = Figtree({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-figtree',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'Hanabi Radar',
  description: 'Hanabi Radar — dashboard',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`${figtree.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
