'use client';

import { useSession, signOut } from 'next-auth/react';
import { useEffect } from 'react';

/**
 * Monitors the session for server-side invalidation (e.g. concurrent login).
 * If the session is invalidated, it forces a sign-out with a redirect to the login page.
 */
export default function SessionGuard() {
  const { data: session } = useSession();

  useEffect(() => {
    if (session) {
      console.log('Session state:', (session as any).error ? 'Invalidated' : 'Active');
    }
    if (session && (session as any).error === 'SessionInvalidated') {
      console.warn('Session mismatch detected! Logging out...');
      signOut({ callbackUrl: '/login?message=loggedout' });
    }
  }, [session]);

  return null;
}
