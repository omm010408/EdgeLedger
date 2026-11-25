import type { Metadata } from 'next';
import './globals.css';
import { SessionSyncProvider } from '../context/SessionSyncContext';
import { TradingProvider } from '../context/TradingContext';
import { AppLayout } from '../components/layout/AppLayout';
import { SignInModal } from '../components/auth/SignInModal';
import { LockScreenOverlay } from '../components/auth/LockScreenOverlay';
import { SignOutConfirmModal } from '../components/auth/SignOutConfirmModal';
import { ConflictInboxModal } from '../components/sync/ConflictInboxModal';

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
        <SessionSyncProvider>
          <TradingProvider>
            <AppLayout>
              {children}
            </AppLayout>
            <SignInModal />
            <LockScreenOverlay />
            <SignOutConfirmModal />
            <ConflictInboxModal />
          </TradingProvider>
        </SessionSyncProvider>
      </body>
    </html>
  );
}
