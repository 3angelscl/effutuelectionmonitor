'use client';

import { useState } from 'react';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
}

function getTypeBadge(type: string): 'danger' | 'success' | 'info' | 'warning' | 'neutral' {
  switch (type) {
    case 'ADMIN_MUTATION': return 'info';
    case 'LOGIN': return 'success';
    case 'LOGOUT': return 'neutral';
    case 'RESULTS_SUBMITTED': return 'success';
    case 'STATION_ARRIVAL': return 'info';
    case 'CONNECTIVITY_ALERT': return 'danger';
    default: return 'neutral';
  }
}

function getActionFromTitle(title: string): string {
  if (title.startsWith('CREATE')) return 'CREATE';
  if (title.startsWith('UPDATE')) return 'UPDATE';
  if (title.startsWith('DELETE')) return 'DELETE';
  if (title.startsWith('SUBMIT')) return 'SUBMIT';
  if (title.startsWith('ASSIGN')) return 'ASSIGN';
  if (title.startsWith('BULK_ASSIGN')) return 'BULK_ASSIGN';
  return title.split(' ')[0];
}

function getActionColor(action: string): string {
  switch (action) {
    case 'CREATE': return 'text-green-700 bg-green-50';
    case 'UPDATE': return 'text-blue-700 bg-blue-50';
    case 'DELETE': return 'text-red-700 bg-red-50';
    case 'SUBMIT': return 'text-purple-700 bg-purple-50';
    case 'ASSIGN':
    case 'BULK_ASSIGN': return 'text-orange-700 bg-orange-50';
    default: return 'text-gray-700 bg-gray-50';
  }
}

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');

  const queryParams = new URLSearchParams({ page: String(page), limit: '30' });
  if (typeFilter) queryParams.set('type', typeFilter);

  const { data } = useSWR<AuditData>(
    `/api/audit?${queryParams.toString()}`,
    fetcher,
    { refreshInterval: 10000 }
  );

  const logs = data?.logs || [];
  const totalPages = data?.totalPages || 1;

  function handleExportCsv() {
    const exportParams = new URLSearchParams({ export: 'csv' });
    if (typeFilter) exportParams.set('type', typeFilter);
    window.open(`/api/audit?${exportParams.toString()}`, '_blank');
  }

  return (
    <div className="flex-1">
      <AdminHeader title="Audit Trail" />

      <div className="p-6 space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          >
            <option value="">All Activity Types</option>
            <option value="ADMIN_MUTATION">Admin Mutations</option>
            <option value="LOGIN">Logins</option>
            <option value="LOGOUT">Logouts</option>
            <option value="STATION_ARRIVAL">Station Arrivals</option>
            <option value="RESULTS_SUBMITTED">Results Submitted</option>
            <option value="VOTER_CHECKIN">Voter Check-ins</option>
            <option value="CONNECTIVITY_ALERT">Connectivity Alerts</option>
          </select>
          <span className="text-sm text-gray-500">
            {data?.total || 0} total entries
          </span>
          <div className="ml-auto">
            <button
              onClick={handleExportCsv}
              title="Export to CSV"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Export to CSV
            </button>
          </div>
        </div>

        {/* Log Table */}
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Timestamp</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">User</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Action</th>
                  <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const action = getActionFromTitle(log.title);
                  return (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-6 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-gray-900 text-xs">{log.user.name}</p>
                          <p className="text-[10px] text-gray-400">{log.user.email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={getTypeBadge(log.type)}>
                          {log.type.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getActionColor(action)}`}>
                          {action}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-gray-600 text-xs max-w-md truncate">
                        {log.detail || log.title}
                      </td>
                    </tr>
                  );
                })}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-500">
                      No audit logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 flex items-center justify-between border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
