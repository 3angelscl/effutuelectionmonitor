'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
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

export default function AgentSettingsPage() {
  const { data: session, update } = useSession();
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [twoFAMsg, setTwoFAMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [settingUp2FA, setSettingUp2FA] = useState(false);

  useEffect(() => {
    // Fetch full profile from API to get stored phone number.
    // Session only carries name/email/photo — phone is not included.
    fetch('/api/users/profile')
      .then((r) => r.json())
      .then((data) => {
        if (data.name) setName(data.name);
        if (data.phone) setPhone(data.phone);
      })
      .catch(() => {
        // Fall back to session name if API fails
        if (session?.user) {
          setName((session.user as { name: string }).name || '');
        }
      });
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
    setMessage(null);
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Profile updated successfully' });
        update();
      } else {
        setMessage({ type: 'error', text: 'Failed to update profile' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Password changed successfully' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Failed to change password' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred' });
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
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <h1 className="text-xl md:text-2xl font-bold text-gray-900">Settings</h1>

      <div className="max-w-3xl">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-full md:w-fit mb-6">
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
        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.type === 'success' ? <CheckCircleIcon className="h-4 w-4" /> : <ExclamationTriangleIcon className="h-4 w-4" />}
            {message.text}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-6">
            <Card>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h3>
              <form onSubmit={handleProfileSave} className="space-y-4 max-w-md">
                <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Email Address</label>
                  <p className="text-sm text-gray-700 bg-gray-50 px-4 py-3 rounded-lg">{session?.user?.email}</p>
                </div>
                <Input label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+233 XX XXX XXXX" />
                <Button type="submit" loading={saving}>Save Changes</Button>
              </form>
            </Card>

            <Card>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
              <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                <Input label="Current Password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                <div>
                  <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                  <p className="mt-1 text-xs text-gray-500">Min 8 chars, 1 uppercase, 1 number, 1 special character</p>
                </div>
                <Input label="Confirm New Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                <Button type="submit" loading={saving} variant="secondary" icon={<KeyIcon className="h-4 w-4" />}>
                  Update Password
                </Button>
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
  );
}
