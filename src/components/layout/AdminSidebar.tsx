'use client';

import { useState, useEffect } from 'react';
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
  XMarkIcon,
  ChevronDownIcon,
  ShieldCheckIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';
import { classNames } from '@/lib/utils';
import ElectionSelector from './ElectionSelector';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  roles?: readonly string[];
}

interface NavGroup {
  name: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  roles?: readonly string[];
  children: NavItem[];
}

type NavEntry =
  | (NavItem & { type: 'link' })
  | (NavGroup & { type: 'group' });

const navigation: NavEntry[] = [
  { type: 'link', name: 'Dashboard', href: '/admin', icon: Squares2X2Icon, roles: ['ADMIN', 'OFFICER'] },
  {
    type: 'group',
    name: 'Elections',
    icon: CalendarDaysIcon,
    roles: ['ADMIN', 'OFFICER'],
    children: [
      { name: 'Election Setup', href: '/admin/elections/setup', icon: RocketLaunchIcon, roles: ['ADMIN'] },
      { name: 'Election Results', href: '/admin/results', icon: ChartBarIcon, roles: ['ADMIN', 'OFFICER'] },
      { name: 'Pink Sheets', href: '/admin/tally-photos', icon: PhotoIcon, roles: ['ADMIN', 'OFFICER'] },
      { name: 'Election Archives', href: '/admin/elections/archive', icon: ArchiveBoxIcon, roles: ['ADMIN', 'OFFICER'] },
      { name: 'Trend Analytics', href: '/admin/analytics', icon: ArrowTrendingUpIcon, roles: ['ADMIN', 'OFFICER'] },
    ],
  },
  {
    type: 'group',
    name: 'People',
    icon: UsersIcon,
    roles: ['ADMIN', 'OFFICER'],
    children: [
      { name: 'Voters Register', href: '/admin/voters', icon: UserGroupIcon, roles: ['ADMIN', 'OFFICER'] },
      { name: 'Candidate Management', href: '/admin/candidates', icon: ClipboardDocumentListIcon, roles: ['ADMIN', 'OFFICER'] },
      { name: 'Polling Agents', href: '/admin/agents', icon: UsersIcon, roles: ['ADMIN', 'OFFICER'] },
      { name: 'Agent Performance', href: '/admin/agents/performance', icon: ChartBarIcon, roles: ['ADMIN', 'OFFICER'] },
      { name: 'User Management', href: '/admin/users', icon: UsersIcon, roles: ['ADMIN'] },
    ],
  },
  {
    type: 'group',
    name: 'Field Operations',
    icon: SignalIcon,
    roles: ['ADMIN', 'OFFICER'],
    children: [
      { name: 'Polling Stations', href: '/admin/stations', icon: MapPinIcon, roles: ['ADMIN', 'OFFICER'] },
      { name: 'Electoral Areas', href: '/admin/electoral-areas', icon: MapPinIcon, roles: ['ADMIN', 'OFFICER'] },
      { name: 'Incidents', href: '/admin/incidents', icon: ExclamationTriangleIcon, roles: ['ADMIN', 'OFFICER'] },
    ],
  },
  { type: 'link', name: 'Live Viewer', href: '/admin/viewer', icon: EyeIcon },
  { type: 'link', name: 'Messages', href: '/admin/chat', icon: ChatBubbleLeftRightIcon, roles: ['ADMIN', 'OFFICER'] },
  {
    type: 'group',
    name: 'Administration',
    icon: ShieldCheckIcon,
    roles: ['ADMIN'],
    children: [
      { name: 'Reports', href: '/admin/reports', icon: ChartBarIcon, roles: ['ADMIN'] },
      { name: 'Audit Trail', href: '/admin/audit', icon: ClipboardDocumentCheckIcon, roles: ['ADMIN'] },
      { name: 'Settings', href: '/admin/settings', icon: Cog6ToothIcon },
    ],
  },
];

// Collect all child hrefs for a group
function getGroupHrefs(entry: NavEntry): string[] {
  if (entry.type === 'link') return [entry.href];
  return entry.children.map((c) => c.href);
}

// Check if a pathname matches a given href
function isLinkActive(pathname: string, href: string, allHrefs: string[]): boolean {
  if (href === '/admin') return pathname === '/admin';
  return (
    pathname === href ||
    (pathname.startsWith(href + '/') &&
      !allHrefs.some((other) => other !== href && other.startsWith(href + '/') && pathname.startsWith(other)))
  );
}

interface AdminSidebarProps {
  onClose?: () => void;
  showCloseButton?: boolean;
}

