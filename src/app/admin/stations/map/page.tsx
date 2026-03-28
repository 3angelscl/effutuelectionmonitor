'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Badge from '@/components/ui/Badge';
import { ArrowLeftIcon, MapPinIcon } from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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

function getStationStatus(station: StationData): 'REPORTED' | 'ACTIVE' | 'NO_AGENT' | 'PENDING' {
  if (station.results.length > 0) return 'REPORTED';
  if (station.totalVoted > 0) return 'ACTIVE';
  if (!station.agent) return 'NO_AGENT';
  return 'PENDING';
}

function getMarkerColor(status: 'REPORTED' | 'ACTIVE' | 'NO_AGENT' | 'PENDING'): string {
  switch (status) {
    case 'REPORTED': return '#22c55e';   // green
    case 'ACTIVE':   return '#3b82f6';   // blue
    case 'NO_AGENT': return '#f97316';   // orange
    case 'PENDING':  return '#9ca3af';   // gray
  }
}

// Dynamically import the map component to avoid SSR issues
const StationMapInner = dynamic(() => import('./StationMapInner'), { ssr: false });

export default function StationMapPage() {
  const { data: stations } = useSWR<StationData[]>('/api/stations', fetcher);

  const withCoords = (Array.isArray(stations) ? stations : []).filter(
    (s) => s.latitude !== null && s.longitude !== null
  );
  const withoutCoords = (Array.isArray(stations) ? stations : []).filter(
    (s) => s.latitude === null || s.longitude === null
  );

  return (
    <div className="flex-1 flex flex-col">
      <AdminHeader title="Station Map" />

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <Link
          href="/admin/stations"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Stations
        </Link>
        <div className="flex items-center gap-3 ml-2">
          {[
            { color: '#22c55e', label: 'Reported' },
            { color: '#3b82f6', label: 'Active' },
            { color: '#f97316', label: 'No Agent' },
            { color: '#9ca3af', label: 'Pending' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 112px)' }}>
        {/* Map Area */}
        <div className="flex-1 relative">
          {stations ? (
            <StationMapInner stations={withCoords} />
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-100">
              <p className="text-gray-500 text-sm">Loading map...</p>
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
                          status === 'ACTIVE' ? 'info' :
                          status === 'NO_AGENT' ? 'warning' : 'warning'
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
