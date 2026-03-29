'use client';

import { useState } from 'react';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import StatCard from '@/components/ui/StatCard';
import {
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  CheckCircleIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Incident {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  photoUrl: string | null;
  createdAt: string;
  resolvedAt: string | null;
  user: { id: string; name: string; email: string };
  station: { id: string; name: string; psCode: string };
}

interface IncidentResponse {
  incidents: Incident[];
  total: number;
  page: number;
  totalPages: number;
}

function getSeverityVariant(severity: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (severity) {
    case 'LOW': return 'success';
    case 'MEDIUM': return 'warning';
    case 'HIGH': return 'danger';
    case 'CRITICAL': return 'danger';
    default: return 'neutral';
  }
}

function getStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'OPEN': return 'danger';
    case 'INVESTIGATING': return 'warning';
    case 'RESOLVED': return 'success';
    case 'DISMISSED': return 'neutral';
    default: return 'neutral';
  }
}

export default function AdminIncidentsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [updating, setUpdating] = useState(false);

  const queryParams = new URLSearchParams({ page: String(page), limit: '30' });
  if (statusFilter) queryParams.set('status', statusFilter);

  const { data, mutate } = useSWR<IncidentResponse>(
    `/api/incidents?${queryParams.toString()}`,
    fetcher,
    { refreshInterval: 15000 }
  );

  // Fetch all incidents for summary counts (without pagination)
  const { data: allData } = useSWR<IncidentResponse>(
    '/api/incidents?limit=10000',
    fetcher,
    { refreshInterval: 15000 }
  );

  const incidents = data?.incidents || [];
  const totalPages = data?.totalPages || 1;

  const allIncidents = allData?.incidents || [];
  const totalCount = allData?.total || 0;
  const openCount = allIncidents.filter((i) => i.status === 'OPEN').length;
  const criticalCount = allIncidents.filter((i) => i.severity === 'CRITICAL').length;
  const resolvedCount = allIncidents.filter((i) => i.status === 'RESOLVED').length;

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        mutate();
        setSelectedIncident(null);
      }
    } catch (error) {
      console.error('Failed to update incident:', error);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="flex-1">
      <AdminHeader title="Incident Reports" />

      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Incidents"
            value={totalCount}
            icon={<ExclamationTriangleIcon className="h-8 w-8" />}
          />
          <StatCard
            label="Open"
            value={openCount}
            icon={<FolderOpenIcon className="h-8 w-8" />}
          />
          <StatCard
            label="Critical"
            value={criticalCount}
            icon={<ShieldExclamationIcon className="h-8 w-8" />}
          />
          <StatCard
            label="Resolved"
            value={resolvedCount}
            icon={<CheckCircleIcon className="h-8 w-8" />}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="INVESTIGATING">Investigating</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
          <span className="text-sm text-gray-500">
            {data?.total || 0} incidents
          </span>
        </div>

        {/* Incidents Table */}
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Timestamp</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Station</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Severity</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Title</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-6 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(incident.createdAt).toLocaleString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-900 text-xs">{incident.station.name}</p>
                        <p className="text-[10px] text-gray-400">{incident.station.psCode}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600">
                      {incident.type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={getSeverityVariant(incident.severity)}>
                        {incident.severity}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-700 max-w-xs truncate">
                      {incident.title}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={getStatusVariant(incident.status)} dot>
                        {incident.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => setSelectedIncident(incident)}
                        className="text-primary-600 hover:text-primary-700 text-xs font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {incidents.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500">
                      No incidents found.
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

      {/* Incident Detail Modal */}
      <Modal
        isOpen={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
        title="Incident Details"
        size="lg"
      >
        {selectedIncident && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">Type</p>
                <p className="text-sm text-gray-900">{selectedIncident.type.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">Severity</p>
                <Badge variant={getSeverityVariant(selectedIncident.severity)}>
                  {selectedIncident.severity}
                </Badge>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">Station</p>
                <p className="text-sm text-gray-900">{selectedIncident.station.name} ({selectedIncident.station.psCode})</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">Reported By</p>
                <p className="text-sm text-gray-900">{selectedIncident.user.name}</p>
                <p className="text-xs text-gray-400">{selectedIncident.user.email}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">Reported At</p>
                <p className="text-sm text-gray-900">
                  {new Date(selectedIncident.createdAt).toLocaleString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                  })}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">Status</p>
                <Badge variant={getStatusVariant(selectedIncident.status)} dot>
                  {selectedIncident.status}
                </Badge>
              </div>
            </div>

            {selectedIncident.latitude && selectedIncident.longitude && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">GPS Location</p>
                <p className="text-sm text-gray-600">
                  {selectedIncident.latitude.toFixed(6)}, {selectedIncident.longitude.toFixed(6)}
                </p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Title</p>
              <p className="text-sm font-medium text-gray-900">{selectedIncident.title}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Description</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedIncident.description}</p>
            </div>

            {selectedIncident.resolvedAt && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">Resolved At</p>
                <p className="text-sm text-gray-600">
                  {new Date(selectedIncident.resolvedAt).toLocaleString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            )}

            {/* Status Update Buttons */}
            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs font-medium text-gray-500 uppercase mb-3">Update Status</p>
              <div className="flex flex-wrap gap-2">
                {selectedIncident.status !== 'OPEN' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusUpdate(selectedIncident.id, 'OPEN')}
                    loading={updating}
                  >
                    Reopen
                  </Button>
                )}
                {selectedIncident.status !== 'INVESTIGATING' && (
                  <Button
                    size="sm"
                    className="bg-yellow-500 hover:bg-yellow-600"
                    onClick={() => handleStatusUpdate(selectedIncident.id, 'INVESTIGATING')}
                    loading={updating}
                  >
                    Investigating
                  </Button>
                )}
                {selectedIncident.status !== 'RESOLVED' && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleStatusUpdate(selectedIncident.id, 'RESOLVED')}
                    loading={updating}
                  >
                    Resolve
                  </Button>
                )}
                {selectedIncident.status !== 'DISMISSED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusUpdate(selectedIncident.id, 'DISMISSED')}
                    loading={updating}
                  >
                    Dismiss
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
