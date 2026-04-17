'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import Image from 'next/image';
import { useState } from 'react';
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
  Bars3Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { classNames } from '@/lib/utils';
import AgentHeader from '@/components/layout/AgentHeader';
import PushSubscribeButton from '@/components/PushSubscribeButton';
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

// Bottom nav shows the 5 most-used items on mobile
const bottomNav = [
  { name: 'Home', href: '/agent', icon: Squares2X2Icon },
  { name: 'Turnout', href: '/agent/turnout', icon: ClipboardDocumentCheckIcon },
  { name: 'Results', href: '/agent/results', icon: ChartBarSquareIcon },
  { name: 'Photos', href: '/agent/tally-photos', icon: PhotoIcon },
  { name: 'Messages', href: '/agent/chat', icon: ChatBubbleLeftRightIcon },
];

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Connect to SSE event stream — auto-revalidates SWR keys on server events
  useEventStream();

  const isActive = (href: string) =>
    href === '/agent' ? pathname === '/agent' : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 min-h-screen flex-col">
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
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={classNames(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              <item.icon className={classNames('h-5 w-5 shrink-0', isActive(item.href) ? 'text-primary-600' : 'text-gray-400')} />
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <Link href="/agent/settings" className="flex items-center gap-3 px-3 py-2 mb-1 rounded-lg hover:bg-gray-50 transition-colors group">
            {(session?.user as { photo?: string })?.photo ? (
              <img src={(session?.user as { photo?: string }).photo} alt={session?.user?.name || ''} className="w-8 h-8 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary-600">{session?.user?.name?.[0]?.toUpperCase() || 'A'}</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary-600 transition-colors">{session?.user?.name}</p>
              <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
            </div>
          </Link>
          <button
            onClick={async () => {
              try {
                await fetch('/api/agent/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'CHECK_OUT' }) });
              } catch { /* best effort */ }
              signOut({ callbackUrl: '/login' });
            }}
            className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg w-full transition-colors"
          >
            <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* ── Mobile slide-out drawer overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          {/* Drawer */}
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <Link href="/agent" className="flex items-center gap-3" onClick={() => setSidebarOpen(false)}>
                <Image src="/uploads/logo.jpg" alt="Logo" width={32} height={32} className="rounded-lg object-cover w-8 h-8" />
                <div>
                  <h1 className="text-sm font-bold text-gray-900">Election Agent</h1>
                  <p className="text-xs text-gray-500">Field Portal</p>
                </div>
              </Link>
              <button onClick={() => setSidebarOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={classNames(
                    'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                    isActive(item.href) ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <item.icon className={classNames('h-5 w-5 shrink-0', isActive(item.href) ? 'text-primary-600' : 'text-gray-400')} />
                  {item.name}
                </Link>
              ))}
            </nav>

            <div className="p-4 border-t border-gray-100">
              <div className="flex items-center gap-3 px-3 py-2 mb-2">
                {(session?.user as { photo?: string })?.photo ? (
                  <img src={(session?.user as { photo?: string }).photo} alt={session?.user?.name || ''} className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary-600">{session?.user?.name?.[0]?.toUpperCase() || 'A'}</span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{session?.user?.name}</p>
                  <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    await fetch('/api/agent/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'CHECK_OUT' }) });
                  } catch { /* best effort */ }
                  signOut({ callbackUrl: '/login' });
                }}
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg w-full transition-colors"
              >
                <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
                Logout
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-500 hover:text-gray-700 rounded-lg"
            aria-label="Open menu"
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
          <Link href="/agent" className="flex items-center gap-2">
            <Image src="/uploads/logo.jpg" alt="Logo" width={28} height={28} className="rounded object-cover w-7 h-7" />
            <span className="text-sm font-bold text-gray-900">Field Portal</span>
          </Link>
          <div className="flex w-10 justify-end">
            <PushSubscribeButton />
          </div>
        </div>

        {/* Desktop header */}
        <div className="hidden md:block">
          <AgentHeader />
        </div>

        {/* Page content — extra bottom padding on mobile for the bottom nav */}
        <div className="pb-20 md:pb-0">
          {children}
        </div>
      </main>

      {/* ── Mobile bottom navigation ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-bottom">
        <div className="flex items-stretch">
          {bottomNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={classNames(
                  'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors min-h-[56px]',
                  active ? 'text-primary-600' : 'text-gray-500'
                )}
              >
                <item.icon className={classNames('h-5 w-5', active ? 'text-primary-600' : 'text-gray-400')} />
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>

      <IdleTimeout />
    </div>
  );
}
