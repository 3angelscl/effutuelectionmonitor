'use client';

import { Suspense, useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ShieldCheckIcon,
  UserIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  CheckBadgeIcon,
  ArrowRightIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';
import ParticlesOverlay from '@/components/ui/ParticlesOverlay';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const message = searchParams.get('message');
    if (message === 'loggedout') {
      setNotice('You have been logged out because your account was signed in on another device.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        totp: totpCode || '',
        redirect: false,
      });

      if (result?.error) {
        if (result.error.includes('2FA_REQUIRED')) {
          setNeeds2FA(true);
          setError('');
          setLoading(false);
          return;
        }
        setError(result.error.includes('2FA') ? 'Invalid 2FA code' : 'Invalid email or password');
      } else {
        const res = await fetch('/api/auth/session');
        const session = await res.json();
        const role = session?.user?.role;

        if (role === 'AGENT') {
          router.push('/agent');
        } else if (role === 'VIEWER') {
          router.push('/admin/viewer');
        } else {
          router.push('/admin');
        }
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-8 relative z-10">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Login</h2>
      <p className="text-gray-500 text-sm mb-8">
        Effutu Dream Election Monitoring Portal
      </p>

      {notice && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm flex items-start gap-2">
          <SignalIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email */}
        <div>
          <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
            Email 
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <UserIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your credentials"
              className="block w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:bg-white focus:outline-none transition-colors"
              required
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <LockClosedIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="block w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-10 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:bg-white focus:outline-none transition-colors"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              {showPassword ? (
                <EyeSlashIcon className="h-5 w-5" />
              ) : (
                <EyeIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Remember + Forgot */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-600">Remember me</span>
          </label>
          <a href="/forgot-password" className="text-sm font-medium text-primary-600 hover:text-primary-700">
            Forgot Password?
          </a>
        </div>

        {/* 2FA Code */}
        {needs2FA && (
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Two-Factor Authentication Code
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <ShieldCheckIcon className="h-5 w-5 text-primary-500" />
              </div>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit code"
                className="block w-full rounded-lg border border-primary-200 bg-primary-50/30 pl-10 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:bg-white focus:outline-none transition-colors text-center tracking-[0.5em] font-mono text-lg"
                maxLength={6}
                autoFocus
                required
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Enter the code from your authenticator app</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-lg hover:bg-primary-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <>
              Sign In
              <ArrowRightIcon className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="my-6 border-t border-gray-200" />

      {/* Security Notice */}
      <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-4">
        <CheckBadgeIcon className="h-5 w-5 text-primary-600 mt-0.5 shrink-0" />
        <p className="text-xs text-gray-600 leading-relaxed">
          This is a secure system. All activities are logged and monitored.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative">
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/uploads/happy-women.jpg')" }}
      />
      <ParticlesOverlay />
      <div className="absolute inset-0 z-[2] bg-[#2D355C]/70" />

      {/* Suspense Boundary for useSearchParams */}
      <Suspense fallback={<div className="w-full max-w-md h-96 bg-white/50 animate-pulse rounded-xl" />}>
        <LoginForm />
      </Suspense>

      {/* Footer */}
      <div className="mt-6 flex items-center gap-6 text-xs text-white/80 relative z-10">
        <span>&copy; 2026. Powered by Conadu Solutions</span>
      </div>
    </div>
  );
}

