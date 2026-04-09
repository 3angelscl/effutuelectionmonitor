'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  PhoneIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';

type TabKey = 'profile' | 'security';
type Message = { type: 'success' | 'error'; text: string } | null;

interface ProfileResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  photo: string | null;
}

function MessageBanner({ message }: { message: Message }) {
  if (!message) return null;

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        message.type === 'success'
          ? 'border-green-200 bg-green-50 text-green-700'
          : 'border-red-200 bg-red-50 text-red-700'
      }`}
    >
      <div className="flex items-center gap-2">
        {message.type === 'success' ? (
          <CheckCircleIcon className="h-4 w-4" />
        ) : (
          <ExclamationTriangleIcon className="h-4 w-4" />
        )}
        <span>{message.text}</span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const [activeTab, setActiveTab] = useState<TabKey>('profile');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [profileMsg, setProfileMsg] = useState<Message>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const photoPreviewUrl = useMemo(() => {
    if (!photoFile) return null;
    return URL.createObjectURL(photoFile);
  }, [photoFile]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<Message>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [twoFAMsg, setTwoFAMsg] = useState<Message>(null);
  const [settingUp2FA, setSettingUp2FA] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const res = await fetch('/api/users/profile');
      const data = (await res.json().catch(() => ({}))) as Partial<ProfileResponse> & { error?: string };

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load profile');
      }

      setName(data.name || '');
      setEmail(data.email || '');
      setPhone(data.phone || '');
      setPhoto(data.photo || '');
    } catch {
      if (session?.user) {
        setName((session.user as { name?: string }).name || '');
        setEmail(session.user.email || '');
        setPhoto((session.user as { photo?: string | null }).photo || '');
      }
    } finally {
      setLoadingProfile(false);
    }
  }, [session]);

  const loadTwoFAStatus = useCallback(async () => {
    const res = await fetch('/api/auth/2fa');
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error((data as { error?: string }).error || 'Failed to load 2FA status');
    }

    if ((data as { enabled?: boolean }).enabled) {
      setTwoFAEnabled(true);
      setSettingUp2FA(false);
      setQrCode('');
      setSecret('');
      return;
    }

    if ((data as { qrCode?: string }).qrCode && (data as { secret?: string }).secret) {
      setTwoFAEnabled(false);
      setSettingUp2FA(true);
      setQrCode((data as { qrCode: string }).qrCode);
      setSecret((data as { secret: string }).secret);
      return;
    }

    setTwoFAEnabled(false);
    setSettingUp2FA(false);
    setQrCode('');
    setSecret('');
  }, []);

  useEffect(() => {
    loadProfile().catch(() => {});
    loadTwoFAStatus().catch(() => {});
  }, [loadProfile, loadTwoFAStatus]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);

    try {
      let photoUrl = photo;

      if (photoFile) {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', photoFile);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!uploadRes.ok) {
          const uploadData = await uploadRes.json().catch(() => ({}));
          setProfileMsg({ type: 'error', text: uploadData.error || 'Failed to upload photo' });
          setSavingProfile(false);
          setIsUploading(false);
          return;
        }

        const { url } = await uploadRes.json();
        photoUrl = url;
        setPhoto(url);
        setPhotoFile(null);
        setIsUploading(false);
      }

      const body: Record<string, string> = { name };
      body.phone = phone;
      if (photoUrl) body.photo = photoUrl;

      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setProfileMsg({ type: 'error', text: data.error || 'Failed to update profile' });
        return;
      }

      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
      await update({ photo: photoUrl, name });
    } catch {
      setProfileMsg({ type: 'error', text: 'An error occurred while saving your profile.' });
    } finally {
      setSavingProfile(false);
      setIsUploading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    setSavingPassword(true);

    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPasswordMsg({ type: 'error', text: data.error || 'Failed to change password' });
        return;
      }

      setPasswordMsg({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPasswordMsg({ type: 'error', text: 'An error occurred while changing your password.' });
    } finally {
      setSavingPassword(false);
    }
  };

  const setup2FA = async () => {
    setSettingUp2FA(true);
    setTwoFAMsg(null);
    try {
      await loadTwoFAStatus();
    } catch {
      setSettingUp2FA(false);
      setTwoFAMsg({ type: 'error', text: 'Failed to setup 2FA.' });
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
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.enabled) {
        setTwoFAEnabled(true);
        setQrCode('');
        setSecret('');
        setTotpCode('');
        setSettingUp2FA(false);
        setTwoFAMsg({ type: 'success', text: 'Two-factor authentication enabled successfully.' });
      } else {
        setTwoFAMsg({ type: 'error', text: data.error || 'Invalid verification code.' });
      }
    } catch {
      setTwoFAMsg({ type: 'error', text: 'Verification failed.' });
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
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.enabled === false) {
        setTwoFAEnabled(false);
        setTotpCode('');
        setTwoFAMsg({ type: 'success', text: 'Two-factor authentication disabled.' });
      } else {
        setTwoFAMsg({ type: 'error', text: data.error || 'Invalid verification code.' });
      }
    } catch {
      setTwoFAMsg({ type: 'error', text: 'Failed to disable 2FA.' });
    }
  };

  const tabs = [
    { key: 'profile' as const, label: 'Profile', icon: UserCircleIcon },
    { key: 'security' as const, label: 'Security', icon: ShieldCheckIcon },
  ];

  const activePhoto = photoPreviewUrl || photo;
  const passwordStrength = useMemo(() => {
    let score = 0;
    if (newPassword.length >= 8) score += 1;
    if (/[A-Z]/.test(newPassword)) score += 1;
    if (/\d/.test(newPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1;
    return score;
  }, [newPassword]);

  const passwordStrengthLabel = ['Weak', 'Fair', 'Good', 'Strong', 'Very strong'][passwordStrength] || 'Weak';

  return (
    <div className="flex-1">
      <AdminHeader title="Settings" />

      <div className="space-y-4 p-4 md:space-y-6 md:p-6">
        <div className="mx-auto max-w-6xl">
          <Card className="overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
            <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-100">
                  Account center
                </div>
                <div>
                  <h2 className="text-2xl font-semibold sm:text-3xl">Manage your profile and security in one place</h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
                    Keep your contact details current, review your account identity, and strengthen access with password
                    updates and two-factor authentication.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Signed in as</p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {(session?.user as { role?: string })?.role || 'User'}
                  </p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300">2FA status</p>
                  <p className="mt-2 text-sm font-semibold text-white">{twoFAEnabled ? 'Enabled' : 'Disabled'}</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Contact number</p>
                  <p className="mt-2 text-sm font-semibold text-white">{phone || 'Not set'}</p>
                </div>
              </div>
            </div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
            <div className="space-y-4">
              <Card className="border border-gray-200 bg-white">
                <div className="flex flex-col items-center text-center">
                  {activePhoto ? (
                    <img
                      src={activePhoto}
                      alt="Profile"
                      className="h-24 w-24 rounded-3xl border border-gray-200 object-cover shadow-sm"
                    />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gray-100">
                      <UserCircleIcon className="h-12 w-12 text-gray-400" />
                    </div>
                  )}
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">{name || 'Your account'}</h3>
                  <p className="text-sm text-gray-500">{email || 'Loading profile...'}</p>
                  <div className="mt-4 flex w-full flex-col gap-2">
                    {tabs.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors ${
                          activeTab === tab.key
                            ? 'bg-slate-900 text-white'
                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                      >
                        <tab.icon className="h-5 w-5" />
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="border border-gray-200 bg-white">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">Quick status</h3>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-gray-500">Profile completion</span>
                    <span className="font-semibold text-gray-900">{name && email && phone ? 'Complete' : 'Needs attention'}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-gray-500">Password strength target</span>
                    <span className="font-semibold text-gray-900">8+ chars with complexity</span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-gray-500">Two-factor authentication</span>
                    <span className={`font-semibold ${twoFAEnabled ? 'text-green-700' : 'text-amber-600'}`}>
                      {twoFAEnabled ? 'Protected' : 'Recommended'}
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              {activeTab === 'profile' && (
                <>
                  <Card className="border border-gray-200 bg-white">
                    <div className="mb-5">
                      <h3 className="text-xl font-semibold text-gray-900">Profile Information</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Update the identity and contact details other admins and team members rely on.
                      </p>
                    </div>

                    <MessageBanner message={profileMsg} />

                    <form onSubmit={handleProfileSave} className="mt-5 space-y-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          label="Full Name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          disabled={loadingProfile}
                        />
                        <Input label="Email Address" value={email} disabled />
                      </div>

                      <Input
                        label="Phone Number"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+233 XX XXX XXXX"
                        disabled={loadingProfile}
                        icon={<PhoneIcon className="h-4 w-4" />}
                      />

                      <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-600">
                          Profile Picture
                        </label>
                        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            {activePhoto ? (
                              <img
                                src={activePhoto}
                                alt="Preview"
                                className="h-20 w-20 rounded-2xl border border-gray-200 object-cover"
                              />
                            ) : (
                              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white">
                                <UserCircleIcon className="h-10 w-10 text-gray-400" />
                              </div>
                            )}
                            <div className="flex-1">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                                className="text-sm text-gray-600 file:mr-4 file:rounded-full file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
                              />
                              <p className="mt-2 text-xs text-gray-500">
                                JPG, PNG, GIF, or WebP up to 5MB. Your new image will be uploaded when you save.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <Button type="submit" loading={savingProfile || isUploading}>
                          Save Profile
                        </Button>
                      </div>
                    </form>
                  </Card>

                  <Card className="border border-gray-200 bg-white">
                    <div className="mb-5">
                      <h3 className="text-xl font-semibold text-gray-900">Change Password</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Choose a strong password you do not reuse elsewhere. Updating it signs out other active sessions.
                      </p>
                    </div>

                    <MessageBanner message={passwordMsg} />

                    <form onSubmit={handlePasswordChange} className="mt-5 space-y-4">
                      <Input
                        label="Current Password"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Input
                            label="New Password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                          />
                          <div className="mt-2 flex items-center justify-between text-xs">
                            <span className="text-gray-500">Needs 8+ chars, uppercase, number, and symbol.</span>
                            <span className="font-medium text-gray-700">{passwordStrengthLabel}</span>
                          </div>
                        </div>
                        <Input
                          label="Confirm New Password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                        />
                      </div>

                      <div className="flex justify-end">
                        <Button type="submit" loading={savingPassword} variant="secondary" icon={<KeyIcon className="h-4 w-4" />}>
                          Update Password
                        </Button>
                      </div>
                    </form>
                  </Card>
                </>
              )}

              {activeTab === 'security' && (
                <Card className="border border-gray-200 bg-white">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">Two-Factor Authentication</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Add a second verification step with an authenticator app to protect your account from password-only access.
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                        twoFAEnabled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {twoFAEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Status</p>
                      <p className="mt-2 text-lg font-semibold text-gray-900">{twoFAEnabled ? 'Active' : 'Not active'}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Method</p>
                      <p className="mt-2 text-lg font-semibold text-gray-900">Authenticator app</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Verification</p>
                      <p className="mt-2 text-lg font-semibold text-gray-900">6-digit TOTP code</p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <MessageBanner message={twoFAMsg} />
                  </div>

                  {!twoFAEnabled && !settingUp2FA && (
                    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm font-medium text-amber-800">Two-factor authentication is currently turned off.</p>
                      <p className="mt-1 text-sm text-amber-700">
                        Enabling it will require a one-time code from your authenticator app whenever you sign in.
                      </p>
                      <div className="mt-4">
                        <Button onClick={setup2FA} icon={<ShieldCheckIcon className="h-4 w-4" />}>
                          Start 2FA setup
                        </Button>
                      </div>
                    </div>
                  )}

                  {!twoFAEnabled && settingUp2FA && qrCode && (
                    <div className="mt-5 space-y-5">
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                        <p className="text-sm text-gray-600">
                          Scan this QR code with Google Authenticator, Authy, Microsoft Authenticator, or a similar app.
                        </p>
                        <img src={qrCode} alt="2FA QR Code" className="mx-auto mt-5 h-48 w-48 rounded-2xl bg-white p-3 shadow-sm" />
                        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-3 text-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Manual setup key</p>
                          <code className="mt-2 block break-all text-xs text-gray-700">{secret}</code>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
                    <div className="mt-5 space-y-5">
                      <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                        <div className="flex items-start gap-3">
                          <CheckCircleIcon className="mt-0.5 h-5 w-5 text-green-600" />
                          <div>
                            <p className="text-sm font-medium text-green-800">2FA is active on this account.</p>
                            <p className="mt-1 text-sm text-green-700">
                              You will be asked for a one-time code from your authenticator app during sign-in.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
