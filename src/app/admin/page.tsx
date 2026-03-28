'use client';

import { lazy, Suspense } from 'react';
import { usePollingData } from '@/hooks/usePolling';
import { DashboardStats } from '@/types';
import AdminHeader from '@/components/layout/AdminHeader';
import StatCard from '@/components/ui/StatCard';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ProgressBar from '@/components/ui/ProgressBar';
import {
  UserGroupIcon,
  CheckBadgeIcon,
  MapPinIcon,
  SignalIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { formatNumber } from '@/lib/utils';

interface AgentStatus {
  id: string;
  name: string;
  email: string;
  photo: string | null;
  stationId: string | null;
  stationCode: string | null;
  stationName: string | null;
  status: 'CHECKED_IN' | 'CHECKED_OUT' | 'NOT_CHECKED_IN';
  lastCheckIn: string | null;
  lastCheckOut: string | null;
  hasSubmittedResults: boolean;
}

function AgentStatusSection() {
  const { data: agents } = usePollingData<AgentStatus[]>('/api/stats/agents', 30000);

  if (!Array.isArray(agents) || agents.length === 0) return null;

  const checkedIn = agents.filter((a) => a.status === 'CHECKED_IN').length;
  const checkedOut = agents.filter((a) => a.status === 'CHECKED_OUT').length;
  const notCheckedIn = agents.filter((a) => a.status === 'NOT_CHECKED_IN').length;

  const statusVariant = (status: AgentStatus['status']) => {
    if (status === 'CHECKED_IN') return 'success' as const;
    if (status === 'CHECKED_OUT') return 'warning' as const;
    return 'neutral' as const;
  };

  const statusLabel = (status: AgentStatus['status']) => {
    if (status === 'CHECKED_IN') return 'Checked In';
    if (status === 'CHECKED_OUT') return 'Checked Out';
    return 'Not Checked In';
  };

  const initials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

  return (
    <Card padding={false}>
      <div className="p-6 pb-3 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Agent Status</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            <span className="text-green-700 font-medium">{checkedIn} checked in</span>
            {' · '}
            <span className="text-yellow-700 font-medium">{checkedOut} checked out</span>
            {' · '}
            <span className="text-gray-500">{notCheckedIn} not checked in</span>
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-2.5 px-6 text-xs font-semibold text-gray-500 uppercase">Agent</th>
              <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase">Station</th>
              <th className="text-center py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-center py-2.5 px-6 text-xs font-semibold text-gray-500 uppercase">Results</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-3 px-6">
                  <div className="flex items-center gap-3">
                    {agent.photo ? (
                      <img
                        src={agent.photo}
                        alt={agent.name}
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center shrink-0">
                        <span className="text-white text-xs font-medium">{initials(agent.name)}</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{agent.name}</p>
                      <p className="text-xs text-gray-400 truncate">{agent.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4">
                  {agent.stationCode ? (
                    <div>
                      <span className="font-mono text-xs text-gray-600">{agent.stationCode}</span>
                      <p className="text-xs text-gray-500 truncate max-w-[160px]">{agent.stationName}</p>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  <Badge variant={statusVariant(agent.status)} dot size="sm">
                    {statusLabel(agent.status)}
                  </Badge>
                </td>
                <td className="py-3 px-6 text-center">
                  {agent.hasSubmittedResults ? (
                    <CheckCircleIcon className="h-5 w-5 text-green-500 mx-auto" title="Results submitted" />
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const TurnoutHeatmap = lazy(() => import('@/components/ui/TurnoutHeatmap'));
const TurnoutChart = lazy(() => import('@/components/ui/TurnoutChart'));

interface SnapshotPoint {
  timestamp: string;
  totalVoted: number;
  totalRegistered: number;
  turnoutPercentage: number;
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = usePollingData<DashboardStats>('/api/stats');
  const { data: snapshots } = usePollingData<SnapshotPoint[]>('/api/snapshots', 60000);

  const handleExport = () => {
    window.open('/api/voters/export?format=xlsx', '_blank');
  };

  if (isLoading || !stats) {
    return (
      <div className="flex-1">
        <AdminHeader title="Constituency Overview" />
        <div className="p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-64" />
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <AdminHeader title="Constituency Overview" />

      <div className="p-6 space-y-6">
        {/* Title */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Effutu Statistics</h2>
          <p className="text-gray-500 text-sm mt-1">
            {stats.election ? `Real-time monitoring for ${stats.election.name}` : 'No active election selected'}
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Registered Voters"
            value={formatNumber(stats.totalRegisteredVoters)}
            icon={<UserGroupIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Total Turnout"
            value={formatNumber(stats.totalVoted)}
            subtitle={`${stats.turnoutPercentage}% voter participation`}
            icon={<CheckBadgeIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Stations Reporting"
            value={`${stats.stationsReporting} / ${stats.totalStations}`}
            progress={(stats.stationsReporting / Math.max(stats.totalStations, 1)) * 100}
            icon={<MapPinIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Status"
            value={stats.stationsCompleted === stats.totalStations ? 'COMPLETE' : 'LIVE'}
            subtitle={stats.election?.status === 'COMPLETED' ? 'Election completed' : 'Monitoring active'}
            icon={<SignalIcon className="h-6 w-6" />}
          />
        </div>

        {/* Vote Discrepancy Alerts */}
        {stats.discrepancies && stats.discrepancies.length > 0 && (
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Vote Discrepancy Alerts</h3>
                <p className="text-xs text-gray-500">{stats.discrepancies.length} issue{stats.discrepancies.length !== 1 ? 's' : ''} detected</p>
              </div>
            </div>
            <div className="space-y-3">
              {stats.discrepancies.map((d, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    d.severity === 'HIGH'
                      ? 'bg-red-50 border-red-200'
                      : d.severity === 'MEDIUM'
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <Badge
                    variant={d.severity === 'HIGH' ? 'danger' : d.severity === 'MEDIUM' ? 'warning' : 'info'}
                    size="sm"
                  >
                    {d.severity}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {d.stationName} <span className="text-gray-500 font-normal">({d.psCode})</span>
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">{d.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Agent Status Overview */}
        <AgentStatusSection />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Candidate Performance */}
          <Card>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Candidate Performance</h3>
              <a href="/admin/reports" className="text-sm text-primary-600 hover:underline">
                View detailed results
              </a>
            </div>
            <div className="space-y-6">
              {stats.candidateResults.map((candidate) => (
                <div key={candidate.candidateId}>
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: candidate.color }}
                    >
                      {candidate.party}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{candidate.candidateName}</p>
                      <p className="text-xs text-gray-500">{candidate.partyFull || candidate.party}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-gray-900">
                        {formatNumber(candidate.totalVotes)}
                      </p>
                      <p className="text-sm text-primary-600 font-medium">
                        {candidate.percentage}%
                      </p>
                    </div>
                  </div>
                  <ProgressBar
                    value={candidate.percentage}
                    color={`bg-[${candidate.color}]`}
                    height="h-2.5"
                  />
                </div>
              ))}
              {stats.candidateResults.length === 0 && (
                <p className="text-gray-500 text-center py-4">No results submitted yet</p>
              )}
            </div>
          </Card>

          {/* Geographic Distribution - Heatmap */}
          <Card>
            <Suspense fallback={<div className="h-80 bg-gray-100 rounded-lg animate-pulse" />}>
              <TurnoutHeatmap stations={stats.stations} />
            </Suspense>
          </Card>

        </div>

        {/* Turnout Trend */}
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Turnout Trend</h3>
          <Suspense fallback={<div className="h-[300px] bg-gray-100 rounded-lg animate-pulse" />}>
            <TurnoutChart data={Array.isArray(snapshots) ? snapshots : []} />
          </Suspense>
        </Card>

        {/* Polling Station Summary - Full Width */}
        <Card padding={false}>
            <div className="p-6 pb-3">
              <h3 className="text-lg font-semibold text-gray-900">Polling Station Summary</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">PS Code</th>
                    <th className="text-left py-3 px-2 text-xs font-semibold text-gray-500 uppercase">Name</th>
                    <th className="text-right py-3 px-2 text-xs font-semibold text-gray-500 uppercase">Registered</th>
                    <th className="text-right py-3 px-2 text-xs font-semibold text-gray-500 uppercase">Voted</th>
                    <th className="text-right py-3 px-2 text-xs font-semibold text-gray-500 uppercase">Turnout</th>
                    <th className="text-center py-3 px-2 text-xs font-semibold text-gray-500 uppercase">Result Type</th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.stations.slice(0, 10).map((station) => (
                    <tr key={station.psCode} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-6 font-mono text-xs">{station.psCode}</td>
                      <td className="py-3 px-2 text-gray-700">{station.name}</td>
                      <td className="py-3 px-2 text-right">{formatNumber(station.totalRegistered)}</td>
                      <td className="py-3 px-2 text-right">{formatNumber(station.totalVoted)}</td>
                      <td className="py-3 px-2 text-right font-medium">{station.turnoutPercentage}%</td>
                      <td className="py-3 px-2 text-center">
                        {station.resultType ? (
                          <Badge variant={station.resultType === 'FINAL' ? 'success' : 'warning'} size="sm">
                            {station.resultType}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-right">
                        <Badge
                          variant={
                            station.status === 'COMPLETED'
                              ? 'success'
                              : station.status === 'ACTIVE'
                              ? 'info'
                              : 'warning'
                          }
                          dot
                        >
                          {station.status === 'COMPLETED'
                            ? 'Verified'
                            : station.status === 'ACTIVE'
                            ? 'Active'
                            : 'Pending'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stats.stations.length > 10 && (
              <div className="p-4 text-center">
                <a href="/admin/stations" className="text-sm text-primary-600 hover:underline">
                  Showing {Math.min(10, stats.stations.length)} of {stats.stations.length} polling stations
                </a>
              </div>
            )}
        </Card>
      </div>
    </div>
  );
}
