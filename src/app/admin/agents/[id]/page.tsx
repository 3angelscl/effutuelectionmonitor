'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import StatCard from '@/components/ui/StatCard';
import {
  UserGroupIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowUpTrayIcon,
  ArrowRightEndOnRectangleIcon,
  ArrowLeftStartOnRectangleIcon,
  MapPinIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ActivityLog {
  id: string;
  type: string;
  title: string;
  detail: string | null;
  metadata: string | null;
  createdAt: string;
}

interface AgentDetail {
  agent: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    photo: string | null;
    createdAt: string;
    assignedStations: { id: string; psCode: string; name: string }[];
  };
  stats: {
    votersCheckedIn: number;
    lastActivity: string | null;
    lastActivityTitle: string | null;
    isOnline: boolean;
  };
  logs: ActivityLog[];
  totalLogs: number;
  page: number;
  totalPages: number;
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} mins ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} hrs ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays} days ago`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `Today at ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

function getLogIcon(type: string) {
  switch (type) {
    case 'VOTER_CHECKIN':
      return { icon: CheckCircleIcon, bg: 'bg-primary-600', color: 'text-white' };
    case 'CONNECTIVITY_ALERT':
      return { icon: ExclamationTriangleIcon, bg: 'bg-red-500', color: 'text-white' };
    case 'RESULTS_SUBMITTED':
      return { icon: ArrowUpTrayIcon, bg: 'bg-green-600', color: 'text-white' };
    case 'LOGIN':
      return { icon: ArrowRightEndOnRectangleIcon, bg: 'bg-gray-500', color: 'text-white' };
    case 'LOGOUT':
      return { icon: ArrowLeftStartOnRectangleIcon, bg: 'bg-gray-400', color: 'text-white' };
    case 'STATION_ARRIVAL':
      return { icon: MapPinIcon, bg: 'bg-blue-500', color: 'text-white' };
    default:
      return { icon: SignalIcon, bg: 'bg-gray-500', color: 'text-white' };
  }
}

function getLogStyle(type: string): 'normal' | 'alert' | 'success' {
  if (type === 'CONNECTIVITY_ALERT') return 'alert';
  if (type === 'RESULTS_SUBMITTED') return 'success';
  return 'normal';
}

function getInitials(name: string) {
  const parts = name.split(' ');
  return parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2);
}

