'use client';

import useSWR from 'swr';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { BellIcon } from '@heroicons/react/24/outline';

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

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getNotifColor(type: string) {
  switch (type) {
    case 'CHAT': return 'bg-blue-100 text-blue-600';
    case 'RESULT_SUBMITTED': return 'bg-green-100 text-green-600';
    case 'ALERT': return 'bg-red-100 text-red-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}

export default function AgentNotificationsPage() {
  const { data, mutate } = useSWR<{ notifications: Notification[]; unreadCount: number }>(
    '/api/notifications',
    fetcher,
    { refreshInterval: 10000 }
  );

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  const markAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true }),
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

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Notifications</h1>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            Mark all as read
          </button>
        )}
      </div>

      <Card padding={false}>
        {notifications.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <BellIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`w-full p-4 flex items-start gap-4 hover:bg-gray-50 text-left transition-colors ${
                  !notif.isRead ? 'bg-primary-50/30' : ''
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${getNotifColor(notif.type)}`}>
                  <BellIcon className="h-5 w-5" />
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
                    <p className="text-sm text-gray-500 mt-0.5">{notif.message}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
