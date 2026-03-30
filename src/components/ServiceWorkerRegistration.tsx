'use client';

import { useEffect, useState, useCallback } from 'react';
import { WifiIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

type Status = 'online' | 'offline' | 'syncing' | 'update-available' | null;

export default function ServiceWorkerRegistration() {
  const [status, setStatus] = useState<Status>(null);
  const [syncInfo, setSyncInfo] = useState<{ replayed: number; remaining: number } | null>(null);

  const handleUpdate = useCallback(() => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('skip-waiting');
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Register the service worker
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Check for updates periodically (every 30 min)
      const checkInterval = setInterval(() => reg.update(), 30 * 60 * 1000);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setStatus('update-available');
          }
        });
      });

      return () => clearInterval(checkInterval);
    }).catch((err) => {
      console.error('SW registration failed:', err);
    });

    // Reload when new SW takes over
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    // Listen for messages from the service worker
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'sync-complete') {
        setSyncInfo({ replayed: event.data.replayed, remaining: event.data.remaining });
        setStatus(null);
        setTimeout(() => setSyncInfo(null), 4000);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSWMessage);

    // Track online / offline
    const goOffline = () => setStatus('offline');
    const goOnline = () => {
      setStatus('syncing');
      setSyncInfo(null);

      // Ask SW to replay queued requests
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage('replay-queue');
      }

      // Also try Background Sync API
      navigator.serviceWorker.ready.then((reg) => {
        if ('sync' in reg) {
          (reg as unknown as { sync: { register: (tag: string) => Promise<void> } })
            .sync.register('replay-queue').catch(() => {});
        }
      });

      // Auto-dismiss if no sync-complete message
      setTimeout(() => setStatus((s) => (s === 'syncing' ? null : s)), 5000);
    };

    if (!navigator.onLine) setStatus('offline');

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, []);

  // ── Update available banner ──
  if (status === 'update-available') {
    return (
      <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium bg-primary-600 text-white max-w-sm w-[calc(100%-2rem)]">
        <ArrowPathIcon className="h-5 w-5 shrink-0" />
        <span className="flex-1">A new version is available</span>
        <button
          onClick={handleUpdate}
          className="px-3 py-1 bg-white text-primary-700 rounded-lg text-xs font-semibold hover:bg-primary-50 transition-colors"
        >
          Update
        </button>
      </div>
    );
  }

  // ── Sync complete banner ──
  if (syncInfo && !status) {
    return (
      <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium bg-green-600 text-white">
        <WifiIcon className="h-4 w-4" />
        {syncInfo.remaining === 0
          ? `${syncInfo.replayed} change${syncInfo.replayed === 1 ? '' : 's'} synced`
          : `Synced — ${syncInfo.remaining} item${syncInfo.remaining === 1 ? '' : 's'} remaining`}
      </div>
    );
  }

  // ── Offline / syncing banners ──
  if (!status) return null;

  return (
    <div
      className={`fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium transition-all ${
        status === 'offline' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
      }`}
    >
      <WifiIcon className="h-4 w-4" />
      {status === 'offline' && 'You are offline — changes will sync when reconnected'}
      {status === 'syncing' && 'Back online — syncing...'}
    </div>
  );
}
