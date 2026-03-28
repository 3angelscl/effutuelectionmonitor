'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import Image from 'next/image';
import {
  Squares2X2Icon,
  ClipboardDocumentCheckIcon,
  ChartBarSquareIcon,
  ArrowRightStartOnRectangleIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import { classNames } from '@/lib/utils';
import AgentHeader from '@/components/layout/AgentHeader';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import IdleTimeout from '@/components/IdleTimeout';
import { useEventStream } from '@/hooks/useEventStream';

const navigation = [
  { name: 'Dashboard', href: '/agent', icon: Squares2X2Icon },
  { name: 'Record Turnout', href: '/agent/turnout', icon: ClipboardDocumentCheckIcon },
  { name: 'Submit Results', href: '/agent/results', icon: ChartBarSquareIcon },
  { name: 'Tally Photos', href: '/agent/tally-photos', icon: PhotoIcon },
  { name: 'Incidents', href: '/agent/incidents', icon: ExclamationTriangleIcon },
  { name: 'Messages', href: '/agent/chat', icon: ChatBubbleLeftRightIcon },
  { name: 'Live Viewer', href: '/agent/viewer', icon: EyeIcon },
  { name: 'Settings', href: '/agent/settings', icon: Cog6ToothIcon },
];

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  // Connect to SSE event stream — auto-revalidates SWR keys on server events
  useEventStream();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <Link href="/agent" className="flex items-center gap-3">
            <Image src="/uploads/logo.jpg" alt="Logo" width={36} height={36} className="rounded-lg object-cover w-9 h-9" />
            <div>
              <h1 className="text-sm font-bold text-gray-900">Election Agent</h1>
              <p className="text-xs text-gray-500">Field Portal</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive = item.href === '/agent'
              ? pathname === '/agent'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={classNames(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <item.icon className={classNames('h-5 w-5', isActive ? 'text-primary-600' : 'text-gray-400')} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <Link href="/agent/settings" className="flex items-center gap-3 px-3 py-2 mb-1 rounded-lg hover:bg-gray-50 transition-colors group">
            {(session?.user as { photo?: string })?.photo ? (
              <img
                src={(session?.user as { photo?: string }).photo}
                alt={session?.user?.name || ''}
                className="w-8 h-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary-600">
                  {session?.user?.name?.[0]?.toUpperCase() || 'A'}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary-600 transition-colors">
                {session?.user?.name}
              </p>
              <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
            </div>
          </Link>
          <button
            onClick={async () => {
              try {
                await fetch('/api/agent/checkin', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'CHECK_OUT' }),
                });
              } catch {
                // Best effort — still sign out even if check-out fails
              }
              signOut({ callbackUrl: '/login' });
            }}
            className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg w-full transition-colors"
          >
            <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <AgentHeader />
        {children}
      </main>
      <ServiceWorkerRegistration />
      <IdleTimeout />
    </div>
  );
}
