'use client';

import { usePollingData } from '@/hooks/usePolling';
import { DashboardStats } from '@/types';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ProgressBar from '@/components/ui/ProgressBar';
import { formatNumber } from '@/lib/utils';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';


interface Discrepancy {
  stationId: string;
  stationCode: string;
  stationName: string;
  registeredVoters: number;
  totalVotes: number;
  voterTurnout: number;
  flags: ('OVERVOTE' | 'RESULT_TURNOUT_MISMATCH')[];
}

function DiscrepancySection() {
  const { data: discrepancies, isLoading } = usePollingData<Discrepancy[]>(
    '/api/results/discrepancies',
    60000
  );

  if (isLoading || discrepancies === undefined) {
    return (
      <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />
    );
  }

  const items = Array.isArray(discrepancies) ? discrepancies : [];

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 px-5 py-4 bg-green-50 border border-green-200 rounded-xl">
        <CheckCircleIcon className="h-5 w-5 text-green-600 shrink-0" />
        <p className="text-sm font-medium text-green-800">No discrepancies detected</p>
      </div>
    );
  }

  return (
    <Card padding={false}>
      <div className="p-6 pb-3 flex items-center gap-3">
        <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
          <ExclamationTriangleIcon className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Discrepancies</h3>
          <p className="text-xs text-gray-500">
            {items.length} station{items.length !== 1 ? 's' : ''} with data issues
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Station</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Registered</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Votes Cast</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Turnout</th>
              <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Flags</th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.stationId} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-3 px-6">
                  <p className="font-mono text-xs text-gray-500">{d.stationCode}</p>
                  <p className="text-gray-900">{d.stationName}</p>
                </td>
                <td className="py-3 px-4 text-right tabular-nums">{formatNumber(d.registeredVoters)}</td>
                <td className="py-3 px-4 text-right tabular-nums font-medium">
                  <span className={d.flags.includes('OVERVOTE') ? 'text-red-600' : ''}>
                    {formatNumber(d.totalVotes)}
                  </span>
                </td>
                <td className="py-3 px-4 text-right tabular-nums">{formatNumber(d.voterTurnout)}</td>
                <td className="py-3 px-6">
                  <div className="flex flex-wrap gap-1.5">
                    {d.flags.includes('OVERVOTE') && (
                      <Badge variant="danger" size="sm">OVERVOTE</Badge>
                    )}
                    {d.flags.includes('RESULT_TURNOUT_MISMATCH') && (
                      <Badge variant="warning" size="sm">RESULT/TURNOUT MISMATCH</Badge>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function ElectionResultsPage() {
  const { data: stats, isLoading } = usePollingData<DashboardStats>('/api/stats');

  if (isLoading || !stats) {
    return (
      <div className="flex-1">
        <AdminHeader title="Election Results" />
        <div className="p-4 md:p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-64" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
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
      <AdminHeader title="Election Results" />

      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Discrepancy detection */}
        <DiscrepancySection />

        <div>
          <h2 className="text-xl font-bold text-gray-900">Results Summary</h2>
          <p className="text-sm text-gray-500 mt-1">
            {stats.stationsCompleted} of {stats.totalStations} stations have reported results
          </p>
        </div>

        {/* Overall Candidate Results */}
        <Card>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Overall Results</h3>
            <Badge variant={stats.overallResultType === 'FINAL' ? 'success' : 'warning'}>
              {stats.overallResultType === 'FINAL' ? 'FINAL RESULTS' : 'PROVISIONAL'}
            </Badge>
          </div>
          <div className="space-y-6">
            {stats.candidateResults.map((candidate) => (
              <div key={candidate.candidateId}>
                <div className="flex items-center gap-3 mb-2">
                  {candidate.photo ? (
                    <img
                      src={candidate.photo}
                      alt={candidate.candidateName}
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                      style={{ boxShadow: `0 0 0 2px ${candidate.color}` }}
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: candidate.color }}
                    >
                      {candidate.party}
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{candidate.candidateName}</p>
                    <p className="text-xs text-gray-500">{candidate.partyFull || candidate.party}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">{formatNumber(candidate.totalVotes)}</p>
                    <p className="text-sm font-medium" style={{ color: candidate.color }}>
                      {candidate.percentage}%
                    </p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="h-3 rounded-full transition-all duration-500"
                    style={{
                      width: `${candidate.percentage}%`,
                      backgroundColor: candidate.color,
                    }}
                  />
                </div>
              </div>
            ))}
            {stats.candidateResults.length === 0 && (
              <p className="text-gray-500 text-center py-8">No results submitted yet</p>
            )}
          </div>
        </Card>

        {/* Station-by-station Results Table */}
        <Card padding={false}>
          <div className="p-6 pb-3">
            <h3 className="text-lg font-semibold text-gray-900">Results by Polling Station</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">PS Code</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Name</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Registered</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Voted</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Turnout</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Result Type</th>
                  <th className="text-center py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.stations.map((station) => (
                  <tr key={station.psCode} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-6 font-mono text-xs">{station.psCode}</td>
                    <td className="py-3 px-4 text-gray-700">{station.name}</td>
                    <td className="py-3 px-4 text-right">{formatNumber(station.totalRegistered)}</td>
                    <td className="py-3 px-4 text-right">{formatNumber(station.totalVoted)}</td>
                    <td className="py-3 px-4 text-right font-medium">{station.turnoutPercentage}%</td>
                    <td className="py-3 px-4 text-center">
                      {station.resultType ? (
                        <Badge variant={station.resultType === 'FINAL' ? 'success' : 'warning'} size="sm">
                          {station.resultType}
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-6 text-center">
                      <Badge
                        variant={
                          station.status === 'COMPLETED' ? 'success' :
                          station.status === 'ACTIVE' ? 'info' : 'warning'
                        }
                        dot
                      >
                        {station.status === 'COMPLETED' ? 'Verified' :
                         station.status === 'ACTIVE' ? 'Active' : 'Pending'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
