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
  showAreas: boolean;
  showClusters: boolean;
  statusFilter: Set<string>;
}

const DEFAULT_CENTER: [number, number] = [5.355, -0.63];
const DEFAULT_ZOOM = 13;

// Cluster radius in degrees (approx 1.5 km at equator)
const CLUSTER_RADIUS = 0.015;
// Zoom threshold below which clustering activates
const CLUSTER_ZOOM_THRESHOLD = 12;

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
    case 'REPORTED': return '#16a34a';
    case 'ACTIVE':   return '#2563eb';
    case 'NO_AGENT': return '#ea580c';
    case 'PENDING':  return '#64748b';
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

function getTurnoutTone(turnout: number): string {
  if (turnout >= 80) return '#0f766e';
  if (turnout >= 60) return '#0284c7';
  if (turnout >= 40) return '#7c3aed';
  if (turnout >= 20) return '#d97706';
  return '#475569';
}

function getPinSize(station: StationData): number {
  if (station.totalRegistered >= 1200) return 26;
  if (station.totalRegistered >= 800)  return 24;
  if (station.totalRegistered >= 500)  return 22;
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
          position:absolute;left:50%;top:4px;
          width:${haloSize}px;height:${haloSize}px;
          transform:translateX(-50%);
          border-radius:9999px;
          background:${statusColor}22;
          box-shadow:0 0 0 10px ${statusColor}10;
        "></div>
        <div style="
          position:absolute;left:50%;top:8px;
          width:${size}px;height:${size}px;
          transform:translateX(-50%);
          border-radius:9999px;
          background:linear-gradient(180deg,${statusColor} 0%,${turnoutColor} 100%);
          border:3px solid #ffffff;
          box-shadow:0 10px 20px rgba(15,23,42,0.22);
        "></div>
        <div style="
          position:absolute;left:50%;top:${size + 2}px;
          width:12px;height:12px;
          transform:translateX(-50%) rotate(45deg);
          background:${turnoutColor};
          border-right:2px solid #ffffff;
          border-bottom:2px solid #ffffff;
          box-shadow:2px 2px 10px rgba(15,23,42,0.12);
        "></div>
        <div style="
          position:absolute;left:50%;top:-2px;
          transform:translateX(-50%);
          min-width:34px;padding:2px 6px;
          border-radius:9999px;
          background:rgba(15,23,42,0.88);
          color:#ffffff;font-size:10px;font-weight:700;
          text-align:center;letter-spacing:0.01em;
        ">${chipLabel}</div>
      </div>
    `,
    iconSize: [size + 18, size + 28],
    iconAnchor: [(size + 18) / 2, size + 26],
    popupAnchor: [0, -(size + 16)],
    tooltipAnchor: [0, -(size + 10)],
  });
}

// ── Greedy radius-based clustering ──────────────────────────────────────────

interface ClusterGroup {
  stations: StationData[];
  lat: number;
  lng: number;
}

function clusterStations(stations: StationData[]): ClusterGroup[] {
  const clusters: ClusterGroup[] = [];
  const assigned = new Set<string>();

  for (const s of stations) {
    if (assigned.has(s.id) || s.latitude === null || s.longitude === null) continue;

    const members: StationData[] = [s];
    assigned.add(s.id);

    for (const other of stations) {
      if (assigned.has(other.id) || other.latitude === null || other.longitude === null) continue;
      const dLat = Math.abs(other.latitude - s.latitude!);
      const dLng = Math.abs(other.longitude - s.longitude!);
      if (dLat < CLUSTER_RADIUS && dLng < CLUSTER_RADIUS) {
        members.push(other);
        assigned.add(other.id);
      }
    }

    const avgLat = members.reduce((acc, m) => acc + m.latitude!, 0) / members.length;
    const avgLng = members.reduce((acc, m) => acc + m.longitude!, 0) / members.length;
    clusters.push({ stations: members, lat: avgLat, lng: avgLng });
  }

  return clusters;
}

function dominantColor(stations: StationData[]): string {
  const counts: Record<string, number> = { REPORTED: 0, ACTIVE: 0, NO_AGENT: 0, PENDING: 0 };
  for (const s of stations) counts[getStationStatus(s)]++;
  // Precedence: REPORTED > ACTIVE > NO_AGENT > PENDING
  if (counts.REPORTED > 0) return '#16a34a';
  if (counts.ACTIVE > 0)   return '#2563eb';
  if (counts.NO_AGENT > 0) return '#ea580c';
  return '#64748b';
}

function createClusterIcon(group: ClusterGroup): L.DivIcon {
  const count = group.stations.length;
  const color = dominantColor(group.stations);
  const size = count >= 20 ? 46 : count >= 10 ? 40 : 34;

  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:${size}px;height:${size}px;
        border-radius:50%;
        background:${color};
        border:3px solid #fff;
        box-shadow:0 4px 14px rgba(0,0,0,0.25);
        display:flex;align-items:center;justify-content:center;
        color:#fff;font-weight:700;font-size:${count >= 100 ? 11 : 13}px;
        font-family:system-ui,sans-serif;
      ">${count}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

function buildClusterPopup(group: ClusterGroup): string {
  const lines = group.stations
    .map((s) => {
      const status = getStationStatus(s);
      const color = getMarkerColor(status);
      return `<div style="padding:4px 0;border-bottom:1px solid #f0f0f0;font-size:12px;">
        <span style="font-family:monospace;color:#4338ca;font-weight:700">${escapeHtml(s.psCode)}</span>
        <span style="margin-left:6px;color:#374151">${escapeHtml(s.name)}</span>
        <span style="float:right;color:${color};font-weight:600">${getStatusLabel(status)}</span>
      </div>`;
    })
    .join('');
  return `<div style="min-width:240px;font-family:system-ui,sans-serif;max-height:240px;overflow-y:auto">
    <p style="font-weight:700;font-size:13px;margin:0 0 8px">${group.stations.length} stations</p>
    ${lines}
  </div>`;
}

// ── Main map component ────────────────────────────────────────────────────────

export default function StationMapInner({
  stations,
  areas,
  showAreas,
  showClusters,
  statusFilter,
}: StationMapInnerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const areaLayerRef = useRef<L.LayerGroup | null>(null);

  // Init map once
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
    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
      markersLayerRef.current = null;
      areaLayerRef.current = null;
    };
  }, []);

  // Redraw area boundaries when areas or showAreas changes
  useEffect(() => {
    const map = mapInstance.current;
    const areaLayer = areaLayerRef.current;
    if (!map || !areaLayer) return;

    areaLayer.clearLayers();
    if (!showAreas) return;

    areas.forEach((area) => {
      const points = parseBoundaryGeoJson(area.boundaryGeoJson);
      if (points.length < 3) return;

      L.polygon(points, {
        color: '#1d4ed8',
        weight: 1.5,
        fillColor: '#60a5fa',
        fillOpacity: 0.06,
        dashArray: '5 6',
      })
        .bindTooltip(area.name, { sticky: true, direction: 'center', opacity: 0.85 })
        .addTo(areaLayer);
    });
  }, [areas, showAreas]);

  // Redraw markers when stations, filters, or cluster mode changes
  useEffect(() => {
    const map = mapInstance.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    const redraw = () => {
      markersLayer.clearLayers();

      // Apply status filter
      const visible = stations.filter((s) => statusFilter.has(getStationStatus(s)));

      const zoom = map.getZoom();
      const doClusters = showClusters && zoom < CLUSTER_ZOOM_THRESHOLD;

      if (doClusters) {
        // ── Cluster view ──
        const groups = clusterStations(visible);
        for (const group of groups) {
          if (group.stations.length === 1) {
            // Single station — draw normally
            renderStation(group.stations[0], markersLayer);
          } else {
            L.marker([group.lat, group.lng], { icon: createClusterIcon(group) })
              .bindPopup(buildClusterPopup(group), { maxWidth: 300 })
              .addTo(markersLayer);
          }
        }
      } else {
        // ── Individual markers ──
        for (const station of visible) {
          renderStation(station, markersLayer);
        }
      }
    };

    // Draw markers immediately
    redraw();

    // Fit bounds once on data load — NOT inside redraw so zoom events don't reset it
    const layers = markersLayer.getLayers();
    if (layers.length > 0) {
      const areaLayers = areaLayerRef.current?.getLayers() ?? [];
      const all = [...layers, ...areaLayers];
      const group = L.featureGroup(all);
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.12), { maxZoom: 14 });
      }
    }

    // Re-render markers on zoom change (cluster↔marker switch) — no fitBounds here
    map.on('zoomend', redraw);
    return () => {
      map.off('zoomend', redraw);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, showClusters, statusFilter]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '400px' }} />;
}

// ── Individual station marker renderer (extracted for reuse) ─────────────────

function renderStation(station: StationData, layer: L.LayerGroup) {
  if (station.latitude === null || station.longitude === null) return;

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

  L.marker([station.latitude, station.longitude], {
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
    .addTo(layer);
}
