'use client';

import { useEffect, useState } from 'react';
import { WifiIcon } from '@heroicons/react/24/outline';

type Status = 'online' | 'offline' | 'syncing' | null;

export default function ServiceWorkerRegistration() {
  const [status, setStatus] = useState<Status>(null);
  const [syncedCount, setSyncedCount] = useState<number | null>(null);

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('SW registration failed:', err);
      });
    }

    // Listen for messages from the service worker
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'sync-complete') {
        const remaining = event.data.remaining as number;
        setSyncedCount(remaining);
        setStatus(null);
        // Auto-dismiss after 3 seconds
        setTimeout(() => setSyncedCount(null), 3000);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }

    // Track online / offline
    const goOffline = () => setStatus('offline');

    const goOnline = () => {
      setStatus('syncing');
      setSyncedCount(null);

      // Ask SW to replay queued requests
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage('replay-queue');
      }

      // Also try Background Sync API
      navigator.serviceWorker.ready.then((reg) => {
        if ('sync' in reg) {
          (reg as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register('replay-queue').catch(() => {});
        }
      });

      // Auto-dismiss after 3 seconds if no sync-complete message received
      setTimeout(() => setStatus((s) => (s === 'syncing' ? null : s)), 3000);
    };

    if (!navigator.onLine) {
      setStatus('offline');
    }

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
    };
  }, []);

  if (!status && syncedCount === null) return null;

  // Show sync-complete banner
  if (syncedCount !== null && !status) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium bg-green-600 text-white transition-all">
        <WifiIcon className="h-4 w-4" />
        {syncedCount === 0 ? 'All changes synced' : `Synced \u2014 ${syncedCount} item${syncedCount === 1 ? '' : 's'} remaining`}
      </div>
    );
  }

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all ${
        status === 'offline'
          ? 'bg-red-600 text-white'
          : 'bg-green-600 text-white'
      }`}
    >
      <WifiIcon className="h-4 w-4" />
      {status === 'offline' && 'You are offline. Changes will sync when reconnected.'}
      {status === 'syncing' && 'Back online \u2014 syncing...'}
    </div>
  );
}
