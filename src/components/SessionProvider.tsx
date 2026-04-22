'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';

export default function SessionProvider({ 
  children,
  ...props 
}: { 
  children: ReactNode;
  [key: string]: any;
}) {
  return <NextAuthSessionProvider {...props}>{children}</NextAuthSessionProvider>;
}