export default function AdminSidebar({ onClose, showCloseButton }: AdminSidebarProps = {}) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const isLoading = status === 'loading';
  const userRole = (session?.user as { role?: string })?.role || 'VIEWER';

  const roleLabel = userRole === 'OFFICER' ? 'Election Officer Panel' : userRole === 'VIEWER' ? 'Viewer Panel' : 'Admin Control Panel';
  const homeHref = userRole === 'VIEWER' ? '/admin/viewer' : '/admin';

  // Collect every href for active-link disambiguation
  const allHrefs = navigation.flatMap(getGroupHrefs);

  // Determine which groups should start expanded (active child inside)
  function findActiveGroups(): Set<string> {
    const active = new Set<string>();
    for (const entry of navigation) {
      if (entry.type === 'group') {
        for (const child of entry.children) {
          if (isLinkActive(pathname, child.href, allHrefs)) {
            active.add(entry.name);
            break;
          }
        }
      }
    }
    return active;
  }

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(findActiveGroups);

  // Update expanded groups when pathname changes (e.g. navigating from outside)
  useEffect(() => {
    setExpandedGroups((prev) => {
      const active = findActiveGroups();
      // Merge: keep manually-opened groups, add newly-active groups
      const merged = new Set(prev);
      for (const g of active) merged.add(g);
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggleGroup(name: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // Role-based filtering
  function isVisible(roles?: readonly string[]): boolean {
    if (isLoading) return true;
    if (!roles) return true;
    return roles.includes(userRole);
  }

  function filterChildren(children: NavItem[]): NavItem[] {
    return children.filter((c) => isVisible(c.roles));
  }

  return (
    <div className="flex flex-col w-full h-full bg-white">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <Link href={homeHref} onClick={onClose} className="flex items-center gap-3 min-w-0">
          <Image src="/uploads/logo.jpg" alt="Logo" width={36} height={36} className="rounded-lg object-cover w-9 h-9 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-gray-900">Effutu Monitor</h1>
            <p className="text-xs text-gray-500 truncate">{roleLabel}</p>
          </div>
        </Link>
        {showCloseButton && (
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-lg shrink-0"
            aria-label="Close menu"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Election Selector */}
      <ElectionSelector />

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {navigation.map((entry) => {
          if (entry.type === 'link') {
            if (!isVisible(entry.roles)) return null;
            const active = isLinkActive(pathname, entry.href, allHrefs);
            return (
              <Link
                key={entry.name}
                href={entry.href}
                onClick={onClose}
                className={classNames(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary-50 text-primary-600 border-l-3 border-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <entry.icon className={classNames('h-5 w-5', active ? 'text-primary-600' : 'text-gray-400')} />
                {entry.name}
              </Link>
            );
          }

          // Group entry
          const visibleChildren = filterChildren(entry.children);
          if (visibleChildren.length === 0) return null;

          const isExpanded = expandedGroups.has(entry.name);
          const hasActiveChild = visibleChildren.some((c) => isLinkActive(pathname, c.href, allHrefs));

          return (
            <div key={entry.name}>
              <button
                onClick={() => toggleGroup(entry.name)}
                className={classNames(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full',
                  hasActiveChild
                    ? 'text-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <entry.icon className={classNames('h-5 w-5', hasActiveChild ? 'text-primary-600' : 'text-gray-400')} />
                <span className="flex-1 text-left">{entry.name}</span>
                <ChevronDownIcon
                  className={classNames(
                    'h-4 w-4 transition-transform duration-200',
                    hasActiveChild ? 'text-primary-400' : 'text-gray-400',
                    isExpanded ? 'rotate-180' : ''
                  )}
                />
              </button>

              {isExpanded && (
                <div className="mt-1 ml-4 pl-4 border-l border-gray-200 space-y-0.5">
                  {visibleChildren.map((child) => {
                    const active = isLinkActive(pathname, child.href, allHrefs);
                    return (
                      <Link
                        key={child.name}
                        href={child.href}
                        onClick={onClose}
                        className={classNames(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                          active
                            ? 'bg-primary-50 text-primary-600 font-medium'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                        )}
                      >
                        <child.icon className={classNames('h-4 w-4', active ? 'text-primary-600' : 'text-gray-400')} />
                        {child.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User Info + Logout */}
      <div className="p-4 border-t border-gray-100">
        <Link href="/admin/profile" onClick={onClose} className="flex items-center gap-3 px-3 py-2 mb-1 rounded-lg hover:bg-gray-50 transition-colors group">
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
    </div>
  );
}
