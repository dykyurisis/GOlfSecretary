import './globals.css';
import type { ReactNode } from 'react';
export const metadata = { title: 'Golf Tee-Time Manager' };
export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
