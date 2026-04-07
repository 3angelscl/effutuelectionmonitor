'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import ConfirmModal from '@/components/ui/ConfirmModal';
import Badge from '@/components/ui/Badge';
import { fetcher } from '@/lib/utils';
import { PlusIcon, PencilIcon, TrashIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';

interface ElectoralAreaStation {
  id: string;
  psCode: string;
  name: string;
}

interface ElectoralAreaRow {
  id: string;
  name: string;
  location: string | null;
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
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', location: '' });
  const [editTarget, setEditTarget] = useState<ElectoralAreaRow | null>(null);

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

  return (
    <div className="flex-1">
      <AdminHeader title="Electoral Areas" />

      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Electoral Areas</h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage electoral areas and see the polling stations assigned to each one.
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

        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Name</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Location</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Stations</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Polling Stations</th>
                  {canModify && <th className="text-center py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={canModify ? 5 : 4} className="py-12 text-center text-gray-500">
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
                    <td colSpan={canModify ? 5 : 4} className="py-12 text-center text-gray-500">
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
    </div>
  );
}
