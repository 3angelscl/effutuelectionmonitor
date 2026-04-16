'use client';

import { useState } from 'react';
import { fetcher } from '@/lib/utils';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Badge from '@/components/ui/Badge';
import { ArrowLeftIcon, MapPinIcon } from '@heroicons/react/24/outline';

interface StationData {
  id: string;
  psCode: string;
  name: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  agentId: string | null;
  agent: { id: string; name: string; email: string; phone: string | null } | null;
  totalRegistered: number;
  totalVoted: number;
  turnoutPercentage: number;
  results: { candidateId: string; candidateName: string; party: string; votes: number }[];
}

interface ElectoralAreaData {
  id: string;
  name: string;
  boundaryGeoJson: string | null;
}

type StatusKey = 'REPORTED' | 'ACTIVE' | 'NO_AGENT' | 'PENDING';

function getStationStatus(station: StationData): StatusKey {
  if (station.results.length > 0) return 'REPORTED';
  if (station.totalVoted > 0) return 'ACTIVE';
  if (!station.agent) return 'NO_AGENT';
  return 'PENDING';
}

const STATUS_CONFIG: { key: StatusKey; color: string; label: string; note: string }[] = [
  { key: 'REPORTED', color: '#16a34a', label: 'Reported', note: 'Results submitted' },
  { key: 'ACTIVE',   color: '#2563eb', label: 'Active',   note: 'Turnout recorded' },
  { key: 'NO_AGENT', color: '#ea580c', label: 'No Agent', note: 'Needs assignment' },
  { key: 'PENDING',  color: '#64748b', label: 'Pending',  note: 'Quiet station' },
];

const ALL_STATUSES = new Set<StatusKey>(['REPORTED', 'ACTIVE', 'NO_AGENT', 'PENDING']);

// Dynamically import the map component to avoid SSR issues
const StationMapInner = dynamic(() => import('./StationMapInner'), { ssr: false });

export default function StationMapPage() {
  const { data: stations } = useSWR<StationData[]>('/api/stations', fetcher);
  const { data: areas } = useSWR<ElectoralAreaData[]>('/api/electoral-areas', fetcher);

  const [showAreas, setShowAreas] = useState(true);
  const [showClusters, setShowClusters] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Set<StatusKey>>(new Set(ALL_STATUSES));

  const toggleStatus = (key: StatusKey) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return prev; // always keep at least one
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const allSelected = statusFilter.size === ALL_STATUSES.size;

  const withCoords = (Array.isArray(stations) ? stations : []).filter(
    (s) => s.latitude !== null && s.longitude !== null
  );
  const withoutCoords = (Array.isArray(stations) ? stations : []).filter(
    (s) => s.latitude === null || s.longitude === null
  );

  // Counts for each status (among coord stations)
  const statusCounts = withCoords.reduce<Record<string, number>>((acc, s) => {
    const status = getStationStatus(s);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex-1 flex flex-col">
      <AdminHeader title="Station Map" />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5 shrink-0">
        <Link
          href="/admin/stations"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shrink-0"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </Link>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200 shrink-0" />

        {/* Layer toggles */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Layers</span>
          <button
            onClick={() => setShowAreas((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              showAreas
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-gray-50 border-gray-200 text-gray-500'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full border-2 ${showAreas ? 'border-blue-500 bg-blue-100' : 'border-gray-300'}`} />
            Areas
          </button>
          <button
            onClick={() => setShowClusters((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              showClusters
                ? 'bg-purple-50 border-purple-200 text-purple-700'
                : 'bg-gray-50 border-gray-200 text-gray-500'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full border-2 ${showClusters ? 'border-purple-500 bg-purple-100' : 'border-gray-300'}`} />
            Cluster
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200 shrink-0" />

        {/* Status filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 shrink-0">Filter</span>
          <button
            onClick={() => setStatusFilter(new Set(ALL_STATUSES))}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
              allSelected
                ? 'bg-gray-800 border-gray-800 text-white'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
            }`}
          >
            All
          </button>
          {STATUS_CONFIG.map(({ key, color, label }) => {
            const active = statusFilter.has(key);
            const count = statusCounts[key] ?? 0;
            return (
              <button
                key={key}
                onClick={() => toggleStatus(key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  active
                    ? 'border-transparent text-white'
                    : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'
                }`}
                style={active ? { backgroundColor: color, borderColor: color } : {}}
              >
                {label}
                <span className={`rounded-full px-1 text-[10px] font-bold ${active ? 'bg-white/25' : 'bg-gray-200 text-gray-500'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>
        {/* Map Area */}
        <div className="flex-1 relative">
          {stations ? (
            <StationMapInner
              stations={withCoords}
              areas={Array.isArray(areas) ? areas : []}
              showAreas={showAreas}
              showClusters={showClusters}
              statusFilter={statusFilter}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-100">
              <p className="text-gray-500 text-sm">Loading map…</p>
            </div>
          )}
        </div>

        {/* Sidebar: stations without coordinates */}
        <div className="w-72 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">No Coordinates Set</h3>
            <p className="text-xs text-gray-400 mt-0.5">{withoutCoords.length} stations not on map</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {withoutCoords.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                All stations have coordinates
              </div>
            ) : (
              withoutCoords.map((station) => {
                const status = getStationStatus(station);
                return (
                  <Link
                    key={station.id}
                    href={`/admin/stations/${station.id}`}
                    className="block px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-mono text-[10px] font-semibold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded">
                            {station.psCode}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-gray-800 truncate">{station.name}</p>
                        {station.location && (
                          <p className="text-[10px] text-gray-400 flex items-center gap-0.5 mt-0.5">
                            <MapPinIcon className="h-2.5 w-2.5 shrink-0" />
                            {station.location}
                          </p>
                        )}
                        <p className="text-[10px] text-orange-500 italic mt-0.5">No coordinates set</p>
                      </div>
                      <Badge
                        variant={
                          status === 'REPORTED' ? 'success' :
                          status === 'ACTIVE' ? 'info' : 'warning'
                        }
                        size="sm"
                      >
                        {status === 'REPORTED' ? 'Done' :
                         status === 'ACTIVE' ? 'Active' :
                         status === 'NO_AGENT' ? 'No Agent' : 'Pending'}
                      </Badge>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
