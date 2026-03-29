'use client';

import { useState } from 'react';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface UserData {
  id: string;
  email: string;
  name: string;
  role: string;
  phone: string | null;
  photo: string | null;
  createdAt: string;
  assignedStations: { psCode: string; name: string }[];
}

export default function UserManagement() {
  const { data: allUsers, mutate } = useSWR<UserData[]>('/api/users', fetcher);
  const users = (Array.isArray(allUsers) ? allUsers : []).filter((u) => u.role !== 'AGENT');

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '', email: '', password: '', role: 'OFFICER', phone: '', photo: '', photoFile: null as File | null,
  });

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserData | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', phone: '', role: '', photo: '', photoFile: null as File | null,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // ── Create User ──
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload: Record<string, string> = {
        name: createForm.name,
        email: createForm.email,
        password: createForm.password,
        role: createForm.role,
      };
      if (createForm.phone) payload.phone = createForm.phone;
      
      let finalPhoto = createForm.photo;
      if (createForm.photoFile) {
        const formData = new FormData();
        formData.append('file', createForm.photoFile);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          finalPhoto = url;
        } else {
          setError('Failed to upload photo');
          setSaving(false);
          return;
        }
      }
      if (finalPhoto) payload.photo = finalPhoto;

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create user');
        return;
      }
      mutate();
      toast.success('User created successfully');
      setCreateOpen(false);
      setCreateForm({ name: '', email: '', password: '', role: 'OFFICER', phone: '', photo: '', photoFile: null });
    } catch {
      setError('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  // ── Edit User ──
  const openEdit = (user: UserData) => {
    setEditTarget(user);
    setEditForm({ name: user.name, phone: user.phone || '', role: user.role, photo: user.photo || '', photoFile: null });
    setError('');
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    setError('');

    try {
      const payload: Record<string, string | null> = {};
      if (editForm.name !== editTarget.name) payload.name = editForm.name;
      if ((editForm.phone || null) !== (editTarget.phone || null)) payload.phone = editForm.phone || null;
      if (editForm.role !== editTarget.role) payload.role = editForm.role;
      
      let finalPhoto = editForm.photo;
      if (editForm.photoFile) {
        const formData = new FormData();
        formData.append('file', editForm.photoFile);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          finalPhoto = url;
        } else {
          setError('Failed to upload photo');
          setSaving(false);
          return;
        }
      }
      if ((finalPhoto || null) !== (editTarget.photo || null)) payload.photo = finalPhoto || null;

      if (Object.keys(payload).length === 0) {
        setEditOpen(false);
        return;
      }

      const res = await fetch(`/api/users/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update user');
        return;
      }
      mutate();
      toast.success('User updated successfully');
      setEditOpen(false);
      setEditTarget(null);
    } catch {
      setError('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete User ──
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/users?id=${deleteTarget}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete user');
        return;
      }
      mutate();
      toast.success('User deleted');
    } catch {
      toast.error('Failed to delete user. Please try again.');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex-1">
      <AdminHeader title="User Management" />

      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">System Users</h2>
            <p className="text-sm text-gray-500 mt-1">Manage admin, officer, and viewer accounts</p>
          </div>
          <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => { setError(''); setCreateOpen(true); }}>
            Add User
          </Button>
        </div>

        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">User</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Role</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Phone</th>
                <th className="text-center py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 px-6">
                    <div className="flex items-center gap-3">
                      {user.photo ? (
                        <img src={user.photo} alt={user.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                          <span className="text-sm font-medium text-gray-500">{user.name[0]?.toUpperCase()}</span>
                        </div>
                      )}
                      <span className="font-medium text-gray-900">{user.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{user.email}</td>
                  <td className="py-3 px-4 text-center">
                    <Badge
                      variant={
                        user.role === 'ADMIN' ? 'danger' :
                        user.role === 'OFFICER' ? 'warning' : 'neutral'
                      }
                    >
                      {user.role}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{user.phone || '-'}</td>
                  <td className="py-3 px-6 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEdit(user)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(user.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </Card>
      </div>

      {/* Create User Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create User">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          <Input
            label="Full Name"
            value={createForm.name}
            onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label="Email"
            type="email"
            value={createForm.email}
            onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
          <Input
            label="Password"
            type="password"
            value={createForm.password}
            onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Minimum 6 characters"
            required
          />
          <Input
            label="Phone (optional)"
            value={createForm.phone}
            onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Profile Picture
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCreateForm((f) => ({ ...f, photoFile: e.target.files?.[0] || null }))}
              className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Role
            </label>
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
              className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              <option value="OFFICER">Election Officer</option>
              <option value="VIEWER">Viewer</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create User
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit User">
        <form onSubmit={handleEdit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          {editTarget && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">{editTarget.email}</p>
            </div>
          )}
          <Input
            label="Full Name"
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label="Phone"
            value={editForm.phone}
            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="e.g. +233 55 123 4567"
          />
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Profile Picture
            </label>
            <div className="flex items-center gap-4 mb-2">
              {(editForm.photoFile || editForm.photo) ? (
                <img
                  src={editForm.photoFile ? URL.createObjectURL(editForm.photoFile) : editForm.photo}
                  alt="Preview"
                  className="w-12 h-12 rounded-full object-cover border border-gray-200 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <span className="text-lg font-medium text-gray-400">{editForm.name[0]?.toUpperCase() || '?'}</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setEditForm((f) => ({ ...f, photoFile: e.target.files?.[0] || null }))}
                className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Role
            </label>
            <select
              value={editForm.role}
              onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
              className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            >
              <option value="OFFICER">Election Officer</option>
              <option value="VIEWER">Viewer</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-4">
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
        onConfirm={confirmDelete}
        title="Delete User"
        message="Are you sure you want to delete this user?"
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
