import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function proxy(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const role = token?.role as string;

    // Admin routes — accessible by ADMIN, VIEWER, and OFFICER
    const adminRoles = ['ADMIN', 'VIEWER', 'OFFICER'];
    if (path.startsWith('/admin') && !adminRoles.includes(role)) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    // VIEWER can only access /admin/viewer and /admin/settings
    if (role === 'VIEWER' && path.startsWith('/admin')) {
      const viewerAllowed = ['/admin/viewer', '/admin/settings'];
      const isAllowed = viewerAllowed.some((p) => path === p || path.startsWith(p + '/'));
      if (!isAllowed) {
        return NextResponse.redirect(new URL('/admin/viewer', req.url));
      }
    }

    // Agent routes
    if (path.startsWith('/agent') && role !== 'AGENT') {
      return NextResponse.redirect(new URL('/login', req.url));
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
  }
);

export const config = {
  matcher: ['/admin/:path*', '/agent/:path*'],
};
