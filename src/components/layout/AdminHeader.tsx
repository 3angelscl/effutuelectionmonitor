'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { MagnifyingGlassIcon, BellIcon, Cog6ToothIcon, UserCircleIcon, ArrowRightStartOnRectangleIcon, Bars3Icon } from '@heroicons/react/24/outline';
import { useAdminSidebar } from '@/contexts/AdminSidebarContext';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

interface VoterResult {
  id: string;
  voterId: string;
  firstName: string;
  lastName: string;
  psCode: string;
}

interface AdminHeaderProps {
  title?: string;
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getNotifIcon(type: string) {
  switch (type) {
    case 'CHAT': return 'bg-blue-100 text-blue-600';
    case 'RESULT_SUBMITTED': return 'bg-green-100 text-green-600';
    case 'ALERT': return 'bg-red-100 text-red-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}

export default function AdminHeader({ title }: AdminHeaderProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const { open: openSidebar } = useAdminSidebar();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: notifData, mutate: mutateNotifs } = useSWR<{ notifications: Notification[]; unreadCount: number }>(
    '/api/notifications',
    fetcher,
    { refreshInterval: 15000 }
  );

  const { data: searchResults } = useSWR<{ voters: VoterResult[] }>(
    debouncedSearch.length >= 2 ? `/api/voters?search=${encodeURIComponent(debouncedSearch)}&limit=5` : null,
    fetcher
  );

  const unreadCount = notifData?.unreadCount || 0;
  const notifications = notifData?.notifications || [];
  // Only show unread notifications in the dropdown
  const unreadNotifications = notifications.filter((n) => !n.isRead);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, []);

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      });
      mutateNotifs();
    } catch {
      // Best effort — notifications will sync on next poll
    }
  };

  const handleNotifClick = async (notif: Notification) => {
    if (!notif.isRead) {
      try {
        await fetch('/api/notifications', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationId: notif.id }),
        });
        mutateNotifs();
      } catch {
        // Best effort
      }
    }
    if (notif.link) {
      window.location.href = notif.link;
    }
    setNotifOpen(false);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setSearchOpen(val.length >= 2);
    }, 300);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      router.push(`/admin/voters?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
      setDebouncedSearch('');
    }
    if (e.key === 'Escape') setSearchOpen(false);
  };

  const handleSearchResultClick = (voter: VoterResult) => {
    router.push(`/admin/voters?search=${encodeURIComponent(voter.voterId)}`);
    setSearchOpen(false);
    setSearchQuery('');
    setDebouncedSearch('');
  };

  const userName = (session?.user as { name?: string })?.name || 'User';
  const userEmail = session?.user?.email || '';
  const userRole = (session?.user as { role?: string })?.role || 'VIEWER';
  const userPhoto = (session?.user as { photo?: string | null })?.photo;
  const isViewer = userRole === 'VIEWER';

  return (
    <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 md:py-4">
      <div className="flex items-center justify-between gap-3">
        {/* Mobile: hamburger; Desktop: page title */}
        <div className="flex items-center gap-3">
          <button
            onClick={openSidebar}
            className="md:hidden p-1.5 -ml-1 text-gray-500 hover:text-gray-700 rounded-lg"
            aria-label="Open menu"
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
          {title && <h1 className="text-base md:text-lg font-semibold text-gray-900">{title}</h1>}
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          {/* Search — hidden for viewers and hidden on mobile */}
          {!isViewer && (
            <div className="relative hidden md:block" ref={searchRef}>
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search station or voter..."
                aria-label="Search station or voter"
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => { if (searchQuery.length >= 2) setSearchOpen(true); }}
                className="pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
              {searchOpen && (
                <div className="absolute left-0 top-full mt-1 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
                  {searchResults?.voters && searchResults.voters.length > 0 ? (
                    <>
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Voters</p>
                      </div>
                      {searchResults.voters.map((voter) => (
                        <button
                          key={voter.id}
                          onClick={() => handleSearchResultClick(voter)}
                          className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50"
                        >
                          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-xs font-bold text-primary-600 shrink-0">
                            {voter.firstName[0]}{voter.lastName[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{voter.firstName} {voter.lastName}</p>
                            <p className="text-xs text-gray-500">{voter.voterId} · {voter.psCode}</p>
                          </div>
                        </button>
                      ))}
                      <button
                        onClick={() => { router.push(`/admin/voters?search=${encodeURIComponent(searchQuery)}`); setSearchOpen(false); setSearchQuery(''); setDebouncedSearch(''); }}
                        className="w-full px-4 py-2.5 text-sm text-primary-600 hover:bg-primary-50 text-center font-medium"
                      >
                        See all results for &ldquo;{searchQuery}&rdquo;
                      </button>
                    </>
                  ) : debouncedSearch.length >= 2 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-500">
                      No voters found for &ldquo;{debouncedSearch}&rdquo;
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Notifications — hidden for viewers */}
          {!isViewer && (
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
                className="p-2 text-gray-400 hover:text-gray-600 relative"
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
              >
                <BellIcon className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center min-w-[18px] h-[18px]">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-900">Notifications</h4>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {unreadNotifications.length === 0 ? (
                      <div className="p-6 text-center">
                        <BellIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500 font-medium">You&apos;re all caught up!</p>
                        <p className="text-xs text-gray-400 mt-1">No new notifications</p>
                      </div>
                    ) : (
                      unreadNotifications.map((notif) => (
                        <button
                          key={notif.id}
                          onClick={() => handleNotifClick(notif)}
                          className="w-full p-3 flex items-start gap-3 hover:bg-gray-50 text-left border-b border-gray-50 bg-primary-50/30"
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${getNotifIcon(notif.type)}`}>
                            <BellIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{notif.title}</p>
                            {notif.message && (
                              <p className="text-xs text-gray-500 truncate mt-0.5">{notif.message}</p>
                            )}
                            <p className="text-[10px] text-gray-400 mt-1">{getTimeAgo(notif.createdAt)}</p>
                          </div>
                          <div className="w-2 h-2 bg-primary-600 rounded-full shrink-0 mt-1.5" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User Avatar with Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${!userPhoto ? 'bg-navy-700 hover:bg-navy-800' : 'overflow-hidden border-2 border-transparent hover:border-gray-200'}`}
            >
              {userPhoto ? (
                <img src={userPhoto} alt={userName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-sm font-medium">
                  {userName[0]?.toUpperCase() || 'A'}
                </span>
              )}
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                  {userPhoto ? (
                    <img src={userPhoto} alt={userName} className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 bg-navy-700 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-white font-medium">{userName[0]?.toUpperCase() || 'A'}</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
                    <p className="text-xs text-gray-500 truncate">{userEmail}</p>
                  </div>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => { window.location.href = '/admin/settings'; setProfileOpen(false); }}
                    className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 text-left"
                  >
                    <UserCircleIcon className="h-4 w-4 text-gray-400" />
                    Edit Profile
                  </button>
                  <button
                    onClick={() => { window.location.href = '/admin/settings'; setProfileOpen(false); }}
                    className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 text-left"
                  >
                    <Cog6ToothIcon className="h-4 w-4 text-gray-400" />
                    Settings
                  </button>
                  <hr className="my-1 border-gray-100" />
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 text-left"
                  >
                    <ArrowRightStartOnRectangleIcon className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
