'use client';

import { lazy, Suspense, useCallback, useState } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ProgressBar from '@/components/ui/ProgressBar';
import TurnoutChart from '@/components/ui/TurnoutChart';
import CandidateComparisonStack from '@/components/ui/CandidateComparisonStack';
import { fetcher, formatNumber } from '@/lib/utils';
import {
  ArrowPathIcon,
  SignalIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { DashboardStats } from '@/types';

const TurnoutHeatmap = lazy(() => import('@/components/ui/TurnoutHeatmap'));

interface TrendPoint {
  timestamp: string;
  totalVoted: number;
  totalRegistered: number;
  turnoutPercentage: number;
}

interface ElectionComparison {
  id: string;
  name: string;
  date: string | null;
  status: string;
  isActive: boolean;
  totalRegistered: number;
  totalVoted: number;
  turnoutPercentage: number;
  stationsReporting: number;
  candidateCount: number;
}

interface LiveDashboardStats {
  totalRegisteredVoters: number;
  totalVoted: number;
  totalValidVotes: number;
  turnoutPercentage: number;
  totalStations: number;
  stationsReporting: number;
  stationsCompleted: number;
  stations: DashboardStats['stations'];
  election: DashboardStats['election'];
}

export default function AdminViewerPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role;
  const canSeeDiscrepancies = userRole && userRole !== 'VIEWER';

  const { data: liveStats, isLoading, mutate: mutateLiveStats } = useSWR<LiveDashboardStats>(
    '/api/stats/live-summary',
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
    }
  );

  const { data: stats, mutate: mutateDetailedStats } = useSWR<DashboardStats>('/api/stats', fetcher, {
    revalidateOnFocus: true,
  });

  const { data: trendData, mutate: mutateTrendData } = useSWR<TrendPoint[]>('/api/snapshots?hours=24', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: false,
  });

  const { data: compareData } = useSWR<{ elections: ElectionComparison[] }>('/api/elections/compare', fetcher);

  const [stationSearch, setStationSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'compare'>('overview');

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([mutateLiveStats(), mutateDetailedStats(), mutateTrendData()]);
    setLastRefreshed(new Date());
    setTimeout(() => setRefreshing(false), 500);
  }, [mutateDetailedStats, mutateLiveStats, mutateTrendData]);

  const filteredStations = (liveStats?.stations || []).filter(
    (station) =>
      station.psCode.toLowerCase().includes(stationSearch.toLowerCase()) ||
      station.name.toLowerCase().includes(stationSearch.toLowerCase())
  );

  if (isLoading || !liveStats) {
    return (
      <div className="flex-1">
        <AdminHeader title="Live Viewer" />
        <div className="p-4 md:p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-12 bg-gray-200 rounded w-full max-w-sm" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-gray-200 rounded-xl" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const discrepancies = stats?.discrepancies || [];
  const highDiscrepancies = discrepancies.filter((d) => d.severity === 'HIGH');
  const mediumDiscrepancies = discrepancies.filter((d) => d.severity === 'MEDIUM');
  const electionName = (liveStats.election || stats?.election)?.name || 'Election';

  return (
    <div className="flex-1">
      <AdminHeader title="Live Viewer" />

      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center shrink-0">
              <SignalIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-gray-900">{electionName} - Live Feed</h2>
              <p className="text-sm text-gray-500 hidden sm:block">
                Real-time voter turnout and results aggregation dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <Badge variant="success" dot>Live</Badge>
            <span className="text-xs text-gray-400 hidden md:inline">
              Last refreshed: {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <ArrowPathIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {canSeeDiscrepancies && discrepancies.length > 0 && (
          <div className={`rounded-xl border p-4 ${highDiscrepancies.length > 0 ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className={`h-5 w-5 mt-0.5 ${highDiscrepancies.length > 0 ? 'text-red-600' : 'text-yellow-600'}`} />
              <div className="flex-1">
                <h3 className={`font-semibold text-sm ${highDiscrepancies.length > 0 ? 'text-red-800' : 'text-yellow-800'}`}>
                  Vote Discrepancy Alerts ({discrepancies.length})
                </h3>
                <p className="text-xs text-gray-600 mt-1 mb-3">
                  {highDiscrepancies.length > 0 && `${highDiscrepancies.length} HIGH severity`}
                  {highDiscrepancies.length > 0 && mediumDiscrepancies.length > 0 && ' · '}
                  {mediumDiscrepancies.length > 0 && `${mediumDiscrepancies.length} MEDIUM severity`}
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {discrepancies.map((discrepancy, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <Badge
                        variant={discrepancy.severity === 'HIGH' ? 'danger' : 'warning'}
                        size="sm"
                      >
                        {discrepancy.severity}
                      </Badge>
                      <span className="font-mono text-gray-600">{discrepancy.psCode}</span>
                      <span className="text-gray-700">{discrepancy.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto -mx-1">
          <div className="flex bg-gray-100 rounded-lg p-1 w-fit min-w-full sm:min-w-0">
            {[
              { key: 'overview' as const, label: 'Overview' },
              { key: 'trends' as const, label: 'Turnout Trends' },
              { key: 'compare' as const, label: 'Compare Elections' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-2">Total Turnout</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-gray-900">{liveStats.turnoutPercentage}%</p>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {formatNumber(liveStats.totalVoted)} / {formatNumber(liveStats.totalRegisteredVoters)} voters
            </p>
            <div className="mt-3">
              <ProgressBar value={liveStats.turnoutPercentage} />
            </div>
          </Card>
          <Card>
            <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-2">Stations Reported</p>
            <p className="text-3xl font-bold text-gray-900">
              {liveStats.stationsReporting} / {liveStats.totalStations}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {liveStats.totalStations > 0
                ? ((liveStats.stationsReporting / liveStats.totalStations) * 100).toFixed(1)
                : 0}% data completeness
            </p>
          </Card>
          <Card>
            <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-2">Valid Votes Cast</p>
            <p className="text-3xl font-bold text-gray-900">{formatNumber(liveStats.totalValidVotes)}</p>
            <p className="text-sm text-gray-500 mt-1">
              Across {liveStats.stationsCompleted} reporting station{liveStats.stationsCompleted !== 1 ? 's' : ''}
            </p>
          </Card>
        </div>

        {activeTab === 'overview' && (
          <>
            <Card>
              <CandidateComparisonStack
                candidate1={stats?.favCandidate1 || null}
                candidate2={stats?.favCandidate2 || null}
                totalVotes={stats?.totalValidVotes || liveStats.totalValidVotes}
              />
            </Card>

            <Card>
              <ErrorBoundary fallback={<div className="h-80 flex items-center justify-center text-sm text-gray-400">Failed to load heatmap</div>}>
                <Suspense fallback={<div className="h-80 bg-gray-100 rounded-lg animate-pulse" />}>
                  <TurnoutHeatmap stations={liveStats.stations} />
                </Suspense>
              </ErrorBoundary>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Candidate Results</h3>
                  <Badge variant={stats?.overallResultType === 'FINAL' ? 'success' : 'warning'}>
                    {stats?.overallResultType === 'FINAL' ? 'FINAL RESULTS' : 'PROVISIONAL'}
                  </Badge>
                </div>
                <div className="space-y-6">
                  {stats?.candidateResults.map((candidate) => (
                    <div key={candidate.candidateId}>
                      <div className="flex items-baseline justify-between mb-1">
                        <div>
                          <p className="font-bold text-gray-900">{candidate.candidateName}</p>
                          <p className="text-xs text-gray-500">{candidate.partyFull || candidate.party}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold" style={{ color: candidate.color }}>
                            {formatNumber(candidate.totalVotes)}
                          </p>
                          <p className="text-sm text-gray-500">{candidate.percentage}%</p>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className="h-2.5 rounded-full transition-all duration-500"
                          style={{
                            width: `${candidate.percentage}%`,
                            backgroundColor: candidate.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {!stats && (
                    <div className="space-y-4">
                      {[...Array(3)].map((_, index) => (
                        <div key={index} className="animate-pulse space-y-2">
                          <div className="h-4 w-32 bg-gray-200 rounded" />
                          <div className="h-2.5 w-full bg-gray-200 rounded-full" />
                        </div>
                      ))}
                    </div>
                  )}
                  {stats && stats.candidateResults.length === 0 && (
                    <p className="text-gray-500 text-center py-8">No results submitted yet.</p>
                  )}
                </div>
              </Card>

              <Card padding={false}>
                <div className="p-6 pb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Polling Station Explorer</h3>
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search PS Code or Name..."
                      value={stationSearch}
                      onChange={(e) => setStationSearch(e.target.value)}
                      className="pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                </div>

                <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                  {filteredStations.map((station) => (
                    <div key={station.psCode} className="px-6 py-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <Badge variant="info" size="sm">{station.psCode}</Badge>
                          <p className="font-semibold text-gray-900 mt-1">{station.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-900">
                            {formatNumber(station.totalVoted)} / {formatNumber(station.totalRegistered)}
                          </p>
                          <p className="text-xs text-gray-500">Votes Cast</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 mr-4">
                          <span className="text-xs text-gray-500">Turnout: {station.turnoutPercentage}%</span>
                          <div className="flex-1">
                            <ProgressBar value={station.turnoutPercentage} height="h-1.5" />
                          </div>
                        </div>
                        {station.resultType && (
                          <Badge variant={station.resultType === 'FINAL' ? 'success' : 'warning'} size="sm">
                            {station.resultType}
                          </Badge>
                        )}
                        <Badge
                          variant={
                            station.status === 'COMPLETED' ? 'success' :
                            station.status === 'ACTIVE' ? 'info' : 'warning'
                          }
                        >
                          {station.status === 'COMPLETED' ? 'REPORTED' :
                           station.status === 'ACTIVE' ? 'IN PROGRESS' : 'PENDING'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}

        {activeTab === 'trends' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <ChartBarIcon className="h-5 w-5 text-primary-600" />
              <h3 className="text-lg font-semibold text-gray-900">Turnout Trend Over Time</h3>
            </div>

            <Card>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">Turnout percentage tracked over the last 24 hours</p>
                <Badge variant="info" size="sm">Last 24h</Badge>
              </div>
              <TurnoutChart data={trendData || []} />
              {(!trendData || trendData.length === 0) && (
                <p className="text-xs text-gray-400 mt-4 text-center">
                  Trend data is recorded via periodic snapshots. Use the &quot;Take Snapshot&quot; button on the dashboard or set up automated snapshot recording.
                </p>
              )}
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-gray-900">Record Snapshot</h4>
                  <p className="text-xs text-gray-500 mt-1">
                    Manually record a turnout snapshot for trend tracking
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await fetch('/api/snapshots', { method: 'POST' });
                    await mutateTrendData();
                  }}
                  className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Take Snapshot Now
                </button>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'compare' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <ChartBarIcon className="h-5 w-5 text-primary-600" />
              <h3 className="text-lg font-semibold text-gray-900">Comparative Analytics</h3>
            </div>

            {!compareData || compareData.elections.length < 2 ? (
              <Card>
                <p className="text-gray-500 text-center py-8">
                  At least 2 elections are needed for comparison. Create more elections to use this feature.
                </p>
              </Card>
            ) : (
              <>
                <Card padding={false}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Election</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Registered</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Voted</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Turnout</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Stations Reporting</th>
                          <th className="text-right py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Candidates</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compareData.elections.map((election) => (
                          <tr key={election.id} className={`border-b border-gray-50 hover:bg-gray-50 ${election.isActive ? 'bg-primary-50/30' : ''}`}>
                            <td className="py-3 px-6">
                              <div>
                                <p className="font-semibold text-gray-900">{election.name}</p>
                                {election.date && (
                                  <p className="text-xs text-gray-400">
                                    {new Date(election.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant={
                                election.isActive ? 'success' :
                                election.status === 'COMPLETED' ? 'info' : 'neutral'
                              }>
                                {election.isActive ? 'ACTIVE' : election.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-gray-700">
                              {formatNumber(election.totalRegistered)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-gray-700">
                              {formatNumber(election.totalVoted)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="font-bold text-primary-600">{election.turnoutPercentage}%</span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-gray-700">
                              {election.stationsReporting}
                            </td>
                            <td className="py-3 px-6 text-right font-mono text-gray-700">
                              {election.candidateCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card>
                  <h4 className="font-semibold text-gray-900 mb-4">Turnout Comparison</h4>
                  <div className="space-y-3">
                    {compareData.elections.map((election) => (
                      <div key={election.id} className="flex items-center gap-4">
                        <div className="w-40 text-sm text-gray-700 font-medium truncate">{election.name}</div>
                        <div className="flex-1">
                          <div className="w-full bg-gray-200 rounded-full h-6 relative">
                            <div
                              className={`h-6 rounded-full transition-all duration-500 flex items-center justify-end pr-2 ${
                                election.isActive ? 'bg-primary-600' : 'bg-gray-400'
                              }`}
                              style={{ width: `${Math.min(100, election.turnoutPercentage)}%` }}
                            >
                              <span className="text-xs font-bold text-white">
                                {election.turnoutPercentage}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
