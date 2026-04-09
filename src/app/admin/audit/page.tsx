'use client';

import { useMemo, useState } from 'react';
import { fetcher } from '@/lib/utils';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Drawer from '@/components/ui/Drawer';
import Input from '@/components/ui/Input';
import {
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  TrashIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

interface AuditLog {
  id: string;
  userId: string;
  type: string;
  title: string;
  detail: string | null;
  metadata: string | null;
  createdAt: string;
  user: { name: string; email: string; role: string };
}

interface AuditData {
  logs: AuditLog[];
  total: number;
  page: number;
  totalPages: number;
  summary: {
    deleteCount: number;
    submitCount: number;
    alertCount: number;
    latestTimestamp: string | null;
    retentionDays: number;
  };
}

function getTypeBadge(type: string): 'danger' | 'success' | 'info' | 'warning' | 'neutral' {
  switch (type) {
    case 'ADMIN_MUTATION':
      return 'info';
    case 'LOGIN':
      return 'success';
    case 'LOGOUT':
      return 'neutral';
    case 'RESULTS_SUBMITTED':
      return 'success';
    case 'STATION_ARRIVAL':
      return 'info';
    case 'CONNECTIVITY_ALERT':
      return 'danger';
    case 'VOTER_CHECKIN':
      return 'warning';
    default:
      return 'neutral';
  }
}

function getActionFromTitle(title: string): string {
  if (title.startsWith('CREATE')) return 'CREATE';
  if (title.startsWith('UPDATE')) return 'UPDATE';
  if (title.startsWith('DELETE')) return 'DELETE';
  if (title.startsWith('SUBMIT')) return 'SUBMIT';
  if (title.startsWith('ASSIGN')) return 'ASSIGN';
  if (title.startsWith('BULK_ASSIGN')) return 'BULK_ASSIGN';
  if (title.startsWith('LOGIN')) return 'LOGIN';
  if (title.startsWith('LOGOUT')) return 'LOGOUT';
  return title.split(' ')[0] || 'EVENT';
}

function getActionColor(action: string): string {
  switch (action) {
    case 'CREATE':
      return 'text-green-700 bg-green-50';
    case 'UPDATE':
      return 'text-blue-700 bg-blue-50';
    case 'DELETE':
      return 'text-red-700 bg-red-50';
    case 'SUBMIT':
      return 'text-purple-700 bg-purple-50';
    case 'ASSIGN':
    case 'BULK_ASSIGN':
      return 'text-orange-700 bg-orange-50';
    case 'LOGIN':
      return 'text-emerald-700 bg-emerald-50';
    case 'LOGOUT':
      return 'text-slate-700 bg-slate-100';
    default:
      return 'text-gray-700 bg-gray-50';
  }
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatRelativeTime(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function parseMetadata(metadata: string | null): string {
  if (!metadata) return 'No metadata recorded.';
  try {
    return JSON.stringify(JSON.parse(metadata), null, 2);
  } catch {
    return metadata;
  }
}

function parseMetadataObject(metadata: string | null): Record<string, unknown> | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function getEntityFromLog(log: AuditLog): string {
  const parsed = parseMetadataObject(log.metadata);
  const entity = typeof parsed?.entity === 'string' ? parsed.entity : '';
  if (entity) return entity;

  const action = getActionFromTitle(log.title);
  const stripped = log.title.replace(new RegExp(`^${action}\\s+`, 'i'), '').trim();
  return stripped.split(' ')[0] || 'Unknown';
}

const ACTIVITY_TYPES = [
  'ADMIN_MUTATION',
  'LOGIN',
  'LOGOUT',
  'STATION_ARRIVAL',
  'RESULTS_SUBMITTED',
  'VOTER_CHECKIN',
  'CONNECTIVITY_ALERT',
] as const;

const ACTION_TYPES = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'SUBMIT',
  'ASSIGN',
  'BULK_ASSIGN',
  'LOGIN',
  'LOGOUT',
] as const;

const ENTITY_TYPES = [
  'Voter',
  'User',
  'PollingStation',
  'Election',
  'Candidate',
  'ElectoralArea',
  'ElectionResult',
  'TallyPhoto',
  'Broadcast',
  'PasswordReset',
] as const;

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: '30' });
    if (typeFilter) params.set('type', typeFilter);
    if (actionFilter) params.set('action', actionFilter);
    if (entityFilter) params.set('entity', entityFilter);
    if (search.trim()) params.set('search', search.trim());
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    return params.toString();
  }, [actionFilter, dateFrom, dateTo, entityFilter, page, search, typeFilter]);

  const { data, isLoading } = useSWR<AuditData>(
    `/api/audit?${queryParams}`,
    fetcher,
    { refreshInterval: 10000 }
  );

  const logs = data?.logs || [];
  const totalPages = data?.totalPages || 1;
  const activeFilterCount = [typeFilter, actionFilter, entityFilter, search.trim(), dateFrom, dateTo].filter(Boolean).length;

  function handleExportCsv() {
    const exportParams = new URLSearchParams({ export: 'csv' });
    if (typeFilter) exportParams.set('type', typeFilter);
    if (actionFilter) exportParams.set('action', actionFilter);
    if (entityFilter) exportParams.set('entity', entityFilter);
    if (search.trim()) exportParams.set('search', search.trim());
    if (dateFrom) exportParams.set('dateFrom', dateFrom);
    if (dateTo) exportParams.set('dateTo', dateTo);
    window.open(`/api/audit?${exportParams.toString()}`, '_blank', 'noopener,noreferrer');
  }

  function clearFilters() {
    setTypeFilter('');
    setActionFilter('');
    setEntityFilter('');
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  return (
    <div className="flex-1">
      <AdminHeader title="Audit Trail" />

      <div className="space-y-4 p-4 md:space-y-6 md:p-6">
        <Card className="overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-100">
                Audit center
              </div>
              <div>
                <h2 className="text-2xl font-semibold sm:text-3xl">Trace critical actions without digging through raw logs</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
                  Search by actor or keyword, isolate risky actions, and inspect the full payload of every event from one place.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Filtered events</p>
                <p className="mt-2 text-2xl font-semibold text-white">{data?.total?.toLocaleString() || 0}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Active filters</p>
                <p className="mt-2 text-2xl font-semibold text-white">{activeFilterCount}</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border border-gray-200 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Delete actions</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">{data?.summary.deleteCount?.toLocaleString() || 0}</p>
              </div>
              <div className="rounded-2xl bg-red-50 p-3 text-red-600">
                <TrashIcon className="h-5 w-5" />
              </div>
            </div>
          </Card>

          <Card className="border border-gray-200 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Submissions</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">{data?.summary.submitCount?.toLocaleString() || 0}</p>
              </div>
              <div className="rounded-2xl bg-violet-50 p-3 text-violet-600">
                <ShieldCheckIcon className="h-5 w-5" />
              </div>
            </div>
          </Card>

          <Card className="border border-gray-200 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Connectivity alerts</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">{data?.summary.alertCount?.toLocaleString() || 0}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
                <ExclamationTriangleIcon className="h-5 w-5" />
              </div>
            </div>
          </Card>

          <Card className="border border-gray-200 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Retention</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">{data?.summary.retentionDays || 14}d</p>
                <p className="mt-1 text-xs text-gray-500">
                  Last event: {data?.summary.latestTimestamp ? formatRelativeTime(data.summary.latestTimestamp) : 'No events yet'}
                </p>
              </div>
              <div className="rounded-2xl bg-sky-50 p-3 text-sky-600">
                <UserIcon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        </div>

        <Card className="border border-gray-200 bg-white">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Filter audit events</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Search across titles, details, metadata, user names, and email addresses.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" size="sm" onClick={clearFilters} disabled={activeFilterCount === 0}>
                  Clear filters
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<ArrowDownTrayIcon className="h-4 w-4" />}
                  onClick={handleExportCsv}
                >
                  Export CSV
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr]">
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search user, title, details, or metadata"
                icon={<MagnifyingGlassIcon className="h-4 w-4" />}
              />

              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="">All activity types</option>
                {ACTIVITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>

              <select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="">All actions</option>
                {ACTION_TYPES.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>

              <select
                value={entityFilter}
                onChange={(e) => {
                  setEntityFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="">All entities</option>
                {ENTITY_TYPES.map((entity) => (
                  <option key={entity} value={entity}>
                    {entity}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />

              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            {(search || typeFilter || actionFilter || dateFrom || dateTo) && (
              <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                <span className="text-xs font-medium text-gray-500">Active filters:</span>
                {search && <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">Search: {search}</span>}
                {typeFilter && <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">Type: {typeFilter.replace(/_/g, ' ')}</span>}
                {actionFilter && <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">Action: {actionFilter}</span>}
                {entityFilter && <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">Entity: {entityFilter}</span>}
                {dateFrom && <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">From: {dateFrom}</span>}
                {dateTo && <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">To: {dateTo}</span>}
              </div>
            )}
          </div>
        </Card>

        <Card padding={false} className="overflow-hidden border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Entity</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Event</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const action = getActionFromTitle(log.title);
                  const detailText = log.detail || log.title;
                  const entity = getEntityFromLog(log);
                  return (
                    <tr
                      key={log.id}
                      className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50"
                      onClick={() => setSelectedLog(log)}
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-xs text-gray-500">
                        <p className="font-medium text-gray-800">{formatRelativeTime(log.createdAt)}</p>
                        <p>{formatTimestamp(log.createdAt)}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-xs font-medium text-gray-900">{log.user.name}</p>
                          <p className="text-[10px] text-gray-400">{log.user.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={getTypeBadge(log.type)}>{log.type.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${getActionColor(action)}`}>
                          {action}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          <PencilSquareIcon className="h-3.5 w-3.5" />
                          {entity}
                        </span>
                      </td>
                      <td className="max-w-xl px-6 py-4 text-xs">
                        <p className="font-medium text-gray-900">{log.title}</p>
                        <p className="mt-1 truncate text-gray-500">{detailText}</p>
                      </td>
                    </tr>
                  );
                })}
                {!isLoading && logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-14 text-center text-gray-500">
                      No audit logs match the current filters.
                    </td>
                  </tr>
                )}
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="py-14 text-center text-gray-500">
                      Loading audit events...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Drawer
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Audit Event Details"
        size="xl"
      >
        {selectedLog && (
          <div className="space-y-6 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={getTypeBadge(selectedLog.type)}>{selectedLog.type.replace(/_/g, ' ')}</Badge>
              <span className={`inline-block rounded px-2.5 py-1 text-xs font-medium ${getActionColor(getActionFromTitle(selectedLog.title))}`}>
                {getActionFromTitle(selectedLog.title)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                <PencilSquareIcon className="h-3.5 w-3.5" />
                {getEntityFromLog(selectedLog)}
              </span>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Title</p>
              <p className="mt-2 text-xl font-semibold text-gray-900">{selectedLog.title}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Actor</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">{selectedLog.user.name}</p>
                <p className="text-sm text-gray-500">{selectedLog.user.email}</p>
                <p className="mt-1 text-xs text-gray-400">Role: {selectedLog.user.role}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Timestamp</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">{formatTimestamp(selectedLog.createdAt)}</p>
                <p className="text-xs text-gray-400">{formatRelativeTime(selectedLog.createdAt)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Detail</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{selectedLog.detail || 'No detail recorded.'}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-slate-950 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Metadata</p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs text-slate-100">
                {parseMetadata(selectedLog.metadata)}
              </pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
