import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { verifySync } from 'otplib';
import prisma from './prisma';
import { createRateLimiter } from './rate-limit';
import { decrypt } from './crypto';
import { logger } from './logger';

const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('NEXTAUTH_SECRET environment variable is required');
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
        totp: { label: '2FA Code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const normalizedEmail = credentials.email.toLowerCase().trim();

        const { success } = await authLimiter.check(normalizedEmail);
        if (!success) {
          logger.warn('Login rate limit exceeded', { email: normalizedEmail });
          throw new Error('Too many login attempts. Try again in 15 minutes.');
        }

        // Also reject soft-deleted users
        const user = await prisma.user.findFirst({
          where: { email: normalizedEmail, deletedAt: null },
        });

        if (!user) {
          logger.warn('Login failed: user not found or deleted', { email: normalizedEmail });
          throw new Error('Invalid email or password');
        }

        const isValidPassword = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isValidPassword) {
          logger.warn('Login failed: invalid password', { email: normalizedEmail, userId: user.id });
          throw new Error('Invalid email or password');
        }

        // Check if 2FA is enabled
        if (user.twoFactorEnabled) {
          // If no TOTP code provided, signal that 2FA is needed
          if (!credentials.totp) {
            throw new Error('2FA_REQUIRED');
          }
          // Decrypt the stored secret (handles both encrypted and legacy plaintext)
          const totpSecret = decrypt(user.twoFactorSecret!);
          // Verify TOTP code
          const result = verifySync({
            token: credentials.totp,
            secret: totpSecret,
          });
          const isValid = result.valid;
          if (!isValid) {
            logger.warn('Login failed: invalid 2FA code', { email: normalizedEmail, userId: user.id });
            throw new Error('Invalid 2FA code');
          }
        }

        // Increment sessionVersion to enforce one-device-at-a-time (invalidates previous JWTs)
        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: { sessionVersion: { increment: 1 } },
        });

        return {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: updatedUser.role,
          photo: updatedUser.photo,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as unknown as { role: string }).role;
        token.photo = (user as unknown as { photo: string | null }).photo;
        // Store sessionVersion at sign-in so we can detect forced invalidations
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { sessionVersion: true },
        });
        token.sessionVersion = dbUser?.sessionVersion ?? 1;
      }

      // On every token refresh, verify the session hasn't been force-invalidated
      // (e.g. password change, soft-delete, or admin bump of sessionVersion)
      // TODO: This hits the DB on every refresh. Consider caching sessionVersion in Redis
      // to improve performance under high concurrent load.
      if (!user && token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { sessionVersion: true, deletedAt: true },
        });
        // Invalidate if: user soft-deleted or sessionVersion bumped since sign-in
        const tokenVersion = (token.sessionVersion as number | undefined) ?? 1;
        if (
          !dbUser ||
          dbUser.deletedAt !== null ||
          (dbUser.sessionVersion ?? 1) !== tokenVersion
        ) {
          return { error: 'SessionInvalidated' };
        }
      }

      // Allow session updates to propagate photo/name changes immediately
      if (trigger === 'update' && session) {
        if (session.photo !== undefined) token.photo = session.photo;
        if (session.name) token.name = session.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.error) {
        (session as any).error = token.error;
      }
      if (session.user) {
        (session.user as { id: string; role: string; photo?: string | null }).id = token.id as string;
        (session.user as { id: string; role: string; photo?: string | null }).role = token.role as string;
        (session.user as { id: string; role: string; photo?: string | null }).photo = token.photo as string | null | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
};
