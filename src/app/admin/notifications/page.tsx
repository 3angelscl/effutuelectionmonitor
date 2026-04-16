'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/utils';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import {
  BellIcon,
  ChatBubbleLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MegaphoneIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

type FilterType = 'ALL' | 'CHAT' | 'RESULT_SUBMITTED' | 'ALERT' | 'SYSTEM' | 'BROADCAST';

const FILTER_TABS: { key: FilterType; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'ALL',              label: 'All',       icon: BellIcon,                color: 'text-gray-600 bg-gray-100' },
  { key: 'RESULT_SUBMITTED', label: 'Results',   icon: CheckCircleIcon,         color: 'text-green-700 bg-green-100' },
  { key: 'ALERT',            label: 'Alerts',    icon: ExclamationTriangleIcon, color: 'text-red-700 bg-red-100' },
  { key: 'CHAT',             label: 'Chat',      icon: ChatBubbleLeftIcon,      color: 'text-blue-700 bg-blue-100' },
  { key: 'SYSTEM',           label: 'System',    icon: Cog6ToothIcon,           color: 'text-purple-700 bg-purple-100' },
  { key: 'BROADCAST',        label: 'Broadcast', icon: MegaphoneIcon,           color: 'text-amber-700 bg-amber-100' },
];

function getNotifStyle(type: string): { color: string; icon: React.ElementType } {
  return FILTER_TABS.find((t) => t.key === type) ?? FILTER_TABS[0];
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function AdminNotificationsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const apiUrl = activeFilter === 'ALL'
    ? '/api/notifications?limit=200'
    : `/api/notifications?type=${activeFilter}&limit=200`;

  const { data, mutate } = useSWR<{ notifications: Notification[]; unreadCount: number }>(
    apiUrl,
    fetcher,
    { refreshInterval: 20000 }
  );

  // Full list for tab counts
  const { data: allData } = useSWR<{ notifications: Notification[]; unreadCount: number }>(
    '/api/notifications?limit=200',
    fetcher,
    { refreshInterval: 20000 }
  );

  const rawNotifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const allNotifications = allData?.notifications ?? [];

  const notifications = showUnreadOnly
    ? rawNotifications.filter((n) => !n.isRead)
    : rawNotifications;

  const countByType = allNotifications.reduce<Record<string, number>>((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1;
    return acc;
  }, {});

  const markAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markAll: true,
        ...(activeFilter !== 'ALL' ? { type: activeFilter } : {}),
      }),
    });
    mutate();
  };

  const handleClick = async (notif: Notification) => {
    if (!notif.isRead) {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: notif.id }),
      });
      mutate();
    }
    if (notif.link) window.location.href = notif.link;
  };

  const unreadVisible = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex-1">
      <AdminHeader title="Notifications" />

      <div className="p-4 md:p-6 space-y-5">

        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500 mt-0.5">
              {unreadCount > 0 ? (
                <span className="font-semibold text-primary-600">{unreadCount} unread</span>
              ) : (
                'All caught up'
              )}
              {' · '}
              {allNotifications.length} total
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showUnreadOnly}
                onChange={(e) => setShowUnreadOnly(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Unread only
            </label>
            {unreadVisible > 0 && (
              <button
                onClick={markAllRead}
                className="text-sm font-medium text-primary-600 hover:text-primary-700 border border-primary-200 bg-primary-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                Mark {activeFilter === 'ALL' ? 'all' : 'filtered'} as read
              </button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {FILTER_TABS.map(({ key, label, icon: Icon, color }) => {
            const count = key === 'ALL' ? allNotifications.length : (countByType[key] ?? 0);
            const isActive = activeFilter === key;
            return (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors border ${
                  isActive
                    ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isActive ? 'bg-white/20' : color}`}>
                  <Icon className="h-3 w-3" />
                </div>
                {label}
                {count > 0 && (
                  <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                    isActive ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Notification list */}
        <Card padding={false}>
          {notifications.length === 0 ? (
            <div className="py-16 text-center">
              <BellIcon className="h-12 w-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">No notifications</p>
              <p className="text-xs text-gray-400 mt-1">
                {showUnreadOnly ? 'No unread notifications in this filter' : "You're all caught up!"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((notif) => {
                const { color, icon: Icon } = getNotifStyle(notif.type);
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    className={`w-full px-5 py-4 flex items-start gap-4 hover:bg-gray-50 text-left transition-colors group ${
                      !notif.isRead ? 'bg-primary-50/30' : ''
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${color}`}>
                      <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <p className={`text-sm leading-snug ${!notif.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                          {notif.title}
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-400">{getTimeAgo(notif.createdAt)}</span>
                          {!notif.isRead && (
                            <span className="w-2 h-2 bg-primary-600 rounded-full" />
                          )}
                        </div>
                      </div>
                      {notif.message && (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                      )}
                      <span className={`inline-block mt-1.5 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${color}`}>
                        {notif.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
