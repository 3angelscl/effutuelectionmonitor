'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import Link from 'next/link';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { toast } from 'sonner';
import {
  UserCircleIcon,
  KeyIcon,
  ShieldCheckIcon,
  ClockIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  detail: string;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'System Administrator',
  OFFICER: 'Election Officer',
  VIEWER: 'Read-Only Viewer',
  AGENT: 'Polling Agent',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: 'Full access to all system features including user management, election setup, and data exports.',
  OFFICER: 'Can manage agents, stations, voters, and candidates. Cannot manage system users or delete elections.',
  VIEWER: 'Read-only access to election results, stations, and reports.',
  AGENT: 'Field access to submit results, record voter turnout, and report incidents.',
};

const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ['Manage all users', 'Full election control', 'View audit trails', 'Delete any record', 'Export data', 'Configure system'],
  OFFICER: ['Manage agents & stations', 'Upload voter registers', 'Manage candidates', 'View results & reports', 'Broadcast messages'],
  VIEWER: ['View election results', 'View polling stations', 'View reports', 'Live result viewer'],
  AGENT: ['Submit polling results', 'Record voter turnout', 'Report incidents', 'Field check-in/out', 'Agent messages'],
};

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const user = session?.user as { id: string; name: string; email: string; role?: string; photo?: string } | undefined;
  const role = user?.role || 'VIEWER';

  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Create and auto-revoke object URL to prevent memory leaks
  const photoPreviewUrl = useMemo(() => {
    if (!photoFile) return null;
    return URL.createObjectURL(photoFile);
  }, [photoFile]);
  useEffect(() => {
    return () => { if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl); };
  }, [photoPreviewUrl]);

  // Password change
  const [pwMode, setPwMode] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const { data: recentActivity } = useSWR<{ logs: AuditEntry[] }>(
    user?.id ? `/api/audit?limit=5&userId=${user.id}` : null,
    fetcher
  );

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhoto(user.photo || '');
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let photoUrl = photo;
      if (photoFile) {
        const fd = new FormData();
        fd.append('file', photoFile);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          photoUrl = url;
          setPhoto(url);
        } else {
          toast.error('Failed to upload photo');
          return;
        }
      }
      const body: Record<string, string> = { name };
      if (phone) body.phone = phone;
      if (photoUrl) body.photo = photoUrl;

      const res = await fetch(`/api/users/${user?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await update();
        toast.success('Profile updated');
        setEditMode(false);
        setPhotoFile(null);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update profile');
      }
    } catch {
      toast.error('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    setPwSaving(true);
    try {
      const res = await fetch(`/api/users/${user?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (res.ok) {
        toast.success('Password changed successfully');
        setPwMode(false);
        setCurrentPw(''); setNewPw(''); setConfirmPw('');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to change password');
      }
    } catch {
      toast.error('An error occurred');
    } finally {
      setPwSaving(false);
    }
  };

  const roleColor: Record<string, string> = {
    ADMIN: 'text-red-700 bg-red-50 border-red-200',
    OFFICER: 'text-amber-700 bg-amber-50 border-amber-200',
    VIEWER: 'text-gray-600 bg-gray-50 border-gray-200',
    AGENT: 'text-blue-700 bg-blue-50 border-blue-200',
  };

  const previewUrl = photoPreviewUrl || photo;

  return (
    <div className="flex-1">
      <AdminHeader title="My Profile" />

      <div className="p-6 max-w-4xl mx-auto space-y-6">

        {/* Profile Header Card */}
        <Card>
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="relative shrink-0">
              {previewUrl ? (
                <img src={previewUrl} alt={user?.name} className="w-20 h-20 rounded-full object-cover border-2 border-gray-200" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary-600">{user?.name?.[0]?.toUpperCase()}</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{user?.name}</h2>
                  <p className="text-sm text-gray-500">{user?.email}</p>
                  <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-semibold border ${roleColor[role] || roleColor.VIEWER}`}>
                    <ShieldCheckIcon className="h-3.5 w-3.5" />
                    {ROLE_LABELS[role] || role}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<PencilIcon className="h-3.5 w-3.5" />}
                    onClick={() => setEditMode(!editMode)}
                  >
                    {editMode ? 'Cancel' : 'Edit Profile'}
                  </Button>
                  <Link href="/admin/settings">
                    <Button variant="outline" size="sm" icon={<Cog6ToothIcon className="h-3.5 w-3.5" />}>
                      Settings
                    </Button>
                  </Link>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2 max-w-xl">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
          </div>

          {/* Edit form */}
          {editMode && (
            <form onSubmit={handleSave} className="mt-5 pt-5 border-t border-gray-100 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
                <Input label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+233 XX XXX XXXX" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Profile Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                  className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" type="button" onClick={() => { setEditMode(false); setPhotoFile(null); }}>Cancel</Button>
                <Button type="submit" loading={saving}>Save Changes</Button>
              </div>
            </form>
          )}
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Role Permissions */}
          <Card>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Your Permissions</h3>
            <p className="text-sm text-gray-500 mb-4">Capabilities granted to the <strong>{ROLE_LABELS[role]}</strong> role</p>
            <ul className="space-y-2">
              {(ROLE_PERMISSIONS[role] || []).map((perm) => (
                <li key={perm} className="flex items-center gap-2 text-sm text-gray-700">
                  <CheckCircleIcon className="h-4 w-4 text-green-500 shrink-0" />
                  {perm}
                </li>
              ))}
            </ul>
          </Card>

          {/* Change Password */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">Security</h3>
              <button
                onClick={() => setPwMode(!pwMode)}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                {pwMode ? 'Cancel' : 'Change Password'}
              </button>
            </div>

            {!pwMode ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <KeyIcon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Password</p>
                    <p className="text-xs text-gray-500">Last changed: unknown</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <ShieldCheckIcon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Two-Factor Authentication</p>
                    <p className="text-xs text-gray-500">
                      Configure in{' '}
                      <Link href="/admin/settings" className="text-primary-600 hover:underline">Settings → Security</Link>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handlePasswordChange} className="space-y-3">
                <Input label="Current Password" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
                <Input label="New Password" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Min 8 chars, uppercase, number, symbol" required />
                <Input label="Confirm New Password" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required />
                <div className="flex justify-end">
                  <Button type="submit" loading={pwSaving} icon={<KeyIcon className="h-4 w-4" />}>
                    Update Password
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Recent Activity</h3>
            {role === 'ADMIN' && (
              <Link href="/admin/audit" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                Full Audit Trail →
              </Link>
            )}
          </div>
          {!recentActivity?.logs || recentActivity.logs.length === 0 ? (
            <div className="py-8 text-center">
              <ClockIcon className="h-10 w-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No recent activity recorded</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentActivity.logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="w-7 h-7 rounded-full bg-primary-50 flex items-center justify-center shrink-0 mt-0.5">
                    <BuildingOfficeIcon className="h-3.5 w-3.5 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{log.detail}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(log.createdAt).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                  <Badge variant="neutral" size="sm">{log.action}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
