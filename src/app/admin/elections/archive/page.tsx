'use client';

import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
  ArchiveBoxIcon,
  CalendarDaysIcon,
  TrophyIcon,
  UsersIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface CandidateResult {
  id: string;
  name: string;
  party: string;
  color: string;
  photo: string | null;
  votes: number;
  votePct: number;
}

interface ArchivedElection {
  id: string;
  name: string;
  description: string | null;
  date: string | null;
  status: string;
  createdAt: string;
  totalVoted: number;
  totalRegistered: number;
  turnoutPct: number;
  totalVotes: number;
  candidateResults: CandidateResult[];
  winner: CandidateResult | null;
}

function ElectionCard({ election }: { election: ArchivedElection }) {
  const date = election.date ? new Date(election.date).toLocaleDateString('en-GH', {
    day: 'numeric', month: 'long', year: 'numeric',
  }) : null;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{election.name}</h3>
          {date && (
            <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
              <CalendarDaysIcon className="h-4 w-4" />
              {date}
            </p>
          )}
          {election.description && (
            <p className="text-sm text-gray-500 mt-1">{election.description}</p>
          )}
        </div>
        <Badge variant="neutral">Completed</Badge>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-gray-900">{election.turnoutPct}%</p>
          <p className="text-xs text-gray-500">Turnout</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-gray-900">{election.totalVotes.toLocaleString()}</p>
          <p className="text-xs text-gray-500">Total Votes</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-gray-900">{election.candidateResults.length}</p>
          <p className="text-xs text-gray-500">Candidates</p>
        </div>
      </div>

      {/* Winner banner */}
      {election.winner && election.winner.votes > 0 && (
        <div
          className="flex items-center gap-3 p-3 rounded-lg mb-4"
          style={{ backgroundColor: election.winner.color + '18' }}
        >
          <TrophyIcon className="h-5 w-5 shrink-0" style={{ color: election.winner.color }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{election.winner.name}</p>
            <p className="text-xs text-gray-500">{election.winner.party} · {election.winner.votes.toLocaleString()} votes ({election.winner.votePct}%)</p>
          </div>
          <span className="ml-auto text-xs font-semibold px-2 py-1 rounded-full text-white shrink-0" style={{ backgroundColor: election.winner.color }}>
            Winner
          </span>
        </div>
      )}

      {/* Candidate breakdown */}
      {election.candidateResults.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Results Breakdown</p>
          {election.candidateResults.map((c, i) => (
            <div key={c.id} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  {c.photo ? (
                    <img src={c.photo} alt={c.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: c.color }}
                    >
                      {c.name[0]}
                    </div>
                  )}
                  <span className="font-medium text-gray-900 truncate">{c.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{c.party}</span>
                  {i === 0 && c.votes > 0 && (
                    <TrophyIcon className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                  )}
                </div>
                <div className="text-right shrink-0 ml-2">
                  <span className="font-semibold text-gray-900">{c.votePct}%</span>
                  <span className="text-gray-400 text-xs ml-1">({c.votes.toLocaleString()})</span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${c.votePct}%`, backgroundColor: c.color }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function ElectionArchivePage() {
  const { data: elections, isLoading } = useSWR<ArchivedElection[]>('/api/elections/archive', fetcher);

  return (
    <div className="flex-1">
      <AdminHeader title="Election Archives" />

      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Election Archives</h2>
            <p className="text-sm text-gray-500 mt-1">Historical records of all completed elections</p>
          </div>
          <div className="flex items-center gap-2 bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-sm font-medium">
            <ArchiveBoxIcon className="h-4 w-4" />
            {elections?.length ?? 0} Archived
          </div>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse space-y-4">
                <div className="h-5 bg-gray-200 rounded w-2/3" />
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((j) => <div key={j} className="h-14 bg-gray-100 rounded-lg" />)}
                </div>
                <div className="h-12 bg-gray-100 rounded-lg" />
                <div className="space-y-2">
                  {[1, 2].map((j) => <div key={j} className="h-6 bg-gray-100 rounded" />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && elections?.length === 0 && (
          <div className="py-24 flex flex-col items-center justify-center text-center">
            <ArchiveBoxIcon className="h-16 w-16 text-gray-200 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No Archived Elections</h3>
            <p className="text-sm text-gray-500 max-w-xs">
              Completed elections will appear here. Use the{' '}
              <span className="font-medium">Archive</span> button on the Election Setup page or via the
              Manage Elections menu in the sidebar to archive an election.
            </p>
          </div>
        )}

        {elections && elections.length > 0 && (
          <>
            {/* Summary bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ArchiveBoxIcon className="h-4 w-4 text-gray-400" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Elections</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{elections.length}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ChartBarIcon className="h-4 w-4 text-gray-400" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Turnout</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {elections.length > 0
                    ? (elections.reduce((s, e) => s + e.turnoutPct, 0) / elections.length).toFixed(1)
                    : 0}%
                </p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <UsersIcon className="h-4 w-4 text-gray-400" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Votes Cast</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {elections.reduce((s, e) => s + e.totalVotes, 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrophyIcon className="h-4 w-4 text-gray-400" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Most Recent</p>
                </div>
                <p className="text-sm font-bold text-gray-900 truncate">{elections[0]?.name}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {elections.map((election) => (
                <ElectionCard key={election.id} election={election} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
