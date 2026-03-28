'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatNumber } from '@/lib/utils';
import {
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const PAGE_SIZE = 25;

interface StationData {
  id: string;
  psCode: string;
  name: string;
  status: string;
  agentId: string | null;
  totalRegistered: number;
  totalVoted: number;
  turnoutPercentage: number;
}

interface VoterData {
  id: string;
  voterId: string;
  firstName: string;
  lastName: string;
  age: number;
  psCode: string;
  photo: string | null;
  hasVoted: boolean;
  stationId: string;
}

interface VoterPage {
  voters: VoterData[];
  total: number;
  page: number;
  totalPages: number;
}

export default function TurnoutPage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | 'pending' | 'voted'>('all');
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userId = (session?.user as { id?: string })?.id;
  const { data: stations, mutate: mutateStations } = useSWR<StationData[]>('/api/stations', fetcher, { refreshInterval: 30000 });
  const station = (stations || []).find((s) => s.agentId === userId);

  // Infinite loading
  const getKey = (pageIndex: number, prevData: VoterPage | null) => {
    if (!station?.id) return null;
    if (prevData && pageIndex >= prevData.totalPages) return null;
    const params = new URLSearchParams({
      page: String(pageIndex + 1),
      limit: String(PAGE_SIZE),
      stationId: station.id,
      ...(search && { search }),
    });
    return `/api/voters?${params}`;
  };

  const {
    data: pages,
    size,
    setSize,
    mutate: mutateVoters,
    isValidating,
  } = useSWRInfinite<VoterPage>(getKey, fetcher, {
    revalidateFirstPage: true,
    revalidateOnFocus: false,
  });

  const rawVoters = pages ? pages.flatMap((p) => p.voters) : [];
  const total = pages?.[0]?.total || 0;
  const totalPages = pages?.[0]?.totalPages || 1;
  const isLoadingMore = size > 0 && pages && typeof pages[size - 1] === 'undefined';
  const hasMore = size < totalPages;

  // Apply client-side tab filter
  let voters = rawVoters;
  if (tab === 'voted') voters = rawVoters.filter((v) => v.hasVoted);
  if (tab === 'pending') voters = rawVoters.filter((v) => !v.hasVoted);

  // Infinite scroll observer
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isValidating) {
          setSize((s) => s + 1);
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isValidating, setSize]);

  // Reset when search changes
  useEffect(() => {
    setSize(1);
  }, [search, setSize]);

  // Debounced search
  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchInput(e.target.value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSearch(e.target.value);
      }, 400);
    },
    []
  );

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleToggleVoted = async (voter: VoterData) => {
    setUpdatingId(voter.voterId);
    setError(null);
    try {
      const res = await fetch('/api/turnout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voterId: voter.voterId,
          hasVoted: !voter.hasVoted,
          stationId: voter.stationId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to update voter status (${res.status})`);
      }
      // Re-fetch all loaded pages and station stats simultaneously
      await Promise.all([mutateVoters(), mutateStations()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update voter status';
      setError(message);
    } finally {
      setUpdatingId(null);
    }
  };

  if (!station) {
    return (
      <div className="p-6">
        <Card className="text-center py-12">
          <p className="text-gray-500">No polling station assigned.</p>
        </Card>
      </div>
    );
  }

  const votedCount = station.totalVoted || 0;
  const totalRegistered = station.totalRegistered || 0;
  const leftCount = totalRegistered - votedCount;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Mobile Header */}
      <div className="md:hidden">
        <h2 className="text-lg font-bold text-gray-900">Station #{station.psCode}</h2>
        <p className="text-xs text-gray-500">{station.name}</p>
      </div>
      <div className="hidden md:block">
        <h2 className="text-2xl font-bold text-gray-900">Record Voter Turnout</h2>
        <p className="text-gray-500 text-sm mt-1">{station.name} ({station.psCode})</p>
      </div>

      {/* Turnout Stats */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card>
          <p className="text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-1">Total</p>
          <p className="text-xl md:text-3xl font-bold text-gray-900">{formatNumber(totalRegistered)}</p>
        </Card>
        <Card>
          <p className="text-[10px] md:text-xs font-bold text-green-600 uppercase mb-1">Voted</p>
          <p className="text-xl md:text-3xl font-bold text-green-600">{formatNumber(votedCount)}</p>
        </Card>
        <Card>
          <p className="text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-1">Left</p>
          <p className="text-xl md:text-3xl font-bold text-gray-900">{formatNumber(leftCount)}</p>
        </Card>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between text-sm">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-medium ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search Voter by ID or Name..."
          value={searchInput}
          onChange={handleSearch}
          className="pl-11 pr-4 py-3 text-sm bg-white border border-gray-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {(['all', 'pending', 'voted'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'all' ? 'All Voters' : t === 'pending' ? 'Pending' : 'Verified'}
          </button>
        ))}
      </div>

      {/* Voter List - Mobile card style */}
      <div className="space-y-2 md:hidden">
        {voters.map((voter) => (
          <div key={voter.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {voter.photo ? (
                <img src={voter.photo} alt={`${voter.firstName} ${voter.lastName}`} className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0" />
              ) : (
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
                  {voter.firstName[0]}{voter.lastName[0]}
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-900 text-sm">{voter.firstName} {voter.lastName}</p>
                <p className="text-xs text-gray-500">ID: {voter.voterId}</p>
              </div>
            </div>
            <button
              onClick={() => handleToggleVoted(voter)}
              disabled={updatingId === voter.voterId}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                voter.hasVoted
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-green-600 hover:text-white'
              }`}
            >
              {updatingId === voter.voterId
                ? '...'
                : voter.hasVoted
                ? 'Voted'
                : 'Mark Voted'}
            </button>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <Card padding={false} className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Voter ID</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Name</th>
              <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Age</th>
              <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-center py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody>
            {voters.map((voter) => (
              <tr key={voter.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-3 px-6 font-mono text-xs text-gray-700">{voter.voterId}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {voter.photo ? (
                      <img src={voter.photo} alt={`${voter.firstName} ${voter.lastName}`} className="w-8 h-8 rounded-full object-cover border border-gray-200 shrink-0" />
                    ) : (
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                        {voter.firstName[0]}{voter.lastName[0]}
                      </div>
                    )}
                    <span className="font-medium text-gray-900">{voter.firstName} {voter.lastName}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-center text-gray-600">{voter.age}</td>
                <td className="py-3 px-4 text-center">
                  <Badge variant={voter.hasVoted ? 'success' : 'neutral'}>
                    {voter.hasVoted ? 'Voted' : 'Not Voted'}
                  </Badge>
                </td>
                <td className="py-3 px-6 text-center">
                  <button
                    onClick={() => handleToggleVoted(voter)}
                    disabled={updatingId === voter.voterId}
                    className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                      voter.hasVoted
                        ? 'bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-700'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {updatingId === voter.voterId
                      ? 'Updating...'
                      : voter.hasVoted
                      ? 'Undo'
                      : 'Mark Voted'}
                  </button>
                </td>
              </tr>
            ))}
            {voters.length === 0 && !isValidating && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-gray-500">
                  {search ? 'No voters found matching your search' : 'No voters registered at this station'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {/* Loading indicator */}
      {(isLoadingMore || (isValidating && rawVoters.length > 0)) && (
        <div className="py-4 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-gray-500">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin" />
            Loading more voters...
          </div>
        </div>
      )}

      {/* End of list */}
      {!hasMore && rawVoters.length > 0 && !isValidating && (
        <div className="py-3 text-center text-xs text-gray-400">
          All {total.toLocaleString()} voters loaded
        </div>
      )}
    </div>
  );
}
