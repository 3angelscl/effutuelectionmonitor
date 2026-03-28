'use client';

import { lazy, Suspense, useState, useCallback } from 'react';
import useSWR from 'swr';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ProgressBar from '@/components/ui/ProgressBar';
import { formatNumber } from '@/lib/utils';
import {
  ArrowPathIcon,
  SignalIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { DashboardStats } from '@/types';

const TurnoutHeatmap = lazy(() => import('@/components/ui/TurnoutHeatmap'));

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AgentViewerPage() {
  const { data: stats, isLoading, mutate } = useSWR<DashboardStats>('/api/stats', fetcher, {
    refreshInterval: 600000,
    revalidateOnFocus: true,
  });

  const [stationSearch, setStationSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await mutate();
    setLastRefreshed(new Date());
    setTimeout(() => setRefreshing(false), 500);
  }, [mutate]);

  const filteredStations = (stats?.stations || []).filter(
    (s) =>
      s.psCode.toLowerCase().includes(stationSearch.toLowerCase()) ||
      s.name.toLowerCase().includes(stationSearch.toLowerCase())
  );

  if (isLoading || !stats) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-12 bg-gray-200 rounded w-96" />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-gray-200 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
            <SignalIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {stats.election ? stats.election.name : 'Election'} — Live Feed
            </h2>
            <p className="text-sm text-gray-500">Real-time voter turnout and results</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success" dot>Live</Badge>
          <span className="text-xs text-gray-400">
            Last refreshed: {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-2">Total Turnout</p>
          <p className="text-3xl font-bold text-gray-900">{stats.turnoutPercentage}%</p>
          <p className="text-sm text-gray-500 mt-1">
            {formatNumber(stats.totalVoted)} / {formatNumber(stats.totalRegisteredVoters)} voters
          </p>
          <div className="mt-3"><ProgressBar value={stats.turnoutPercentage} /></div>
        </Card>
        <Card>
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-2">Stations Reported</p>
          <p className="text-3xl font-bold text-gray-900">{stats.stationsReporting} / {stats.totalStations}</p>
          <p className="text-sm text-gray-500 mt-1">
            {stats.totalStations > 0 ? ((stats.stationsReporting / stats.totalStations) * 100).toFixed(1) : 0}% completeness
          </p>
        </Card>
        <Card>
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-2">Valid Votes Cast</p>
          <p className="text-3xl font-bold text-gray-900">{formatNumber(stats.totalVoted)}</p>
          <p className="text-sm text-gray-500 mt-1">Across {stats.totalStations} polling stations</p>
        </Card>
      </div>

      {/* Geographic Heatmap */}
      <Card>
        <Suspense fallback={<div className="h-80 bg-gray-100 rounded-lg animate-pulse" />}>
          <TurnoutHeatmap stations={stats.stations} />
        </Suspense>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Candidate Results */}
        <Card>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Candidate Results</h3>
            <Badge variant={stats.overallResultType === 'FINAL' ? 'success' : 'warning'}>
              {stats.overallResultType === 'FINAL' ? 'FINAL RESULTS' : 'PROVISIONAL'}
            </Badge>
          </div>
          <div className="space-y-6">
            {stats.candidateResults.map((candidate) => (
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
                    style={{ width: `${candidate.percentage}%`, backgroundColor: candidate.color }}
                  />
                </div>
              </div>
            ))}
            {stats.candidateResults.length === 0 && (
              <p className="text-gray-500 text-center py-8">No results submitted yet.</p>
            )}
          </div>
        </Card>

        {/* Polling Station Explorer */}
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
                    <div className="flex-1"><ProgressBar value={station.turnoutPercentage} height="h-1.5" /></div>
                  </div>
                  {station.resultType && (
                    <Badge variant={station.resultType === 'FINAL' ? 'success' : 'warning'} size="sm">
                      {station.resultType}
                    </Badge>
                  )}
                  <Badge variant={station.status === 'COMPLETED' ? 'success' : station.status === 'ACTIVE' ? 'info' : 'warning'}>
                    {station.status === 'COMPLETED' ? 'REPORTED' : station.status === 'ACTIVE' ? 'IN PROGRESS' : 'PENDING'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
