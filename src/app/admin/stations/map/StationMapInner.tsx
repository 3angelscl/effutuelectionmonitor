'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

interface StationMapInnerProps {
  stations: StationData[];
}

const DEFAULT_CENTER: [number, number] = [5.355, -0.630];
const DEFAULT_ZOOM = 13;

/** Escape HTML special characters to prevent XSS in Leaflet popups */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStationStatus(station: StationData): 'REPORTED' | 'ACTIVE' | 'NO_AGENT' | 'PENDING' {
  if (station.results.length > 0) return 'REPORTED';
  if (station.totalVoted > 0) return 'ACTIVE';
  if (!station.agent) return 'NO_AGENT';
  return 'PENDING';
}

function getMarkerColor(status: 'REPORTED' | 'ACTIVE' | 'NO_AGENT' | 'PENDING'): string {
  switch (status) {
    case 'REPORTED': return '#22c55e';
    case 'ACTIVE':   return '#3b82f6';
    case 'NO_AGENT': return '#f97316';
    case 'PENDING':  return '#9ca3af';
  }
}


function getStatusLabel(status: 'REPORTED' | 'ACTIVE' | 'NO_AGENT' | 'PENDING'): string {
  switch (status) {
    case 'REPORTED': return 'Reported';
    case 'ACTIVE':   return 'Active';
    case 'NO_AGENT': return 'No Agent';
    case 'PENDING':  return 'Pending';
  }
}

function getStatusColor(status: 'REPORTED' | 'ACTIVE' | 'NO_AGENT' | 'PENDING'): string {
  switch (status) {
    case 'REPORTED': return '#22c55e';
    case 'ACTIVE':   return '#3b82f6';
    case 'NO_AGENT': return '#f97316';
    case 'PENDING':  return '#9ca3af';
  }
}

export default function StationMapInner({ stations }: StationMapInnerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
      markersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Remove existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const station of stations) {
      if (station.latitude === null || station.longitude === null) continue;

      const status = getStationStatus(station);
      const color = getMarkerColor(status);
      const statusLabel = getStatusLabel(status);
      const statusColor = getStatusColor(status);

      const safePsCode = escapeHtml(station.psCode);
      const safeName = escapeHtml(station.name);
      const safeLocation = station.location ? escapeHtml(station.location) : '';
      const safeAgentName = station.agent ? escapeHtml(station.agent.name) : '';

      const popupContent = `
        <div style="min-width:180px;font-family:system-ui,sans-serif">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-family:monospace;font-size:11px;font-weight:700;color:#4f46e5;background:#eef2ff;padding:2px 6px;border-radius:4px">${safePsCode}</span>
            <span style="font-size:10px;font-weight:600;color:${statusColor};background:${statusColor}18;padding:2px 8px;border-radius:9999px">${statusLabel}</span>
          </div>
          <p style="font-size:13px;font-weight:600;color:#111827;margin:0 0 4px 0">${safeName}</p>
          ${safeLocation ? `<p style="font-size:11px;color:#6b7280;margin:0 0 6px 0">${safeLocation}</p>` : ''}
          <div style="border-top:1px solid #f3f4f6;padding-top:6px;margin-top:4px">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280">
              <span>Agent</span>
              <span style="font-weight:500;color:#374151">${safeAgentName || '<em style="color:#f97316">Unassigned</em>'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-top:2px">
              <span>Turnout</span>
              <span style="font-weight:600;color:#374151">${station.turnoutPercentage}%</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-top:2px">
              <span>Voted / Registered</span>
              <span style="font-weight:500;color:#374151">${station.totalVoted} / ${station.totalRegistered}</span>
            </div>
          </div>
        </div>
      `;

      const marker = L.circleMarker([station.latitude, station.longitude], {
        radius: 9,
        fillColor: color,
        color: 'white',
        weight: 2.5,
        opacity: 1,
        fillOpacity: 1,
      }).bindPopup(popupContent, { maxWidth: 260 }).addTo(map);

      markersRef.current.push(marker);
    }

    // Fit bounds if we have markers
    if (markersRef.current.length > 0) {
      const group = L.featureGroup(markersRef.current);
      map.fitBounds(group.getBounds().pad(0.1), { maxZoom: 15 });
    }
  }, [stations]);

  return (
    <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '600px' }} />
  );
}
