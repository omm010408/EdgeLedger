import type { Metadata } from 'next';
import './globals.css';
import { TradingProvider } from '../context/TradingContext';
import { AppLayout } from '../components/layout/AppLayout';

export const metadata: Metadata = {
  title: 'EDGELEDGER — Advanced Trading Management & Performance Intelligence',
  description: 'Every Account. Every Trade. Every Rule. Professional financial operating system for serious retail traders, funded traders, and trading desks.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark font-terminal">
      <body className="bg-edge-bg text-edge-text-primary antialiased selection:bg-edge-accent/30 selection:text-edge-accent">
        <TradingProvider>
          <AppLayout>
            {children}
          </AppLayout>
        </TradingProvider>
      </body>
    </html>
  );
}
