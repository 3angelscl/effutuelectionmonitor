'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import Image from 'next/image';
import {
  Squares2X2Icon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
  MapPinIcon,
  UsersIcon,
  ChartBarIcon,
  ArrowRightStartOnRectangleIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  EyeIcon,
  ClipboardDocumentCheckIcon,
  ExclamationTriangleIcon,
  RocketLaunchIcon,
  Cog6ToothIcon,
  ArchiveBoxIcon,
  ArrowTrendingUpIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import { classNames } from '@/lib/utils';
import ElectionSelector from './ElectionSelector';

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: Squares2X2Icon, roles: ['ADMIN', 'OFFICER'] },
  { name: 'Voters Register', href: '/admin/voters', icon: UserGroupIcon, roles: ['ADMIN', 'OFFICER'] },
  { name: 'Candidate Management', href: '/admin/candidates', icon: ClipboardDocumentListIcon, roles: ['ADMIN', 'OFFICER'] },
  { name: 'Polling Agents', href: '/admin/agents', icon: UsersIcon, roles: ['ADMIN', 'OFFICER'] },
  { name: 'Agent Performance', href: '/admin/agents/performance', icon: ChartBarIcon, roles: ['ADMIN', 'OFFICER'] },
  { name: 'User Management', href: '/admin/users', icon: UsersIcon, roles: ['ADMIN'] },
  { name: 'Polling Stations', href: '/admin/stations', icon: MapPinIcon, roles: ['ADMIN', 'OFFICER'] },
  { name: 'Election Results', href: '/admin/results', icon: CalendarDaysIcon, roles: ['ADMIN', 'OFFICER'] },
  { name: 'Incidents', href: '/admin/incidents', icon: ExclamationTriangleIcon, roles: ['ADMIN', 'OFFICER'] },
  { name: 'Tally Photos', href: '/admin/tally-photos', icon: PhotoIcon, roles: ['ADMIN', 'OFFICER'] },
  { name: 'Reports', href: '/admin/reports', icon: ChartBarIcon, roles: ['ADMIN'] },
  { name: 'Audit Trail', href: '/admin/audit', icon: ClipboardDocumentCheckIcon, roles: ['ADMIN'] },
  { name: 'Election Setup', href: '/admin/elections/setup', icon: RocketLaunchIcon, roles: ['ADMIN'] },
  { name: 'Election Archives', href: '/admin/elections/archive', icon: ArchiveBoxIcon, roles: ['ADMIN', 'OFFICER'] },
  { name: 'Trend Analytics', href: '/admin/analytics', icon: ArrowTrendingUpIcon, roles: ['ADMIN', 'OFFICER'] },
  { name: 'Messages', href: '/admin/chat', icon: ChatBubbleLeftRightIcon, roles: ['ADMIN', 'OFFICER'] },
  { name: 'Live Viewer', href: '/admin/viewer', icon: EyeIcon },
  { name: 'Settings', href: '/admin/settings', icon: Cog6ToothIcon },
] as const;

export default function AdminSidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const isLoading = status === 'loading';
  const userRole = (session?.user as { role?: string })?.role || 'VIEWER';

  const roleLabel = userRole === 'OFFICER' ? 'Election Officer Panel' : userRole === 'VIEWER' ? 'Viewer Panel' : 'Admin Control Panel';
  const homeHref = userRole === 'VIEWER' ? '/admin/viewer' : '/admin';

  // Filter nav items by role — show all items while session is loading to avoid flash
  const filteredNav = isLoading
    ? navigation.filter(() => true)
    : navigation.filter((item) => {
        if (!('roles' in item) || !item.roles) return true;
        return (item.roles as readonly string[]).includes(userRole);
      });

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100">
        <Link href={homeHref} className="flex items-center gap-3">
          <Image src="/uploads/logo.jpg" alt="Logo" width={36} height={36} className="rounded-lg object-cover w-9 h-9" />
          <div>
            <h1 className="text-sm font-bold text-gray-900">Effutu Monitor</h1>
            <p className="text-xs text-gray-500">{roleLabel}</p>
          </div>
        </Link>
      </div>

      {/* Election Selector */}
      <ElectionSelector />

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1">
        {filteredNav.map((item) => {
          const isActive =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname === item.href || (pathname.startsWith(item.href + '/') && !navigation.some((other) => other.href !== item.href && other.href.startsWith(item.href + '/') && pathname.startsWith(other.href)));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={classNames(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-600 border-l-3 border-primary-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <item.icon className={classNames('h-5 w-5', isActive ? 'text-primary-600' : 'text-gray-400')} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User Info + Logout */}
      <div className="p-4 border-t border-gray-100">
        <Link href="/admin/profile" className="flex items-center gap-3 px-3 py-2 mb-1 rounded-lg hover:bg-gray-50 transition-colors group">
          {(session?.user as { photo?: string })?.photo ? (
            <img
              src={(session?.user as { photo?: string }).photo}
              alt={session?.user?.name || ''}
              className="w-8 h-8 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-primary-600">
                {session?.user?.name?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary-600 transition-colors">
              {session?.user?.name || 'Admin User'}
            </p>
            <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
          </div>
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg w-full transition-colors"
        >
          <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
          Logout
        </button>
      </div>
    </aside>
  );
}
