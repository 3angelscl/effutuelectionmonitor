'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/utils';
import Card from '@/components/ui/Card';
import { BellIcon, ChatBubbleLeftIcon, ExclamationTriangleIcon, CheckCircleIcon, MegaphoneIcon } from '@heroicons/react/24/outline';

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

const FILTER_TABS: { key: FilterType; label: string; icon: React.ElementType }[] = [
  { key: 'ALL',              label: 'All',     icon: BellIcon },
  { key: 'CHAT',             label: 'Chat',    icon: ChatBubbleLeftIcon },
  { key: 'RESULT_SUBMITTED', label: 'Results', icon: CheckCircleIcon },
  { key: 'ALERT',            label: 'Alerts',  icon: ExclamationTriangleIcon },
  { key: 'SYSTEM',           label: 'System',  icon: BellIcon },
  { key: 'BROADCAST',        label: 'Broadcast', icon: MegaphoneIcon },
];

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getNotifStyle(type: string): { bg: string; icon: React.ElementType } {
  switch (type) {
    case 'CHAT':             return { bg: 'bg-blue-100 text-blue-600',    icon: ChatBubbleLeftIcon };
    case 'RESULT_SUBMITTED': return { bg: 'bg-green-100 text-green-600',  icon: CheckCircleIcon };
    case 'ALERT':            return { bg: 'bg-red-100 text-red-600',      icon: ExclamationTriangleIcon };
    case 'BROADCAST':        return { bg: 'bg-amber-100 text-amber-600',  icon: MegaphoneIcon };
    default:                 return { bg: 'bg-gray-100 text-gray-600',    icon: BellIcon };
  }
}

export default function AgentNotificationsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');

  const apiUrl = activeFilter === 'ALL'
    ? '/api/notifications?limit=100'
    : `/api/notifications?type=${activeFilter}&limit=100`;

  const { data, mutate } = useSWR<{ notifications: Notification[]; unreadCount: number }>(
    apiUrl,
    fetcher,
    { refreshInterval: 15000 }
  );

  // For tab counts, always fetch the full unfiltered set
  const { data: allData } = useSWR<{ notifications: Notification[]; unreadCount: number }>(
    '/api/notifications?limit=200',
    fetcher,
    { refreshInterval: 15000 }
  );

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const allNotifications = allData?.notifications ?? [];

  // Count per type for badge display
  const countByType = allNotifications.reduce<Record<string, number>>((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1;
    return acc;
  }, {});
  const totalCount = allNotifications.length;

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

  const unreadInView = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        {unreadInView > 0 && (
          <button
            onClick={markAllRead}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Mark {activeFilter === 'ALL' ? 'all' : 'filtered'} as read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {FILTER_TABS.map(({ key, label }) => {
          const count = key === 'ALL' ? totalCount : (countByType[key] ?? 0);
          const isActive = activeFilter === key;
          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors border ${
                isActive
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
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

      <Card padding={false}>
        {notifications.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <BellIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No notifications</p>
            <p className="text-sm mt-1">
              {activeFilter === 'ALL' ? "You're all caught up!" : `No ${activeFilter.toLowerCase()} notifications`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notif) => {
              const { bg, icon: Icon } = getNotifStyle(notif.type);
              return (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`w-full p-4 flex items-start gap-4 hover:bg-gray-50 text-left transition-colors ${
                    !notif.isRead ? 'bg-primary-50/40' : ''
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${!notif.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {notif.title}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-400">{getTimeAgo(notif.createdAt)}</span>
                        {!notif.isRead && <div className="w-2 h-2 bg-primary-600 rounded-full" />}
                      </div>
                    </div>
                    {notif.message && (
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                    )}
                    <span className={`inline-block mt-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${bg}`}>
                      {notif.type.replace('_', ' ')}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