function getAvatarColor(name: string) {
  const colors = ['bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-orange-500', 'bg-teal-600', 'bg-rose-600'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function AgentActivityPage() {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSWR<AgentDetail>(
    `/api/agents/${id}?page=${page}&limit=20`,
    fetcher,
    { refreshInterval: 10000 }
  );

  if (isLoading || !data) {
    return (
      <div className="flex-1">
        <AdminHeader title="Agent Activity" />
        <div className="p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-24 bg-gray-200 rounded-xl" />
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-gray-200 rounded-xl" />)}
            </div>
            <div className="h-96 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!data.agent) {
    return (
      <div className="flex-1">
        <AdminHeader title="Agent Activity" />
        <div className="p-6">
          <Card className="text-center py-12">
            <p className="text-gray-500">Agent not found</p>
          </Card>
        </div>
      </div>
    );
  }

  const { agent, stats, logs, totalPages } = data;
  const station = agent.assignedStations[0];
  const isOnline = stats.isOnline;

  return (
    <div className="flex-1">
      <AdminHeader title="Agent Activity" />

      <div className="p-6 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm">
          <a href="/admin" className="text-gray-500 hover:text-primary-600">Dashboard</a>
          <span className="text-gray-300">/</span>
          <a href="/admin/agents" className="text-gray-500 hover:text-primary-600">Agent Management</a>
          <span className="text-gray-300">/</span>
          <span className="text-primary-600 font-medium">{agent.name}</span>
        </nav>

        {/* Agent Header */}
        <Card>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="relative">
                {agent.photo ? (
                  <img
                    src={agent.photo}
                    alt={agent.name}
                    className="w-20 h-20 rounded-full object-cover border-4 border-gray-100"
                  />
                ) : (
                  <div className={`w-20 h-20 ${getAvatarColor(agent.name)} rounded-full flex items-center justify-center text-white text-2xl font-bold border-4 border-gray-100`}>
                    {getInitials(agent.name)}
                  </div>
                )}
                <div className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
              </div>

              {/* Info */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{agent.name}</h2>
                <p className="text-sm text-gray-500">ID: AG-{new Date(agent.createdAt).getFullYear()}-{agent.id.slice(0, 3).toUpperCase()}</p>
                <div className="flex items-center gap-3 mt-1">
                  {station ? (
                    <span className="text-sm text-gray-600 flex items-center gap-1">
                      <MapPinIcon className="h-3.5 w-3.5" />
                      {station.name} - {station.psCode}
                    </span>
                  ) : (
                    <span className="text-sm text-orange-500 italic">Unassigned</span>
                  )}
                  <span className="text-gray-300">|</span>
                  <Badge variant={isOnline ? 'success' : 'neutral'} dot>
                    {isOnline ? 'Online' : 'Offline'}
                  </Badge>
                </div>
              </div>
            </div>

          </div>
        </Card>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Voters Checked In"
            value={String(stats.votersCheckedIn)}
            icon={<UserGroupIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Last Activity"
            value={stats.lastActivity ? getTimeAgo(stats.lastActivity) : 'No activity'}
            subtitle={stats.lastActivity ? formatDate(stats.lastActivity) : undefined}
            icon={<ClockIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Status"
            value={isOnline ? 'Online' : 'Offline'}
            valueClassName={isOnline ? 'text-blue-600' : 'text-gray-400'}
            icon={<DevicePhoneMobileIcon className="h-6 w-6" />}
          />
        </div>

        {/* Agent Info */}
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Phone Number</p>
              <p className="text-sm font-medium text-gray-900">{agent.phone || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Email</p>
              <p className="text-sm font-medium text-gray-900">{agent.email}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Registered Since</p>
              <p className="text-sm font-medium text-gray-900">
                {new Date(agent.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        </Card>

        {/* Activity Timeline */}
        <Card>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
            <div className="flex items-center gap-3">
              {totalPages > 1 && (
                <span className="text-sm text-gray-500">
                  Page {page} of {totalPages}
                </span>
              )}
              <Button
                variant="outline"
                icon={<ArrowDownTrayIcon className="h-4 w-4" />}
                onClick={() => {
                  if (!data?.logs) return;
                  const csv = ['Date,Type,Title,Detail']
                    .concat(data.logs.map((l: any) =>
                      `"${new Date(l.createdAt).toLocaleString()}","${l.type}","${l.title}","${l.detail || ''}"`
                    ))
                    .join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `agent-logs-${id}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export Logs
              </Button>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">No activity recorded yet</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline center line */}
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-200 -translate-x-1/2" />

              <div className="space-y-8">
                {logs.map((log, idx) => {
                  const { icon: IconComponent, bg } = getLogIcon(log.type);
                  const style = getLogStyle(log.type);
                  const isLeft = idx % 2 === 1;

                  return (
                    <div key={log.id} className="relative flex items-start">
                      {/* Left side content */}
                      <div className="w-[calc(50%-24px)] pr-4">
                        {isLeft && (
                          <div
                            className={`p-4 rounded-xl text-sm ${
                              style === 'alert'
                                ? 'bg-red-50 border border-red-100'
                                : style === 'success'
                                ? 'bg-green-50 border border-green-100'
                                : 'bg-gray-50 border border-gray-100'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className={`font-semibold ${
                                style === 'alert' ? 'text-red-600' : style === 'success' ? 'text-green-700' : 'text-gray-900'
                              }`}>
                                {log.title}
                              </p>
                              <span className={`text-xs shrink-0 ${
                                style === 'alert' ? 'text-red-400' : style === 'success' ? 'text-green-500' : 'text-gray-400'
                              }`}>
                                {formatTime(log.createdAt)}
                              </span>
                            </div>
                            {log.detail && (
                              <p className={`mt-1 text-xs ${
                                style === 'alert' ? 'text-red-500' : style === 'success' ? 'text-green-600' : 'text-gray-500'
                              }`}>
                                {log.detail}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Center icon */}
                      <div className="relative z-10 flex-shrink-0">
                        <div className={`w-10 h-10 ${bg} rounded-full flex items-center justify-center shadow-md`}>
                          <IconComponent className="h-5 w-5 text-white" />
                        </div>
                      </div>

                      {/* Right side content */}
                      <div className="w-[calc(50%-24px)] pl-4">
                        {!isLeft && (
                          <div
                            className={`p-4 rounded-xl text-sm ${
                              style === 'alert'
                                ? 'bg-red-50 border border-red-100'
                                : style === 'success'
                                ? 'bg-green-50 border border-green-100'
                                : 'bg-gray-50 border border-gray-100'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className={`font-semibold ${
                                style === 'alert' ? 'text-red-600' : style === 'success' ? 'text-green-700' : 'text-gray-900'
                              }`}>
                                {log.title}
                              </p>
                              <span className={`text-xs shrink-0 ${
                                style === 'alert' ? 'text-red-400' : style === 'success' ? 'text-green-500' : 'text-gray-400'
                              }`}>
                                {formatTime(log.createdAt)}
                              </span>
                            </div>
                            {log.detail && (
                              <p className={`mt-1 text-xs ${
                                style === 'alert' ? 'text-red-500' : style === 'success' ? 'text-green-600' : 'text-gray-500'
                              }`}>
                                {log.detail}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8 pt-4 border-t border-gray-100">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
