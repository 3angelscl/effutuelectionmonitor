'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import {
  ShieldCheckIcon,
  UserCircleIcon,
  KeyIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');

  // Profile state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Create and auto-revoke object URL to prevent memory leaks
  const photoPreviewUrl = useMemo(() => {
    if (!photoFile) return null;
    return URL.createObjectURL(photoFile);
  }, [photoFile]);
  useEffect(() => {
    return () => { if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl); };
  }, [photoPreviewUrl]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [twoFAMsg, setTwoFAMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [settingUp2FA, setSettingUp2FA] = useState(false);

  useEffect(() => {
    if (session?.user) {
      setName((session.user as { name: string }).name || '');
      setEmail(session.user.email || '');
      setPhoto((session.user as any).photo || '');
    }
    // Load 2FA status
    fetch('/api/auth/2fa')
      .then((r) => r.json())
      .then((data) => {
        if (data.enabled) setTwoFAEnabled(true);
      })
      .catch(() => {});
  }, [session]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setProfileMsg(null);

    try {
      const userId = (session?.user as { id: string })?.id;
      let photoUrl = photo;
      if (photoFile) {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', photoFile);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          photoUrl = url;
          setPhoto(url);
        } else {
          setProfileMsg({ type: 'error', text: 'Failed to upload photo' });
          setSaving(false);
          setIsUploading(false);
          return;
        }
        setIsUploading(false);
      }

      const body: Record<string, string> = { name };
      if (phone) body.phone = phone;
      if (photoUrl) body.photo = photoUrl;

      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setProfileMsg({ type: 'success', text: 'Profile updated successfully' });
        update({ photo: photoUrl, name });
      } else {
        setProfileMsg({ type: 'error', text: 'Failed to update profile' });
      }
    } catch {
      setProfileMsg({ type: 'error', text: 'An error occurred' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setProfileMsg({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    setSaving(true);
    setProfileMsg(null);

    try {
      const userId = (session?.user as { id: string })?.id;
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        setProfileMsg({ type: 'success', text: 'Password changed successfully' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const data = await res.json();
        setProfileMsg({ type: 'error', text: data.error || 'Failed to change password' });
      }
    } catch {
      setProfileMsg({ type: 'error', text: 'An error occurred' });
    } finally {
      setSaving(false);
    }
  };

  const setup2FA = async () => {
    setSettingUp2FA(true);
    try {
      const res = await fetch('/api/auth/2fa');
      const data = await res.json();
      if (data.enabled) {
        setTwoFAEnabled(true);
      } else {
        setQrCode(data.qrCode);
        setSecret(data.secret);
      }
    } catch {
      setTwoFAMsg({ type: 'error', text: 'Failed to setup 2FA' });
    }
  };

  const enable2FA = async () => {
    setTwoFAMsg(null);
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable', code: totpCode }),
      });
      const data = await res.json();
      if (data.enabled) {
        setTwoFAEnabled(true);
        setQrCode('');
        setSecret('');
        setTotpCode('');
        setSettingUp2FA(false);
        setTwoFAMsg({ type: 'success', text: '2FA enabled successfully' });
      } else {
        setTwoFAMsg({ type: 'error', text: data.error || 'Invalid code' });
      }
    } catch {
      setTwoFAMsg({ type: 'error', text: 'Verification failed' });
    }
  };

  const disable2FA = async () => {
    setTwoFAMsg(null);
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable', code: totpCode }),
      });
      const data = await res.json();
      if (data.enabled === false) {
        setTwoFAEnabled(false);
        setTotpCode('');
        setTwoFAMsg({ type: 'success', text: '2FA disabled' });
      } else {
        setTwoFAMsg({ type: 'error', text: data.error || 'Invalid code' });
      }
    } catch {
      setTwoFAMsg({ type: 'error', text: 'Failed to disable 2FA' });
    }
  };

  const tabs = [
    { key: 'profile' as const, label: 'Profile', icon: UserCircleIcon },
    { key: 'security' as const, label: 'Security', icon: ShieldCheckIcon },
  ];

  return (
    <div className="flex-1">
      <AdminHeader title="Settings" />

      <div className="p-6">
        <div className="max-w-3xl mx-auto">
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          {profileMsg && (
            <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
              profileMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {profileMsg.type === 'success' ? <CheckCircleIcon className="h-4 w-4" /> : <ExclamationTriangleIcon className="h-4 w-4" />}
              {profileMsg.text}
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Profile Info */}
              <Card>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h3>
                <form onSubmit={handleProfileSave} className="space-y-4">
                  <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
                  <Input label="Email Address" value={email} disabled />
                  <Input label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+233 XX XXX XXXX" />
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                      Profile Picture
                    </label>
                    <div className="flex items-center gap-4">
                      {photo || photoFile ? (
                        <div className="relative w-12 h-12 rounded-full overflow-hidden border border-gray-200">
                          <img src={photoPreviewUrl || photo} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                          <UserCircleIcon className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                        className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" loading={saving || isUploading}>Save Changes</Button>
                  </div>
                </form>
              </Card>

              {/* Change Password */}
              <Card>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <Input label="Current Password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                  <div>
                    <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                    <p className="mt-1 text-xs text-gray-500">Min 8 chars, 1 uppercase, 1 number, 1 special character</p>
                  </div>
                  <Input label="Confirm New Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                  <div className="flex justify-end">
                    <Button type="submit" loading={saving} variant="secondary" icon={<KeyIcon className="h-4 w-4" />}>
                      Update Password
                    </Button>
                  </div>
                </form>
              </Card>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Two-Factor Authentication</h3>
                    <p className="text-sm text-gray-500 mt-1">Add an extra layer of security to your account</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    twoFAEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {twoFAEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                {twoFAMsg && (
                  <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
                    twoFAMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {twoFAMsg.text}
                  </div>
                )}

                {!twoFAEnabled && !settingUp2FA && (
                  <Button onClick={setup2FA} icon={<ShieldCheckIcon className="h-4 w-4" />}>
                    Enable 2FA
                  </Button>
                )}

                {!twoFAEnabled && settingUp2FA && qrCode && (
                  <div className="space-y-4">
                    <div className="bg-gray-50 rounded-lg p-6 text-center">
                      <p className="text-sm text-gray-600 mb-4">
                        Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                      </p>
                      <img src={qrCode} alt="2FA QR Code" className="mx-auto w-48 h-48" />
                      <p className="text-xs text-gray-500 mt-3">
                        Manual entry key: <code className="bg-white px-2 py-1 rounded border text-xs">{secret}</code>
                      </p>
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <Input
                          label="Verification Code"
                          placeholder="Enter 6-digit code"
                          value={totpCode}
                          onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          maxLength={6}
                        />
                      </div>
                      <Button onClick={enable2FA} disabled={totpCode.length !== 6}>
                        Verify & Enable
                      </Button>
                    </div>
                  </div>
                )}

                {twoFAEnabled && (
                  <div className="space-y-4 mt-4">
                    <div className="bg-green-50 rounded-lg p-4 flex items-center gap-3">
                      <CheckCircleIcon className="h-6 w-6 text-green-600" />
                      <div>
                        <p className="text-sm font-medium text-green-800">2FA is active</p>
                        <p className="text-xs text-green-600">Your account is protected with two-factor authentication</p>
                      </div>
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <Input
                          label="Enter code to disable 2FA"
                          placeholder="6-digit code"
                          value={totpCode}
                          onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          maxLength={6}
                        />
                      </div>
                      <Button variant="danger" onClick={disable2FA} disabled={totpCode.length !== 6}>
                        Disable 2FA
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
