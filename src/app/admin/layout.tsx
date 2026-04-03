'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Squares2X2Icon,
  MapPinIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import AdminSidebar from '@/components/layout/AdminSidebar';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import IdleTimeout from '@/components/IdleTimeout';
import { useEventStream } from '@/hooks/useEventStream';
import { AdminSidebarContext } from '@/contexts/AdminSidebarContext';
import { classNames } from '@/lib/utils';

// Bottom nav: the 5 most-used admin items on mobile
const bottomNav = [
  { name: 'Dashboard', href: '/admin', icon: Squares2X2Icon },
  { name: 'Stations', href: '/admin/stations', icon: MapPinIcon },
  { name: 'Results', href: '/admin/results', icon: CalendarDaysIcon },
  { name: 'Messages', href: '/admin/chat', icon: ChatBubbleLeftRightIcon },
  { name: 'Settings', href: '/admin/settings', icon: Cog6ToothIcon },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Connect to SSE event stream — auto-revalidates SWR keys on server events
  useEventStream();

  const closeSidebar = () => setSidebarOpen(false);
  const openSidebar = () => setSidebarOpen(true);

  const isActive = (href: string) =>
    href === '/admin'
      ? pathname === '/admin'
      : pathname === href || pathname.startsWith(href + '/');

  return (
    <AdminSidebarContext.Provider value={{ open: openSidebar }}>
      <div className="flex h-screen overflow-hidden bg-gray-50">

        {/* ── Desktop sidebar ── */}
        <aside className="hidden md:flex md:w-64 md:shrink-0 md:border-r md:border-gray-200 md:h-full md:overflow-y-auto">
          <AdminSidebar />
        </aside>

        {/* ── Mobile slide-out drawer overlay ── */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={closeSidebar}
              aria-hidden="true"
            />
            {/* Drawer panel — AdminSidebar renders its own scrollable content */}
            <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl flex flex-col overflow-y-auto">
              <AdminSidebar onClose={closeSidebar} showCloseButton />
            </aside>
          </div>
        )}

        {/* ── Main content ── */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Scrollable wrapper — pages that overflow will scroll here.
              The chat page locks itself to this height via flex-1 + overflow-hidden. */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pb-16 md:pb-0">
            {children}
          </div>
        </main>

        {/* ── Mobile bottom navigation ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
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
                  <item.icon
                    className={classNames(
                      'h-5 w-5',
                      active ? 'text-primary-600' : 'text-gray-400'
                    )}
                  />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </nav>

        <ServiceWorkerRegistration />
        <IdleTimeout />
      </div>
    </AdminSidebarContext.Provider>
  );
}
