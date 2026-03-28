import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { verifySync } from 'otplib';
import prisma from './prisma';
import { createRateLimiter } from './rate-limit';

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

        const { success } = authLimiter.check(credentials.email.toLowerCase());
        if (!success) {
          throw new Error('Too many login attempts. Try again in 15 minutes.');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          throw new Error('Invalid email or password');
        }

        const isValidPassword = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isValidPassword) {
          throw new Error('Invalid email or password');
        }

        // Check if 2FA is enabled
        if (user.twoFactorEnabled) {
          // If no TOTP code provided, signal that 2FA is needed
          if (!credentials.totp) {
            throw new Error('2FA_REQUIRED');
          }
          // Verify TOTP code
          const result = verifySync({
            token: credentials.totp,
            secret: user.twoFactorSecret!,
          });
          const isValid = result.valid;
          if (!isValid) {
            throw new Error('Invalid 2FA code');
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          photo: user.photo,
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
      }
      // Allow session updates to propagate photo/name changes immediately
      if (trigger === 'update' && session) {
        if (session.photo !== undefined) token.photo = session.photo;
        if (session.name) token.name = session.name;
      }
      return token;
    },
    async session({ session, token }) {
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
