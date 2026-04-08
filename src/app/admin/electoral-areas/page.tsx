'use client';

import { forwardRef, useMemo, useRef, useState, type ComponentProps } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import ConfirmModal from '@/components/ui/ConfirmModal';
import Badge from '@/components/ui/Badge';
import { fetcher } from '@/lib/utils';
import { parseBoundaryGeoJson, serializeBoundary, type LatLngPoint } from '@/lib/electoral-area-boundary';
import { PlusIcon, PencilIcon, TrashIcon, MapPinIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';

const ElectoralAreaBoundaryEditorBase = dynamic(
  () => import('@/components/ui/ElectoralAreaBoundaryEditor'),
  { ssr: false },
);
type ElectoralAreaBoundaryEditorHandle = import('@/components/ui/ElectoralAreaBoundaryEditor').ElectoralAreaBoundaryEditorHandle;
const ElectoralAreaBoundaryEditor = forwardRef<ElectoralAreaBoundaryEditorHandle, ComponentProps<typeof ElectoralAreaBoundaryEditorBase>>(
  function ElectoralAreaBoundaryEditor(props, ref) {
    return <ElectoralAreaBoundaryEditorBase {...props} ref={ref as never} />;
  },
);
const ElectoralAreasOverviewMap = dynamic(
  () => import('@/components/ui/ElectoralAreasOverviewMap'),
  { ssr: false },
);

interface ElectoralAreaStation {
  id: string;
  psCode: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

interface ElectoralAreaRow {
  id: string;
  name: string;
  location: string | null;
  boundaryGeoJson: string | null;
  boundaryPointCount: number;
  stationCount: number;
  stations: ElectoralAreaStation[];
}

export default function ElectoralAreasPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role;
  const canModify = userRole === 'ADMIN';
  const { data, mutate, isLoading } = useSWR<ElectoralAreaRow[]>('/api/electoral-areas', fetcher);

  const areas = Array.isArray(data) ? data : [];
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ElectoralAreaRow | null>(null);
  const [boundaryOpen, setBoundaryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', location: '' });
  const [editTarget, setEditTarget] = useState<ElectoralAreaRow | null>(null);
  const [boundaryTarget, setBoundaryTarget] = useState<ElectoralAreaRow | null>(null);
  const [boundaryInitialPoints, setBoundaryInitialPoints] = useState<LatLngPoint[]>([]);
  const [boundaryPointCount, setBoundaryPointCount] = useState(0);
  const boundaryEditorRef = useRef<ElectoralAreaBoundaryEditorHandle | null>(null);

  const resetForm = () => setForm({ name: '', location: '' });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/electoral-areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(result.error || 'Failed to create electoral area');
        return;
      }
      toast.success('Electoral area created');
      resetForm();
      setCreateOpen(false);
      mutate();
    } catch {
      toast.error('Failed to create electoral area');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (area: ElectoralAreaRow) => {
    setEditTarget(area);
    setForm({ name: area.name, location: area.location || '' });
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetch('/api/electoral-areas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editTarget.id, ...form }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(result.error || 'Failed to update electoral area');
        return;
      }
      toast.success('Electoral area updated');
      setEditOpen(false);
      setEditTarget(null);
      resetForm();
      mutate();
    } catch {
      toast.error('Failed to update electoral area');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/electoral-areas?id=${deleteTarget.id}`, {
        method: 'DELETE',
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(result.error || 'Failed to delete electoral area');
        return;
      }
      toast.success('Electoral area deleted');
      setDeleteTarget(null);
      mutate();
    } catch {
      toast.error('Failed to delete electoral area');
    }
  };

  const openBoundaryEditor = (area: ElectoralAreaRow) => {
    setBoundaryTarget(area);
    const points = parseBoundaryGeoJson(area.boundaryGeoJson);
    setBoundaryInitialPoints(points);
    setBoundaryPointCount(points.length);
    setBoundaryOpen(true);
  };

  const boundaryStations = useMemo(
    () => boundaryTarget?.stations ?? [],
    [boundaryTarget],
  );

  const handleSaveBoundary = async () => {
    if (!boundaryTarget) return;
    const points = boundaryEditorRef.current?.getPoints() ?? [];
    if (points.length > 0 && points.length < 3) {
      toast.error('Add at least 3 points to save a boundary');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/electoral-areas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: boundaryTarget.id,
          name: boundaryTarget.name,
          location: boundaryTarget.location || '',
          boundaryGeoJson: serializeBoundary(points),
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(result.error || 'Failed to save boundary');
        return;
      }
      toast.success(points.length === 0 ? 'Boundary removed' : 'Boundary saved');
      setBoundaryOpen(false);
      setBoundaryTarget(null);
      setBoundaryInitialPoints([]);
      setBoundaryPointCount(0);
      mutate();
    } catch {
      toast.error('Failed to save boundary');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1">
      <AdminHeader title="Electoral Areas" />

      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Electoral Areas</h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage electoral areas, see their boundaries on the map, and adjust polygon points where needed.
            </p>
          </div>
          {canModify && (
            <Button
              icon={<PlusIcon className="h-4 w-4" />}
              onClick={() => {
                resetForm();
                setCreateOpen(true);
              }}
            >
              Add Electoral Area
            </Button>
          )}
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Electoral Area Map</h3>
              <p className="text-sm text-gray-500">
                Blue shapes are saved boundaries. Teal pins show stations assigned to an area.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-primary-600" />
                Boundary
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-teal-700" />
                Station pin
              </span>
            </div>
          </div>

          <ElectoralAreasOverviewMap areas={areas} />
        </Card>

        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Name</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Location</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Boundary</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Stations</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Polling Stations</th>
                  {canModify && <th className="text-center py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={canModify ? 6 : 5} className="py-12 text-center text-gray-500">
                      Loading electoral areas...
                    </td>
                  </tr>
                )}

                {!isLoading && areas.map((area) => (
                  <tr key={area.id} className="border-b border-gray-50 align-top">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <MapPinIcon className="h-4 w-4 text-primary-500 shrink-0" />
                        <span className="font-medium text-gray-900">{area.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-600">
                      {area.location || <span className="text-gray-300">-</span>}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <Badge variant={area.boundaryPointCount >= 3 ? 'success' : 'neutral'} size="sm">
                        {area.boundaryPointCount >= 3 ? `${area.boundaryPointCount} pts` : 'Not set'}
                      </Badge>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <Badge variant={area.stationCount > 0 ? 'info' : 'neutral'} size="sm">
                        {area.stationCount}
                      </Badge>
                    </td>
                    <td className="py-4 px-4">
                      {area.stations.length === 0 ? (
                        <span className="text-gray-400 text-xs">No polling stations assigned</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {area.stations.map((station) => (
                            <span
                              key={station.id}
                              className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs text-primary-700"
                              title={station.name}
                            >
                              <span className="font-mono font-semibold">{station.psCode}</span>
                              <span className="text-primary-500">-</span>
                              <span className="truncate max-w-40">{station.name}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    {canModify && (
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEdit(area)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit electoral area"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openBoundaryEditor(area)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit area boundary"
                          >
                            <Squares2X2Icon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(area)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete electoral area"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}

                {!isLoading && areas.length === 0 && (
                  <tr>
                    <td colSpan={canModify ? 6 : 5} className="py-12 text-center text-gray-500">
                      No electoral areas created yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Modal
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetForm();
        }}
        title="Add Electoral Area"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
            required
          />
          <Input
            label="Location"
            value={form.location}
            onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))}
            placeholder="e.g. Winneba Central"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditTarget(null);
          resetForm();
        }}
        title={editTarget ? `Edit ${editTarget.name}` : 'Edit Electoral Area'}
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
            required
          />
          <Input
            label="Location"
            value={form.location}
            onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Electoral Area"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.name}? Any polling stations assigned to it will become unassigned.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
      />

      <Modal
        isOpen={boundaryOpen}
        onClose={() => {
          setBoundaryOpen(false);
          setBoundaryTarget(null);
          setBoundaryInitialPoints([]);
          setBoundaryPointCount(0);
        }}
        title={boundaryTarget ? `${boundaryTarget.name} Boundary` : 'Edit Boundary'}
        size="xl"
      >
        {boundaryTarget && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">
                Draw the electoral area on the map. Polling stations already assigned to this area are shown to help guide the outline.
              </p>
            </div>

            <ElectoralAreaBoundaryEditor
              ref={boundaryEditorRef}
              areaName={boundaryTarget.name}
              initialPoints={boundaryInitialPoints}
              stations={boundaryStations}
              onPointsChange={setBoundaryPointCount}
            />

            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-xs text-gray-500">
                {boundaryPointCount >= 3
                  ? 'This boundary is ready to save.'
                  : boundaryPointCount === 0
                    ? 'No boundary will be saved until points are added.'
                    : 'Add more points to form a valid area polygon.'}
              </p>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setBoundaryOpen(false);
                    setBoundaryTarget(null);
                    setBoundaryInitialPoints([]);
                    setBoundaryPointCount(0);
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleSaveBoundary} loading={saving}>
                  Save Boundary
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
