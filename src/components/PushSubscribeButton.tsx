'use client';

import { useEffect, useState } from 'react';
import { BellIcon, BellSlashIcon } from '@heroicons/react/24/outline';

type PermState = 'unsupported' | 'granted' | 'denied' | 'default' | 'loading';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

export default function PushSubscribeButton() {
  const [state, setState] = useState<PermState>('loading');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    setState(Notification.permission as PermState);
  }, []);

  const subscribe = async () => {
    if (!('serviceWorker' in navigator)) return;
    setState('loading');
    try {
      const reg = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.warn('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set');
        setState('unsupported');
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      setState('granted');
    } catch {
      setState(Notification.permission as PermState);
    }
  };

  const unsubscribe = async () => {
    if (!('serviceWorker' in navigator)) return;
    setState('loading');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('default');
    } catch {
      setState(Notification.permission as PermState);
    }
  };

  if (state === 'unsupported') return null;

  if (state === 'loading') {
    return (
      <button disabled className="p-2 text-gray-300" aria-label="Loading push notifications">
        <BellIcon className="h-5 w-5 animate-pulse" />
      </button>
    );
  }

  if (state === 'granted') {
    return (
      <button
        onClick={unsubscribe}
        className="p-2 text-primary-600 hover:text-primary-700 transition-colors"
        title="Disable push notifications"
        aria-label="Disable push notifications"
      >
        <BellIcon className="h-5 w-5" />
      </button>
    );
  }

  if (state === 'denied') {
    return (
      <button
        disabled
        className="p-2 text-gray-300 cursor-not-allowed"
        title="Notifications blocked — please enable them in browser settings"
        aria-label="Push notifications blocked"
      >
        <BellSlashIcon className="h-5 w-5" />
      </button>
    );
  }

  // default — not yet asked
  return (
    <button
      onClick={subscribe}
      className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
      title="Enable push notifications"
      aria-label="Enable push notifications"
    >
      <BellSlashIcon className="h-5 w-5" />
    </button>
  );
}
