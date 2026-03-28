'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import Card from '@/components/ui/Card';
import StatCard from '@/components/ui/StatCard';
import Badge from '@/components/ui/Badge';
import { formatNumber } from '@/lib/utils';
import {
  UserGroupIcon,
  CheckCircleIcon,
  ClockIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
  const { data: stations } = useSWR<StationData[]>('/api/stations', fetcher, { refreshInterval: 30000 });
  const { data: checkInData, mutate: mutateCheckIn } = useSWR<CheckInData>('/api/agent/checkin', fetcher, { refreshInterval: 30000 });

  const [checkingIn, setCheckingIn] = useState(false);
  const [distanceWarning, setDistanceWarning] = useState<string | null>(null);

  const userId = (session?.user as { id?: string })?.id;
  const agentStation = (stations || []).find((s) => s.agentId === userId);

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

  if (!agentStation) {
    return (
      <div className="p-6">
        <Card className="text-center py-12">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Welcome, {session?.user?.name}</h2>
          <p className="text-gray-500">You have not been assigned to a polling station yet.</p>
          <p className="text-gray-500 text-sm mt-1">Contact your administrator for station assignment.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Agent Dashboard</h2>
        <p className="text-gray-500 text-sm mt-1">
          {agentStation.name} ({agentStation.psCode})
        </p>
      </div>

      {/* Check-in Card */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isCheckedIn ? 'bg-green-100' : 'bg-gray-100'}`}>
              <MapPinIcon className={`h-6 w-6 ${isCheckedIn ? 'text-green-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{isCheckedIn ? 'Checked In' : 'Not Checked In'}</p>
              <p className="text-xs text-gray-500">
                {isCheckedIn && checkInTime ? `Since ${checkInTime}` : 'Check in to start monitoring'}
              </p>
            </div>
          </div>
          <button
            onClick={handleCheckInOut}
            disabled={checkingIn}
            className={`px-6 py-2.5 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 ${
              isCheckedIn ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {checkingIn ? 'Processing...' : isCheckedIn ? 'Check Out' : 'Check In'}
          </button>
        </div>
        {distanceWarning && (
          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
            {distanceWarning}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Registered Voters"
          value={formatNumber(agentStation.totalRegistered)}
          icon={<UserGroupIcon className="h-6 w-6" />}
        />
        <StatCard
          label="Voted"
          value={`${formatNumber(agentStation.totalVoted)} / ${formatNumber(agentStation.totalRegistered)}`}
          subtitle={`${agentStation.turnoutPercentage}% turnout`}
          progress={agentStation.turnoutPercentage}
          icon={<CheckCircleIcon className="h-6 w-6" />}
        />
        <StatCard
          label="Station Status"
          value={agentStation.status === 'COMPLETED' ? 'Completed' : agentStation.status === 'ACTIVE' ? 'Active' : 'Pending'}
          icon={<ClockIcon className="h-6 w-6" />}
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="hover:border-green-300 transition-colors cursor-pointer">
          <a href="/agent/turnout" className="block">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Record Voter Turnout</h3>
            <p className="text-sm text-gray-500">Search voters and mark them as Voted or Not Voted</p>
            <div className="mt-4">
              <Badge variant="info">
                {formatNumber(agentStation.totalVoted)} of {formatNumber(agentStation.totalRegistered)} recorded
              </Badge>
            </div>
          </a>
        </Card>
        <Card className="hover:border-green-300 transition-colors cursor-pointer">
          <a href="/agent/results" className="block">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Submit Election Results</h3>
            <p className="text-sm text-gray-500">Input vote counts per candidate after polls close</p>
            <div className="mt-4">
              <Badge variant={agentStation.status === 'COMPLETED' ? 'success' : 'warning'}>
                {agentStation.status === 'COMPLETED' ? 'Results Submitted' : 'Awaiting Submission'}
              </Badge>
            </div>
          </a>
        </Card>
      </div>
    </div>
  );
}
