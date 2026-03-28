'use client';

import AdminSidebar from '@/components/layout/AdminSidebar';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import IdleTimeout from '@/components/IdleTimeout';
import { useEventStream } from '@/hooks/useEventStream';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Connect to SSE event stream — auto-revalidates SWR keys on server events
  useEventStream();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
      <ServiceWorkerRegistration />
      <IdleTimeout />
    </div>
  );
}
