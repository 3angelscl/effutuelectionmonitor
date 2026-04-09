'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { parseBoundaryGeoJson } from '@/lib/electoral-area-boundary';

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
  areas: { id: string; name: string; boundaryGeoJson: string | null }[];
}

const DEFAULT_CENTER: [number, number] = [5.355, -0.63];
const DEFAULT_ZOOM = 13;

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
    case 'REPORTED':
      return '#16a34a';
    case 'ACTIVE':
      return '#2563eb';
    case 'NO_AGENT':
      return '#ea580c';
    case 'PENDING':
      return '#64748b';
  }
}

function getStatusLabel(status: 'REPORTED' | 'ACTIVE' | 'NO_AGENT' | 'PENDING'): string {
  switch (status) {
    case 'REPORTED':
      return 'Reported';
    case 'ACTIVE':
      return 'Active';
    case 'NO_AGENT':
      return 'No Agent';
    case 'PENDING':
      return 'Pending';
  }
}

function getTurnoutTone(turnout: number): string {
  if (turnout >= 80) return '#0f766e';
  if (turnout >= 60) return '#0284c7';
  if (turnout >= 40) return '#7c3aed';
  if (turnout >= 20) return '#d97706';
  return '#475569';
}

function getPinSize(station: StationData): number {
  if (station.totalRegistered >= 1200) return 26;
  if (station.totalRegistered >= 800) return 24;
  if (station.totalRegistered >= 500) return 22;
  return 20;
}

function createStationIcon(station: StationData, statusColor: string): L.DivIcon {
  const turnout = Math.round(station.turnoutPercentage);
  const turnoutColor = getTurnoutTone(turnout);
  const size = getPinSize(station);
  const safeTurnout = Number.isFinite(turnout) ? turnout : 0;
  const haloSize = size + 12;
  const chipLabel = safeTurnout > 0 ? `${safeTurnout}%` : '0%';

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:${size + 18}px;height:${size + 28}px;">
        <div style="
          position:absolute;
          left:50%;
          top:4px;
          width:${haloSize}px;
          height:${haloSize}px;
          transform:translateX(-50%);
          border-radius:9999px;
          background:${statusColor}22;
          box-shadow:0 0 0 10px ${statusColor}10;
        "></div>
        <div style="
          position:absolute;
          left:50%;
          top:8px;
          width:${size}px;
          height:${size}px;
          transform:translateX(-50%);
          border-radius:9999px;
          background:linear-gradient(180deg, ${statusColor} 0%, ${turnoutColor} 100%);
          border:3px solid #ffffff;
          box-shadow:0 10px 20px rgba(15,23,42,0.22);
        "></div>
        <div style="
          position:absolute;
          left:50%;
          top:${size + 2}px;
          width:12px;
          height:12px;
          transform:translateX(-50%) rotate(45deg);
          background:${turnoutColor};
          border-right:2px solid #ffffff;
          border-bottom:2px solid #ffffff;
          box-shadow:2px 2px 10px rgba(15,23,42,0.12);
        "></div>
        <div style="
          position:absolute;
          left:50%;
          top:-2px;
          transform:translateX(-50%);
          min-width:34px;
          padding:2px 6px;
          border-radius:9999px;
          background:rgba(15,23,42,0.88);
          color:#ffffff;
          font-size:10px;
          font-weight:700;
          text-align:center;
          letter-spacing:0.01em;
        ">${chipLabel}</div>
      </div>
    `,
    iconSize: [size + 18, size + 28],
    iconAnchor: [(size + 18) / 2, size + 26],
    popupAnchor: [0, -(size + 16)],
    tooltipAnchor: [0, -(size + 10)],
  });
}

export default function StationMapInner({ stations, areas }: StationMapInnerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Layer[]>([]);
  const areaLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: true,
      minZoom: 10,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map);

    areaLayerRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
      markersRef.current = [];
      areaLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    const areaLayer = areaLayerRef.current;
    if (!map || !areaLayer) return;

    areaLayer.clearLayers();

    areas.forEach((area) => {
      const points = parseBoundaryGeoJson(area.boundaryGeoJson);
      if (points.length < 3) return;

      L.polygon(points, {
        color: '#1d4ed8',
        weight: 1.5,
        fillColor: '#60a5fa',
        fillOpacity: 0.05,
        dashArray: '5 6',
      })
        .bindTooltip(area.name, {
          sticky: true,
          direction: 'center',
          opacity: 0.85,
        })
        .addTo(areaLayer);
    });
  }, [areas]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    markersRef.current.forEach((layer) => layer.remove());
    markersRef.current = [];

    for (const station of stations) {
      if (station.latitude === null || station.longitude === null) continue;

      const status = getStationStatus(station);
      const color = getMarkerColor(status);
      const statusLabel = getStatusLabel(status);
      const safePsCode = escapeHtml(station.psCode);
      const safeName = escapeHtml(station.name);
      const safeLocation = station.location ? escapeHtml(station.location) : '';
      const safeAgentName = station.agent ? escapeHtml(station.agent.name) : '';
      const turnoutWidth = Math.max(8, Math.min(100, Math.round(station.turnoutPercentage)));

      const popupContent = `
        <div style="min-width:220px;font-family:system-ui,sans-serif">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
            <span style="font-family:monospace;font-size:11px;font-weight:700;color:#4338ca;background:#eef2ff;padding:3px 7px;border-radius:9999px">${safePsCode}</span>
            <span style="font-size:10px;font-weight:700;color:${color};background:${color}18;padding:3px 9px;border-radius:9999px;text-transform:uppercase;letter-spacing:0.04em">${statusLabel}</span>
          </div>
          <p style="font-size:14px;font-weight:700;color:#0f172a;margin:0 0 4px 0">${safeName}</p>
          ${safeLocation ? `<p style="font-size:11px;color:#64748b;margin:0 0 10px 0">${safeLocation}</p>` : ''}
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:6px">
              <span>Turnout</span>
              <span style="font-weight:700;color:#0f172a">${station.turnoutPercentage.toFixed(1)}%</span>
            </div>
            <div style="height:7px;background:#e2e8f0;border-radius:9999px;overflow:hidden;margin-bottom:8px">
              <div style="width:${turnoutWidth}%;height:100%;background:linear-gradient(90deg,#38bdf8 0%,#2563eb 100%);border-radius:9999px"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:4px">
              <span>Voted / Registered</span>
              <span style="font-weight:600;color:#334155">${station.totalVoted.toLocaleString()} / ${station.totalRegistered.toLocaleString()}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b">
              <span>Agent</span>
              <span style="font-weight:600;color:#334155">${safeAgentName || 'Unassigned'}</span>
            </div>
          </div>
        </div>
      `;

      const marker = L.marker([station.latitude, station.longitude], {
        icon: createStationIcon(station, color),
        keyboard: true,
        title: `${station.psCode} - ${station.name}`,
      })
        .bindTooltip(`${station.psCode} - ${station.name}`, {
          direction: 'top',
          offset: [0, -16],
          opacity: 0.95,
        })
        .bindPopup(popupContent, { maxWidth: 280, className: 'station-map-popup' })
        .addTo(map);

      markersRef.current.push(marker);
    }

    const layers: L.Layer[] = [...markersRef.current, ...(areaLayerRef.current?.getLayers() ?? [])];
    if (layers.length > 0) {
      const group = L.featureGroup(layers);
      map.fitBounds(group.getBounds().pad(0.12), { maxZoom: 13 });
    }
  }, [stations]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '400px' }} />;
}
