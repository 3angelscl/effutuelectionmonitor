'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ProgressBar from '@/components/ui/ProgressBar';
import { formatNumber } from '@/lib/utils';
import {
  UserIcon,
  PhoneIcon,
  ClockIcon,
  CheckBadgeIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface StationDetail {
  station: {
    id: string;
    psCode: string;
    name: string;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  agent: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    photo: string | null;
  } | null;
  stats: {
    totalRegistered: number;
    totalVoted: number;
    turnoutPercentage: number;
    lastActivity: string | null;
    resultsStatus: string;
    resultType: string | null;
  };
  voters: {
    id: string;
    voterId: string;
    firstName: string;
    lastName: string;
    age: number;
    photo: string | null;
    hasVoted: boolean;
  }[];
  totalVoters: number;
  voterPage: number;
  voterTotalPages: number;
  results: {
    candidateId: string;
    candidateName: string;
    party: string;
    partyFull: string | null;
    color: string | null;
    votes: number;
    percentage: number;
  }[];
  totalVotes: number;
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} mins ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} hrs ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays} days ago`;
}

export default function StationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [voterPage, setVoterPage] = useState(1);
  const [voterSearch, setVoterSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [jumpPage, setJumpPage] = useState('');

  // Debounce search — only update URL after 350ms of inactivity
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(voterSearch);
      setVoterPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [voterSearch]);

  const { data, isLoading, isValidating } = useSWR<StationDetail>(
    `/api/stations/${id}?page=${voterPage}&limit=20&search=${encodeURIComponent(debouncedSearch)}`,
    fetcher,
    { refreshInterval: 30000, keepPreviousData: true }
  );

  if (!data) {
    return (
      <div className="flex-1">
        <AdminHeader title="Polling Stations" />
        <div className="p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-28 bg-gray-200 rounded-xl" />
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-gray-200 rounded-xl" />)}
            </div>
            <div className="h-96 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const { station, agent, stats, voters, totalVoters, voterTotalPages, results, totalVotes } = data;
  const isActive = stats.totalVoted > 0 || results.length > 0;

  return (
    <div className="flex-1">
      <AdminHeader title="Polling Stations" />

      <div className="p-6 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm">
          <a href="/admin" className="text-gray-500 hover:text-primary-600">Dashboard</a>
          <span className="text-gray-300">&gt;</span>
          <a href="/admin/stations" className="text-gray-500 hover:text-primary-600">Polling Stations</a>
          <span className="text-gray-300">&gt;</span>
          <span className="text-gray-900 font-medium">{station.name}</span>
        </nav>

        {/* Station Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {station.name} ({station.psCode})
              </h1>
              <Badge variant={isActive ? 'success' : 'warning'} dot>
                {isActive ? 'Active' : 'Pending'}
              </Badge>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <UserIcon className="h-4 w-4" />
                {formatNumber(stats.totalRegistered)} Total Voters
              </span>
              {agent && (
                <span>
                  Assigned Agent: <span className="font-semibold text-gray-700">{agent.name}</span>
                </span>
              )}
            </div>
          </div>

        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Current Turnout */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-primary-600 uppercase tracking-wider">Current Turnout</p>
              <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                <CheckBadgeIcon className="h-5 w-5 text-primary-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.turnoutPercentage}%</p>
            <p className="text-sm text-gray-500 mt-1">
              {formatNumber(stats.totalVoted)} / {formatNumber(stats.totalRegistered)} voters
            </p>
            <div className="mt-3">
              <ProgressBar value={stats.turnoutPercentage} />
            </div>
          </Card>

          {/* Last Activity */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-orange-600 uppercase tracking-wider">Last Activity</p>
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                <ClockIcon className="h-5 w-5 text-orange-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {stats.lastActivity ? getTimeAgo(stats.lastActivity) : 'No activity'}
            </p>
            {stats.lastActivity && (
              <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                System sync successful
              </p>
            )}
          </Card>

          {/* Results Status */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-primary-600 uppercase tracking-wider">Results Status</p>
              <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                <CheckBadgeIcon className="h-5 w-5 text-primary-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {stats.resultsStatus === 'SUBMITTED' ? 'Submitted' : 'Pending'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {stats.resultsStatus === 'SUBMITTED'
                ? `${results.length} candidates tallied`
                : 'Awaiting official count closure'}
            </p>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Voter Registry - 2 cols */}
          <Card padding={false} className="lg:col-span-2">
            <div className="p-6 pb-4">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Voter Registry</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Showing recent registrations and status</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search voters..."
                      value={voterSearch}
                      onChange={(e) => setVoterSearch(e.target.value)}
                      className="pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                  <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                    <FunnelIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto relative">
              {isValidating && data && (
                <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center pointer-events-none">
                  <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-gray-200">
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Voter ID</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Name</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Age</th>
                    <th className="text-center py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {voters.map((v) => (
                    <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3.5 px-6 font-mono text-xs text-gray-600">{v.voterId}</td>
                      <td className="py-3.5 px-4 font-medium text-gray-900">{v.firstName} {v.lastName}</td>
                      <td className="py-3.5 px-4 text-center text-gray-600">{v.age}</td>
                      <td className="py-3.5 px-6 text-center">
                        <Badge variant={v.hasVoted ? 'success' : 'neutral'} size="sm">
                          {v.hasVoted ? 'Voted' : 'Not Voted'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {voters.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-gray-400">
                        {voterSearch ? 'No voters match your search' : 'No voters registered'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {voterTotalPages > 1 && (
              <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100">
                <p className="text-xs text-primary-600 font-medium">
                  Showing {(voterPage - 1) * 20 + 1}–{Math.min(voterPage * 20, totalVoters)} of {formatNumber(totalVoters)} voters
                </p>
                <div className="flex items-center gap-1 flex-wrap">
                  {/* First */}
                  <button
                    onClick={() => setVoterPage(1)}
                    disabled={voterPage === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                    title="First page"
                  >
                    «
                  </button>
                  {/* Prev */}
                  <button
                    onClick={() => setVoterPage(Math.max(1, voterPage - 1))}
                    disabled={voterPage === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                  >
                    ‹
                  </button>

                  {/* Page numbers — sliding window of 5 */}
                  {(() => {
                    const window = 2;
                    const start = Math.max(1, Math.min(voterPage - window, voterTotalPages - window * 2));
                    const end = Math.min(voterTotalPages, start + window * 2);
                    const pages = [];
                    if (start > 1) pages.push(<span key="s-ellipsis" className="px-1 text-gray-400 text-xs">…</span>);
                    for (let p = start; p <= end; p++) {
                      pages.push(
                        <button
                          key={p}
                          onClick={() => setVoterPage(p)}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                            voterPage === p ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    }
                    if (end < voterTotalPages) pages.push(<span key="e-ellipsis" className="px-1 text-gray-400 text-xs">…</span>);
                    return pages;
                  })()}

                  {/* Next */}
                  <button
                    onClick={() => setVoterPage(Math.min(voterTotalPages, voterPage + 1))}
                    disabled={voterPage === voterTotalPages}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                  >
                    ›
                  </button>
                  {/* Last */}
                  <button
                    onClick={() => setVoterPage(voterTotalPages)}
                    disabled={voterPage === voterTotalPages}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                    title="Last page"
                  >
                    »
                  </button>

                  {/* Jump to page */}
                  <span className="ml-3 text-xs text-gray-400">Go to</span>
                  <input
                    type="number"
                    min={1}
                    max={voterTotalPages}
                    value={jumpPage}
                    onChange={(e) => setJumpPage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const p = parseInt(jumpPage, 10);
                        if (!isNaN(p) && p >= 1 && p <= voterTotalPages) {
                          setVoterPage(p);
                          setJumpPage('');
                        }
                      }
                    }}
                    onBlur={() => {
                      const p = parseInt(jumpPage, 10);
                      if (!isNaN(p) && p >= 1 && p <= voterTotalPages) {
                        setVoterPage(p);
                        setJumpPage('');
                      }
                    }}
                    placeholder={String(voterPage)}
                    className="w-12 text-center text-xs border border-gray-200 rounded-lg py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                  <span className="text-xs text-gray-400">of {voterTotalPages}</span>
                </div>
              </div>
            )}
          </Card>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Interim Results */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {stats.resultType === 'FINAL' ? 'Final Results' : 'Interim Results'}
                </h3>
                {results.length > 0 && (
                  <Badge variant={stats.resultType === 'FINAL' ? 'success' : 'warning'} size="sm">
                    {stats.resultType || 'PROVISIONAL'}
                  </Badge>
                )}
              </div>
              <div className="space-y-5">
                {results.length > 0 ? (
                  results.map((r) => (
                    <div key={r.candidateId}>
                      <div className="flex justify-between items-baseline mb-1">
                        <div>
                          <p className="font-bold text-sm text-gray-900">{r.party}</p>
                          <p className="text-xs text-gray-500">{r.candidateName}</p>
                        </div>
                        <p className="font-bold text-sm text-gray-900">
                          {formatNumber(r.votes)} <span className="text-xs font-normal text-gray-500">votes</span>
                        </p>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{
                            width: `${r.percentage}%`,
                            backgroundColor: r.color || '#3B82F6',
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">No results submitted yet</p>
                )}
              </div>
              {results.length > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <div className="flex items-start gap-2 text-xs text-gray-500 italic">
                    <InformationCircleIcon className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>{stats.resultType === 'FINAL' ? 'Official verified final results.' : 'Provisional data only. Subject to official verification.'}</p>
                  </div>
                </div>
              )}
            </Card>

            {/* On-Site Agent */}
            {agent && (
              <div className="bg-gray-800 rounded-xl p-6 text-white">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">On-Site Agent</p>
                <div 
                  className="flex items-center gap-3 mb-4 cursor-pointer hover:bg-gray-700/50 p-2 -mx-2 rounded-lg transition-colors group"
                  onClick={() => router.push('/admin/agents/' + agent.id)}
                  title="View Agent Profile"
                >
                  {agent.photo ? (
                    <img src={agent.photo} alt={agent.name} className="w-10 h-10 rounded-full object-cover group-hover:ring-2 group-hover:ring-primary-500 transition-all" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center group-hover:ring-2 group-hover:ring-primary-500 transition-all">
                      <UserIcon className="h-5 w-5 text-gray-300" />
                    </div>
                  )}
                  <div>
                    <p className="font-semibold group-hover:text-primary-400 transition-colors">{agent.name}</p>
                    <p className="text-xs text-gray-400">ID: #AGENT-{agent.id.slice(0, 4).toUpperCase()}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Contact Number</span>
                    <span className="font-medium">{agent.phone || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Check-in Time</span>
                    <span className="font-medium">
                      {stats.lastActivity
                        ? new Date(stats.lastActivity).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
                        : 'N/A'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/admin/chat?agent=${agent.id}`)}
                  className="w-full mt-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <PhoneIcon className="h-4 w-4" />
                  Direct Connection
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
