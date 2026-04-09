'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { fetcher, formatNumber } from '@/lib/utils';
import {
  UserGroupIcon,
  CheckCircleIcon,
  ClockIcon,
  MapPinIcon,
  ChartBarSquareIcon,
  ClipboardDocumentCheckIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';

interface StationData {
  id: string;
  psCode: string;
  name: string;
  status: string;
  agentId: string | null;
  totalRegistered: number;
  totalVoted: number;
  turnoutPercentage: number;
  results: { candidateName: string; party: string; votes: number }[];
}

interface CheckInData {
  station: { id: string; psCode: string; name: string } | null;
  checkInStatus: { type: string; timestamp: string; latitude: number | null; longitude: number | null } | null;
}

export default function AgentDashboard() {
  const { data: session } = useSession();
  const { data: stations, isLoading: stationsLoading } = useSWR<StationData[]>('/api/stations', fetcher, { refreshInterval: 30000 });
  const { data: checkInData, mutate: mutateCheckIn } = useSWR<CheckInData>('/api/agent/checkin', fetcher, { refreshInterval: 30000 });

  const [checkingIn, setCheckingIn] = useState(false);
  const [distanceWarning, setDistanceWarning] = useState<string | null>(null);

  const userId = (session?.user as { id?: string })?.id;
  const agentStation = (Array.isArray(stations) ? stations : []).find((s) => s.agentId === userId);

  const isCheckedIn = checkInData?.checkInStatus?.type === 'CHECK_IN';
  const checkInTime = checkInData?.checkInStatus?.timestamp
    ? new Date(checkInData.checkInStatus.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const handleCheckInOut = async () => {
    setCheckingIn(true);
    setDistanceWarning(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      }).catch(() => null);

      const body: Record<string, unknown> = { type: isCheckedIn ? 'CHECK_OUT' : 'CHECK_IN' };
      if (position) {
        body.latitude = position.coords.latitude;
        body.longitude = position.coords.longitude;
      }

      const res = await fetch('/api/agent/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.distanceWarning) setDistanceWarning(data.distanceWarning);
      mutateCheckIn();
    } catch (err) {
      console.error('Check-in error:', err);
    } finally {
      setCheckingIn(false);
    }
  };

  if (stationsLoading || !stations) {
    return (
      <div className="p-4 md:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="h-4 bg-gray-200 rounded w-48" />
          <div className="h-40 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!agentStation) {
    return (
      <div className="p-4 md:p-6">
        <Card className="text-center py-12">
          <MapPinIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-gray-900 mb-1">Welcome, {session?.user?.name}</h2>
          <p className="text-gray-500 text-sm">You have not been assigned to a polling station yet.</p>
          <p className="text-gray-400 text-sm mt-1">Contact your administrator for assignment.</p>
        </Card>
      </div>
    );
  }

  const turnoutPct = agentStation.turnoutPercentage;
  const statusLabel = agentStation.status === 'COMPLETED' ? 'Completed' : agentStation.status === 'ACTIVE' ? 'Active' : 'Pending';
  const statusVariant = agentStation.status === 'COMPLETED' ? 'success' : agentStation.status === 'ACTIVE' ? 'info' : 'warning';

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Page heading */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900">Agent Dashboard</h2>
        <p className="text-gray-500 text-sm mt-0.5">{agentStation.name} · <span className="font-mono">{agentStation.psCode}</span></p>
      </div>

      {/* Check-in Card */}
      <Card>
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center shrink-0 ${isCheckedIn ? 'bg-green-100' : 'bg-gray-100'}`}>
            <MapPinIcon className={`h-5 w-5 md:h-6 md:w-6 ${isCheckedIn ? 'text-green-600' : 'text-gray-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm md:text-base">{isCheckedIn ? 'Checked In' : 'Not Checked In'}</p>
            <p className="text-xs text-gray-500">
              {isCheckedIn && checkInTime ? `Since ${checkInTime}` : 'Tap to start monitoring'}
            </p>
          </div>
          <button
            onClick={handleCheckInOut}
            disabled={checkingIn}
            className={`px-4 md:px-6 py-2 md:py-2.5 rounded-lg font-semibold text-white text-sm transition-colors disabled:opacity-50 shrink-0 ${
              isCheckedIn ? 'bg-red-500 hover:bg-red-600 active:bg-red-700' : 'bg-green-600 hover:bg-green-700 active:bg-green-800'
            }`}
          >
            {checkingIn ? '...' : isCheckedIn ? 'Check Out' : 'Check In'}
          </button>
        </div>
        {distanceWarning && (
          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
            {distanceWarning}
          </div>
        )}
      </Card>

      {/* Stat cards — 3 across even on mobile (compact) */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card className="!p-3 md:!p-5">
          <div className="flex items-center gap-2 mb-1">
            <UserGroupIcon className="h-4 w-4 text-gray-400 shrink-0" />
            <p className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider truncate">Registered</p>
          </div>
          <p className="text-xl md:text-2xl font-bold text-gray-900">{formatNumber(agentStation.totalRegistered)}</p>
        </Card>
        <Card className="!p-3 md:!p-5">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleIcon className="h-4 w-4 text-green-500 shrink-0" />
            <p className="text-[10px] md:text-xs font-bold text-green-600 uppercase tracking-wider truncate">Voted</p>
          </div>
          <p className="text-xl md:text-2xl font-bold text-green-600">{formatNumber(agentStation.totalVoted)}</p>
          <p className="text-[10px] md:text-xs text-gray-500 mt-0.5">{turnoutPct}% turnout</p>
          {/* Mini progress bar */}
          <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.min(turnoutPct, 100)}%` }} />
          </div>
        </Card>
        <Card className="!p-3 md:!p-5">
          <div className="flex items-center gap-2 mb-1">
            <ClockIcon className="h-4 w-4 text-gray-400 shrink-0" />
            <p className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider truncate">Status</p>
          </div>
          <Badge variant={statusVariant} size="sm">{statusLabel}</Badge>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 gap-3">
          {/* Record Turnout */}
          <a href="/agent/turnout" className="block">
            <Card className="hover:border-green-300 active:bg-green-50 transition-colors !p-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
                  <ClipboardDocumentCheckIcon className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm">Record Voter Turnout</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Search voters and mark them as voted</p>
                </div>
                <Badge variant="info" size="sm">
                  {formatNumber(agentStation.totalVoted)}/{formatNumber(agentStation.totalRegistered)}
                </Badge>
              </div>
            </Card>
          </a>

          {/* Submit Results */}
          <a href="/agent/results" className="block">
            <Card className="hover:border-orange-300 active:bg-orange-50 transition-colors !p-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <ChartBarSquareIcon className="h-5 w-5 text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm">Submit Election Results</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Input vote counts per candidate</p>
                </div>
                <Badge variant={agentStation.status === 'COMPLETED' ? 'success' : 'warning'} size="sm">
                  {agentStation.status === 'COMPLETED' ? 'Done' : 'Pending'}
                </Badge>
              </div>
            </Card>
          </a>

          {/* Tally Photos */}
          <a href="/agent/tally-photos" className="block">
            <Card className="hover:border-purple-300 active:bg-purple-50 transition-colors !p-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
                  <PhotoIcon className="h-5 w-5 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm">Upload Tally Photos</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Photograph official tally sheets</p>
                </div>
                <Badge variant="neutral" size="sm">Docs</Badge>
              </div>
            </Card>
          </a>
        </div>
      </div>
    </div>
  );
}
