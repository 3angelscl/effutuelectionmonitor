'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import StatCard from '@/components/ui/StatCard';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { toast } from 'sonner';
import {
  UserGroupIcon,
  SignalIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  TrashIcon,
  ArrowsRightLeftIcon,
  PlusIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface UserData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  photo: string | null;
  role: string;
  assignedStations: { psCode: string; name: string }[];
}

interface StationData {
  id: string;
  psCode: string;
  name: string;
  agentId: string | null;
}

export default function AgentManagement() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role;
  const canModify = userRole === 'ADMIN';

  const { data: users, mutate: mutateUsers } = useSWR<UserData[]>('/api/users', fetcher);
  const { data: stations, mutate: mutateStations } = useSWR<StationData[]>('/api/stations', fetcher);
  const [page, setPage] = useState(1);

  // Assign modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<UserData | null>(null);
  const [selectedStationId, setSelectedStationId] = useState('');

  // Create modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '', email: '', password: '', phone: '', stationId: '', photo: '',
  });

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', photo: '', newPassword: '' });
  const [editAgent, setEditAgent] = useState<UserData | null>(null);

  // Bulk assign state
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkAssignments, setBulkAssignments] = useState<Record<string, string>>({});
  const [bulkAssigning, setBulkAssigning] = useState(false);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handlePhotoUpload = async (file: File, target: 'create' | 'edit') => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/users/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to upload photo');
        return;
      }
      const { url } = await res.json();
      if (target === 'create') {
        setCreateForm((f) => ({ ...f, photo: url }));
      } else {
        setEditForm((f) => ({ ...f, photo: url }));
      }
    } catch {
      setError('Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const agents = (Array.isArray(users) ? users : []).filter((u) => u.role === 'AGENT');
  const unassignedStations = (Array.isArray(stations) ? stations : []).filter((s) => !s.agentId);
  const perPage = 10;
  const totalPages = Math.ceil(agents.length / perPage);
  const paginatedAgents = agents.slice((page - 1) * perPage, page * perPage);

  // --- Create Agent ---
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...createForm, role: 'AGENT' }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create agent');
        return;
      }
      mutateUsers();
      mutateStations();
      toast.success('Agent created successfully');
      setCreateModalOpen(false);
      setCreateForm({ name: '', email: '', password: '', phone: '', stationId: '', photo: '' });
    } catch {
      setError('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  // --- Edit Agent ---
  const openEditModal = (agent: UserData) => {
    setEditAgent(agent);
    setEditForm({ name: agent.name, phone: agent.phone || '', photo: agent.photo || '', newPassword: '' });
    setError('');
    setEditModalOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAgent) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${editAgent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, ...(editForm.newPassword ? { password: editForm.newPassword } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update agent');
        return;
      }
      mutateUsers();
      toast.success(editForm.newPassword ? 'Agent updated and password reset' : 'Agent updated successfully');
      setEditModalOpen(false);
      setEditAgent(null);
    } catch {
      setError('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  // --- Assign/Reassign ---
  const handleAssign = async () => {
    if (!selectedAgent || !selectedStationId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/stations/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgent.id, stationId: selectedStationId }),
      });
      if (res.ok) {
        toast.success('Agent assigned successfully');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Assignment failed');
      }
      mutateUsers();
      mutateStations();
      setAssignModalOpen(false);
      setSelectedAgent(null);
      setSelectedStationId('');
    } catch (err) {
      console.error('Assign error:', err);
      toast.error('Assignment failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // --- Delete ---
  const handleDelete = async (id: string) => {
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/users?id=${deleteTarget}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete agent');
        return;
      }
      mutateUsers();
      mutateStations();
      toast.success('Agent deleted');
    } catch {
      toast.error('Failed to delete agent. Please try again.');
    } finally {
      setDeleteTarget(null);
    }
  };

  // --- Bulk Assign ---
  const unassignedAgents = agents.filter((a) => a.assignedStations.length === 0);

  const handleBulkAssign = async () => {
    const assignments = Object.entries(bulkAssignments)
      .filter(([, stationId]) => stationId)
      .map(([agentId, stationId]) => ({ agentId, stationId }));
    if (assignments.length === 0) return;
    setBulkAssigning(true);
    try {
      const res = await fetch('/api/stations/assign-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
      });
      if (res.ok) {
        toast.success(`${assignments.length} agent${assignments.length !== 1 ? 's' : ''} assigned successfully`);
        setShowBulkAssign(false);
        setBulkAssignments({});
        mutateUsers();
        mutateStations();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Bulk assign failed');
      }
    } catch (err) {
      console.error('Bulk assign error:', err);
      toast.error('Bulk assign failed. Please try again.');
    } finally {
      setBulkAssigning(false);
    }
  };

  const openAssignModal = (agent: UserData) => {
    setSelectedAgent(agent);
    setSelectedStationId('');
    setAssignModalOpen(true);
  };

  const getAgentId = (_agent: UserData, index: number) => {
    return `AG-EF-${String(index + 1).padStart(3, '0')}`;
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : name.slice(0, 2);
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-orange-500',
      'bg-teal-600', 'bg-rose-600', 'bg-indigo-600', 'bg-amber-600',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="flex-1">
      <AdminHeader title="Polling Agents Management" />

      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Total Agents"
            value={String(agents.length)}
            icon={<UserGroupIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Active Now"
            value={String(agents.filter((a) => a.assignedStations.length > 0).length)}
            icon={<SignalIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Unassigned Stations"
            value={String(unassignedStations.length)}
            icon={<ExclamationTriangleIcon className="h-6 w-6" />}
          />
        </div>

        {/* Action Buttons */}
        {canModify && (
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="outline"
              icon={<ArrowsRightLeftIcon className="h-4 w-4" />}
              onClick={() => { setError(''); setBulkAssignments({}); setShowBulkAssign(true); }}
            >
              Bulk Assign
            </Button>
            <Button
              icon={<PlusIcon className="h-4 w-4" />}
              onClick={() => { setError(''); setCreateModalOpen(true); }}
            >
              Add New Agent
            </Button>
          </div>
        )}

        {/* Agents Table */}
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Agent Details</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Agent ID</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Assigned Polling Station</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Contact Number</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  {canModify && <th className="text-center py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedAgents.map((agent, idx) => {
                  const globalIdx = (page - 1) * perPage + idx;
                  const isAssigned = agent.assignedStations.length > 0;
                  return (
                    <tr key={agent.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          {agent.photo ? (
                            <img
                              src={agent.photo}
                              alt={agent.name}
                              className="w-10 h-10 rounded-full object-cover shrink-0 border-2 border-gray-100"
                            />
                          ) : (
                            <div className={`w-10 h-10 ${getAvatarColor(agent.name)} rounded-full flex items-center justify-center text-white text-sm font-bold`}>
                              {getInitials(agent.name)}
                            </div>
                          )}
                          <a href={`/admin/agents/${agent.id}`} className="font-semibold text-gray-900 hover:text-primary-600 transition-colors">{agent.name}</a>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono text-xs text-gray-600">
                        {getAgentId(agent, globalIdx)}
                      </td>
                      <td className="py-4 px-4">
                        {isAssigned ? (
                          <div>
                            <p className="text-gray-900 font-medium">{agent.assignedStations[0].name}</p>
                            <p className="text-xs text-primary-600 font-medium">{agent.assignedStations[0].psCode}</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-orange-500 italic font-medium">Not Assigned</p>
                            <p className="text-xs text-gray-400">-----</p>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-gray-600">
                        {agent.phone || '-'}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {isAssigned ? (
                          <Badge variant="success" dot>Assigned</Badge>
                        ) : (
                          <Badge variant="warning" dot>Unassigned</Badge>
                        )}
                      </td>
                      {canModify && (
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openEditModal(agent)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            {isAssigned ? (
                              <button
                                onClick={() => openAssignModal(agent)}
                                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                title="Reassign"
                              >
                                <ArrowsRightLeftIcon className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => openAssignModal(agent)}
                                className="px-3 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                                title="Assign to station"
                              >
                                <ArrowsRightLeftIcon className="h-3.5 w-3.5" />
                                Assign
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(agent.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {agents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-500">
                      No agents registered yet. Click &quot;Add New Agent&quot; to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {agents.length > perPage && (
            <div className="px-6 py-4 flex items-center justify-between border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Showing {(page - 1) * perPage + 1} to {Math.min(page * perPage, agents.length)} of {agents.length} agents
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  &lsaquo;
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
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
                {totalPages > 5 && page < totalPages - 2 && (
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

      {/* Create Agent Modal */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Add New Agent">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          <Input
            label="Full Name"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            placeholder="e.g. Kwesi Mensah"
            required
          />
          <Input
            label="Email"
            type="email"
            value={createForm.email}
            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            placeholder="e.g. kwesi@effutu.gov.gh"
            required
          />
          <Input
            label="Password"
            type="password"
            value={createForm.password}
            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            placeholder="Minimum 6 characters"
            required
          />
          <Input
            label="Phone Number"
            value={createForm.phone}
            onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
            placeholder="e.g. +233 55 123 4567"
          />
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Agent Photo (Optional)
            </label>
            <div className="flex items-center gap-4">
              {createForm.photo ? (
                <img
                  src={createForm.photo}
                  alt="Preview"
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                  <PhotoIcon className="h-6 w-6 text-gray-400" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 transition-colors inline-block text-center">
                  {uploading ? 'Uploading...' : createForm.photo ? 'Change Photo' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file, 'create');
                    }}
                  />
                </label>
                {createForm.photo && (
                  <button
                    type="button"
                    onClick={() => setCreateForm({ ...createForm, photo: '' })}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Assign to Polling Station (Optional)
            </label>
            <select
              value={createForm.stationId}
              onChange={(e) => setCreateForm({ ...createForm, stationId: e.target.value })}
              className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              <option value="">Select station...</option>
              {unassignedStations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.psCode} - {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <Button variant="secondary" type="button" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create Agent
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Agent Modal */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Agent">
        <form onSubmit={handleEdit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          {editAgent && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">{editAgent.email}</p>
            </div>
          )}
          <Input
            label="Full Name"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            required
          />
          <Input
            label="Phone Number"
            value={editForm.phone}
            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
            placeholder="e.g. +233 55 123 4567"
          />
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Agent Photo
            </label>
            <div className="flex items-center gap-4">
              {editForm.photo ? (
                <img
                  src={editForm.photo}
                  alt="Preview"
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                  <PhotoIcon className="h-6 w-6 text-gray-400" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 transition-colors inline-block text-center">
                  {uploading ? 'Uploading...' : editForm.photo ? 'Change Photo' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file, 'edit');
                    }}
                  />
                </label>
                {editForm.photo && (
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, photo: '' })}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <Input
              label="New Password (leave blank to keep current)"
              type="password"
              value={editForm.newPassword}
              onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
              placeholder="Minimum 6 characters"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Assign/Reassign Modal */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={selectedAgent?.assignedStations.length ? 'Reassign Agent' : 'Assign Agent'}
      >
        <div className="space-y-4">
          {selectedAgent && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="font-medium text-gray-900">{selectedAgent.name}</p>
              <p className="text-xs text-gray-500">{selectedAgent.email}</p>
              {selectedAgent.assignedStations.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Currently assigned to: {selectedAgent.assignedStations[0].psCode} - {selectedAgent.assignedStations[0].name}
                </p>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Select Polling Station
            </label>
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              <option value="">Select station...</option>
              {unassignedStations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.psCode} - {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} loading={saving} disabled={!selectedStationId}>
              {selectedAgent?.assignedStations.length ? 'Reassign' : 'Assign'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Assign Modal */}
      <Modal
        isOpen={showBulkAssign}
        onClose={() => setShowBulkAssign(false)}
        title="Bulk Assign Agents"
      >
        <div className="space-y-4">
          {unassignedAgents.length === 0 ? (
            <div className="text-center py-6">
              <UserGroupIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">All agents are already assigned to stations.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                {unassignedAgents.length} unassigned agent{unassignedAgents.length !== 1 ? 's' : ''} &middot; {unassignedStations.length} available station{unassignedStations.length !== 1 ? 's' : ''}
              </p>
              <div className="max-h-80 overflow-y-auto space-y-3">
                {unassignedAgents.map((agent) => (
                  <div key={agent.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{agent.name}</p>
                      <p className="text-xs text-gray-500 truncate">{agent.email}</p>
                    </div>
                    <select
                      value={bulkAssignments[agent.id] || ''}
                      onChange={(e) =>
                        setBulkAssignments((prev) => ({ ...prev, [agent.id]: e.target.value }))
                      }
                      className="w-52 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    >
                      <option value="">Select station...</option>
                      {unassignedStations
                        .filter(
                          (s) =>
                            !Object.values(bulkAssignments).includes(s.id) ||
                            bulkAssignments[agent.id] === s.id
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.psCode} - {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button variant="secondary" onClick={() => setShowBulkAssign(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleBulkAssign}
                  loading={bulkAssigning}
                  disabled={Object.values(bulkAssignments).filter(Boolean).length === 0}
                >
                  Assign {Object.values(bulkAssignments).filter(Boolean).length} Agent{Object.values(bulkAssignments).filter(Boolean).length !== 1 ? 's' : ''}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Agent"
        message="Are you sure you want to delete this agent?"
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
