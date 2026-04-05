import { withAuth } from 'next-auth/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import { validateCsrf } from '@/lib/csrf';

// Auth proxy for the admin/agent dashboards. Gated by a valid NextAuth JWT.
const authProxy = withAuth(
  function proxy(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const role = token?.role as string;

    // Admin routes — accessible by ADMIN, VIEWER, and OFFICER only
    const adminRoles = ['ADMIN', 'VIEWER', 'OFFICER'];
    if (path.startsWith('/admin') && !adminRoles.includes(role)) {
      // Agents belong on /agent, everyone else back to login
      return NextResponse.redirect(new URL(role === 'AGENT' ? '/agent' : '/login', req.url));
    }

    // VIEWER can only access /admin/viewer and /admin/settings
    if (role === 'VIEWER' && path.startsWith('/admin')) {
      const viewerAllowed = ['/admin/viewer', '/admin/settings'];
      const isAllowed = viewerAllowed.some((p) => path === p || path.startsWith(p + '/'));
      if (!isAllowed) {
        return NextResponse.redirect(new URL('/admin/viewer', req.url));
      }
    }

    // Agent routes — AGENT only; admins/officers use /admin
    if (path.startsWith('/agent') && role !== 'AGENT') {
      return NextResponse.redirect(new URL(adminRoles.includes(role) ? '/admin' : '/login', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // All protected routes require a token
        return !!token;
      },
    },
  },
);

/**
 * Root proxy. Dispatches by path:
 *  - /api/*          → CSRF validation for state-changing methods (no auth gate here;
 *                      individual routes still enforce authentication).
 *  - /admin, /agent  → NextAuth withAuth gate + role-based redirects.
 */
export default function proxy(req: NextRequest, event: NextFetchEvent) {
  const path = req.nextUrl.pathname;

  if (path.startsWith('/api/')) {
    const csrfError = validateCsrf(req);
    if (csrfError) return csrfError;
    return NextResponse.next();
  }

  return (authProxy as unknown as (
    req: NextRequest,
    event: NextFetchEvent,
  ) => ReturnType<typeof authProxy>)(req, event);
}

export const config = {
  matcher: ['/admin/:path*', '/agent/:path*', '/api/:path*'],
};
