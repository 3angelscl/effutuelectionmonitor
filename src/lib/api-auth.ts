/**
 * Centralized API authentication and authorization helpers.
 *
 * Usage:
 *   const { user } = await requireAuth();                   // any logged-in user
 *   const { user } = await requireRole('ADMIN');            // admin only
 *   const { user } = await requireRole(['ADMIN', 'AGENT']); // admin or agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { validateCsrf } from '@/lib/csrf';
import { logger } from '@/lib/logger';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'AGENT' | 'VIEWER' | 'OFFICER';
}

export class ApiError {
  constructor(
    public readonly status: number,
    public readonly message: string,
  ) {}

  toResponse() {
    return NextResponse.json({ error: this.message }, { status: this.status });
  }
}

/**
 * Require an authenticated session. Throws ApiError if not authenticated.
 */
export async function requireAuth(): Promise<{ user: AuthUser }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new ApiError(401, 'Authentication required');
  }

  const user = session.user as AuthUser;
  if (!user.id || !user.role) {
    throw new ApiError(401, 'Invalid session');
  }

  return { user };
}

/**
 * Require an authenticated session with one of the specified roles.
 * @param role - A single role or array of allowed roles
 */
export async function requireRole(
  role: string | string[],
): Promise<{ user: AuthUser }> {
  const { user } = await requireAuth();

  const allowedRoles = Array.isArray(role) ? role : [role];
  if (!allowedRoles.includes(user.role)) {
    throw new ApiError(403, `Forbidden — requires ${allowedRoles.join(' or ')} role`);
  }

  return { user };
}

/**
 * Wraps an API route handler with automatic error handling.
 * Catches ApiError and unknown errors, returning proper JSON responses.
 *
 * Usage:
 *   export const GET = apiHandler(async (request) => {
 *     const { user } = await requireAuth();
 *     // ... your logic
 *     return NextResponse.json(data);
 *   });
 */
export function apiHandler(
  handler: (request: NextRequest) => Promise<Response>,
) {
  return async (request: NextRequest) => {
    try {
      // Validate CSRF for all state-changing requests
      const csrfError = validateCsrf(request);
      if (csrfError) return csrfError;

      return await handler(request);
    } catch (error) {
      if (error instanceof ApiError) {
        return error.toResponse();
      }
      logger.error('Unhandled API error', {
        method: request.method,
        url: request.url,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  };
}
