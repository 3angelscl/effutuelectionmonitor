'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import Button from '@/components/ui/Button';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_MS = 2 * 60 * 1000; // warn 2 minutes before

export default function IdleTimeout() {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(120);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleSignOut = useCallback(async () => {
    try {
      await fetch('/api/agent/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'CHECK_OUT' }),
      });
    } catch {
      // Best effort — auto-checkout will handle it server-side
    }
    signOut({ callbackUrl: '/login' });
  }, []);

  const resetTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setShowWarning(false);
    setSecondsLeft(120);

    warnTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setSecondsLeft(WARNING_BEFORE_MS / 1000);
      countdownRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);

    idleTimerRef.current = setTimeout(() => {
      handleSignOut();
    }, IDLE_TIMEOUT_MS);
  }, [handleSignOut]);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

    const onActivity = () => {
      if (!showWarning) resetTimers();
    };

    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    resetTimers();

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [resetTimers, showWarning]);

  if (!showWarning) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeStr = minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}`
    : `${seconds}s`;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Session Expiring Soon</h3>
            <p className="text-sm text-gray-500">You have been idle for a while</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          Your session will automatically sign out in{' '}
          <span className="font-bold text-amber-600 text-base">{timeStr}</span>.
          {' '}Click below to stay signed in.
        </p>
        <div className="flex gap-3">
          <Button className="flex-1" onClick={resetTimers}>
            Stay Signed In
          </Button>
          <Button variant="secondary" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
