'use client';

import { useState, useMemo, lazy, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import StatCard from '@/components/ui/StatCard';
import ProgressBar from '@/components/ui/ProgressBar';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  MapPinIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  ClockIcon,
  UserIcon,
  PencilIcon,
  TrashIcon,
  ArrowUpTrayIcon,
  MapIcon,
} from '@heroicons/react/24/outline';

const MapPicker = lazy(() => import('@/components/ui/MapPicker'));

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface StationData {
  id: string;
  psCode: string;
  name: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  agentId: string | null;
  agent: { id: string; name: string; email: string; phone: string | null } | null;
  totalRegistered: number;
  totalVoted: number;
  turnoutPercentage: number;
  results: { candidateId: string; candidateName: string; party: string; votes: number }[];
}

type StatusFilter = 'ALL' | 'REPORTED' | 'ACTIVE' | 'PENDING';

function getStatus(station: StationData): 'REPORTED' | 'ACTIVE' | 'PENDING' {
  if (station.results.length > 0) return 'REPORTED';
  if (station.totalVoted > 0) return 'ACTIVE';
  return 'PENDING';
}

export default function PollingStationsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role;
  const canModify = userRole === 'ADMIN';
  const { data: stations, mutate } = useSWR<StationData[]>('/api/stations', fetcher);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newStation, setNewStation] = useState({ psCode: '', name: '', location: '', latitude: null as number | null, longitude: null as number | null });
  const [saving, setSaving] = useState(false);
  // selectedStation kept for backwards compat but now we navigate to detail page
  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editStation, setEditStation] = useState<StationData | null>(null);
  const [editForm, setEditForm] = useState({ name: '', location: '', latitude: null as number | null, longitude: null as number | null });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; psCode: string } | null>(null);
  // Import modal state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const perPage = 20;

  const allStations = stations || [];

  const statusCounts = useMemo(() => {
    const counts = { ALL: allStations.length, REPORTED: 0, ACTIVE: 0, PENDING: 0 };
    allStations.forEach((s) => {
      const status = getStatus(s);
      counts[status]++;
    });
    return counts;
  }, [allStations]);

  const filtered = useMemo(() => {
    let result = allStations;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.psCode.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.agent?.name.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'ALL') {
      result = result.filter((s) => getStatus(s) === statusFilter);
    }
    return result;
  }, [allStations, search, statusFilter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const totalRegistered = allStations.reduce((sum, s) => sum + s.totalRegistered, 0);
  const totalVoted = allStations.reduce((sum, s) => sum + s.totalVoted, 0);
  const avgTurnout = totalRegistered > 0 ? Math.round((totalVoted / totalRegistered) * 1000) / 10 : 0;

  const handleAddStation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStation),
      });
      if (res.ok) {
        mutate();
        toast.success('Station added successfully');
        setAddModalOpen(false);
        setNewStation({ psCode: '', name: '', location: '', latitude: null, longitude: null });
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to add station');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to add station');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (station: StationData) => {
    setEditStation(station);
    setEditForm({
      name: station.name,
      location: station.location || '',
      latitude: station.latitude,
      longitude: station.longitude,
    });
    setEditModalOpen(true);
  };

  const handleEditStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStation) return;
    setSaving(true);
    try {
      const res = await fetch('/api/stations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editStation.id, ...editForm }),
      });
      if (res.ok) {
        mutate();
        toast.success('Station updated');
        setEditModalOpen(false);
        setEditStation(null);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update station');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to update station');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStation = async (id: string, psCode: string) => {
    setDeleteTarget({ id, psCode });
  };

  const confirmDeleteStation = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/stations?id=${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        mutate();
        toast.success(`Station ${deleteTarget.psCode} deleted`);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete station');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete station');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      toast.error('Please select a file');
      return;
    }
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await fetch('/api/stations/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || 'Import failed');
        return;
      }
      toast.success(`${result.created} stations created, ${result.skipped} skipped`);
      mutate();
      setImportModalOpen(false);
      setImportFile(null);
      if (importFileRef.current) importFileRef.current.value = '';
    } catch {
      toast.error('Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleTemplateDownload = () => {
    const csv = 'psCode,name,location,ward,latitude,longitude\nPS001,Example Station,Location Name,Ward 1,,';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stations_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Reset page when filter changes
  const changeFilter = (f: StatusFilter) => {
    setStatusFilter(f);
    setPage(1);
  };

  const changeSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  // Station detail is now at /admin/stations/[id]

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: 'All Stations' },
    { key: 'REPORTED', label: 'Reported' },
    { key: 'ACTIVE', label: 'In Progress' },
    { key: 'PENDING', label: 'Pending' },
  ];

  return (
    <div className="flex-1">
      <AdminHeader title="Polling Stations" />

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Stations"
            value={String(allStations.length)}
            icon={<BuildingOfficeIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Total Registered"
            value={formatNumber(totalRegistered)}
            icon={<UserIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Total Voted"
            value={formatNumber(totalVoted)}
            icon={<CheckCircleIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Avg. Turnout"
            value={`${avgTurnout}%`}
            icon={<ClockIcon className="h-6 w-6" />}
          />
        </div>

        {/* Actions Row */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by PS Code, Name, or Agent..."
              value={search}
              onChange={(e) => changeSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-lg w-80 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/stations/map"
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:text-primary-600 hover:border-primary-300 rounded-lg transition-colors"
            >
              <MapIcon className="h-4 w-4" />
              Map View
            </Link>
            {canModify && (
              <Button
                variant="secondary"
                icon={<ArrowUpTrayIcon className="h-4 w-4" />}
                onClick={() => setImportModalOpen(true)}
              >
                Import CSV/XLSX
              </Button>
            )}
            {canModify && (
              <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => setAddModalOpen(true)}>
                Add Station
              </Button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => changeFilter(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                statusFilter === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-xs ${statusFilter === tab.key ? 'text-primary-600' : 'text-gray-400'}`}>
                {statusCounts[tab.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Stations Table */}
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">PS Code</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Station Name</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Location</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Agent</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Registered</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Voted</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-32">Turnout</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((station) => {
                  const status = getStatus(station);
                  return (
                    <tr
                      key={station.id}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/admin/stations/${station.id}`)}
                    >
                      <td className="py-3.5 px-6">
                        <span className="font-mono text-xs font-semibold text-primary-600 bg-primary-50 px-2 py-1 rounded">
                          {station.psCode}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-gray-900">{station.name}</td>
                      <td className="py-3.5 px-4 text-gray-500 text-xs">
                        {station.location ? (
                          <span className="flex items-center gap-1">
                            <MapPinIcon className="h-3 w-3 shrink-0" />
                            {station.location}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-gray-700 text-xs">
                        {station.agent ? station.agent.name : (
                          <span className="text-orange-500 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-medium text-gray-900">
                        {formatNumber(station.totalRegistered)}
                      </td>
                      <td className="py-3.5 px-4 text-center font-medium text-gray-900">
                        {formatNumber(station.totalVoted)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={station.turnoutPercentage} height="h-1.5" />
                          <span className="text-xs font-medium text-gray-600 w-10 text-right">
                            {station.turnoutPercentage}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <Badge
                          variant={
                            status === 'REPORTED' ? 'success' :
                            status === 'ACTIVE' ? 'info' : 'warning'
                          }
                          size="sm"
                        >
                          {status === 'REPORTED' ? 'Reported' :
                           status === 'ACTIVE' ? 'Active' : 'Pending'}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {canModify && (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditModal(station); }}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Edit station"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteStation(station.id, station.psCode); }}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete station"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-gray-500">
                      {search || statusFilter !== 'ALL'
                        ? 'No stations found matching your filters'
                        : 'No polling stations added yet'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > perPage && (
            <div className="px-6 py-4 flex items-center justify-between border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Showing {(page - 1) * perPage + 1} to {Math.min(page * perPage, filtered.length)} of {filtered.length} stations
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  &lsaquo;
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (page <= 4) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                        page === pageNum
                          ? 'bg-primary-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                {totalPages > 7 && page < totalPages - 3 && (
                  <>
                    <span className="w-8 h-8 flex items-center justify-center text-gray-400">...</span>
                    <button
                      onClick={() => setPage(totalPages)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-gray-600 hover:bg-gray-100"
                    >
                      {totalPages}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  &rsaquo;
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Add Station Modal */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add Polling Station">
        <form onSubmit={handleAddStation} className="space-y-4">
          <Input
            label="PS Code"
            placeholder="e.g. B100202"
            value={newStation.psCode}
            onChange={(e) => setNewStation({ ...newStation, psCode: e.target.value })}
            required
          />
          <Input
            label="Station Name"
            placeholder="e.g. Alata Station"
            value={newStation.name}
            onChange={(e) => setNewStation({ ...newStation, name: e.target.value })}
            required
          />
          <Input
            label="Location (optional)"
            placeholder="e.g. Winneba, Central Region"
            value={newStation.location}
            onChange={(e) => setNewStation({ ...newStation, location: e.target.value })}
          />
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Map Location (optional)
            </label>
            <Suspense fallback={<div className="h-64 bg-gray-100 rounded-lg animate-pulse" />}>
              <MapPicker
                latitude={newStation.latitude}
                longitude={newStation.longitude}
                onChange={(lat, lng) => setNewStation({ ...newStation, latitude: lat, longitude: lng })}
              />
            </Suspense>
            {newStation.latitude && newStation.longitude && (
              <p className="text-xs text-gray-500 mt-1">
                Coordinates: {newStation.latitude}, {newStation.longitude}
              </p>
            )}
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <Button variant="secondary" type="button" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Add Station
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Station Modal */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title={`Edit Station${editStation ? ` - ${editStation.psCode}` : ''}`}>
        <form onSubmit={handleEditStation} className="space-y-4">
          <Input
            label="Station Name"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            required
          />
          <Input
            label="Location"
            placeholder="e.g. Winneba, Central Region"
            value={editForm.location}
            onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
          />
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Map Location
            </label>
            <Suspense fallback={<div className="h-64 bg-gray-100 rounded-lg animate-pulse" />}>
              <MapPicker
                latitude={editForm.latitude}
                longitude={editForm.longitude}
                onChange={(lat, lng) => setEditForm({ ...editForm, latitude: lat, longitude: lng })}
              />
            </Suspense>
            {editForm.latitude && editForm.longitude && (
              <p className="text-xs text-gray-500 mt-1">
                Coordinates: {editForm.latitude}, {editForm.longitude}
              </p>
            )}
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <Button variant="secondary" type="button" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={importModalOpen} onClose={() => { setImportModalOpen(false); setImportFile(null); }} title="Import Stations from CSV/XLSX">
        <form onSubmit={handleImport} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Select File
            </label>
            <input
              ref={importFileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-600 hover:file:bg-primary-100 cursor-pointer"
            />
            <p className="text-xs text-gray-400 mt-1">Accepted formats: .csv, .xlsx</p>
          </div>

          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-600 mb-1">Required columns</p>
            <p className="text-xs text-gray-500 font-mono">psCode, name</p>
            <p className="text-xs font-semibold text-gray-600 mt-2 mb-1">Optional columns</p>
            <p className="text-xs text-gray-500 font-mono">location, ward, latitude, longitude</p>
          </div>

          <div>
            <button
              type="button"
              onClick={handleTemplateDownload}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium underline"
            >
              Download CSV template
            </button>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => { setImportModalOpen(false); setImportFile(null); }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={importing} icon={<ArrowUpTrayIcon className="h-4 w-4" />}>
              Import
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteStation}
        title="Delete Station"
        message={deleteTarget ? `Are you sure you want to delete station ${deleteTarget.psCode}? This will remove all associated voters, results, incidents, and check-ins.` : ''}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}

// Station detail page is now at /admin/stations/[id]/page.tsx
