'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface StationPoint {
  psCode: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  turnoutPercentage: number;
  totalRegistered: number;
  totalVoted: number;
}

interface TurnoutHeatmapProps {
  stations: StationPoint[];
}

const CENTER: [number, number] = [5.355, -0.63];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getTurnoutGradient(turnout: number): string {
  if (turnout >= 80) return '#0f766e';
  if (turnout >= 65) return '#0891b2';
  if (turnout >= 50) return '#2563eb';
  if (turnout >= 35) return '#7c3aed';
  if (turnout >= 20) return '#f59e0b';
  return '#f97316';
}

function getHeatLayers(turnout: number, totalRegistered: number) {
  const normalizedTurnout = clamp(turnout / 100, 0.08, 1);
  const populationWeight = clamp(totalRegistered / 1200, 0.35, 1);
  const baseRadius = 24 + normalizedTurnout * 18 + populationWeight * 16;
  const color = getTurnoutGradient(turnout);

  return {
    color,
    outerRadius: baseRadius + 22,
    middleRadius: baseRadius + 10,
    coreRadius: Math.max(12, baseRadius - 8),
    outerOpacity: 0.08 + normalizedTurnout * 0.07,
    middleOpacity: 0.16 + normalizedTurnout * 0.1,
    coreOpacity: 0.4 + normalizedTurnout * 0.18,
  };
}

function createClusterIcon(station: StationPoint): L.DivIcon {
  const turnout = clamp(Math.round(station.turnoutPercentage), 0, 100);
  const size = station.totalRegistered >= 1200 ? 48 : station.totalRegistered >= 700 ? 42 : 36;
  const color = getTurnoutGradient(turnout);

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:${size}px;height:${size + 12}px;">
        <div style="
          position:absolute;
          left:50%;
          top:0;
          width:${size}px;
          height:${size}px;
          transform:translateX(-50%);
          border-radius:9999px;
          background:linear-gradient(180deg, ${color} 0%, #0f172a 130%);
          border:3px solid #ffffff;
          box-shadow:0 10px 20px rgba(15,23,42,0.22);
          display:flex;
          align-items:center;
          justify-content:center;
          color:#ffffff;
          font-size:11px;
          font-weight:700;
          font-family:system-ui,sans-serif;
        ">${turnout}%</div>
        <div style="
          position:absolute;
          left:50%;
          top:${size - 3}px;
          width:10px;
          height:10px;
          transform:translateX(-50%) rotate(45deg);
          background:#0f172a;
          border-right:2px solid #ffffff;
          border-bottom:2px solid #ffffff;
        "></div>
      </div>
    `,
    iconSize: [size, size + 12],
    iconAnchor: [size / 2, size + 8],
    popupAnchor: [0, -(size / 2)],
  });
}

export default function TurnoutHeatmap({ stations }: TurnoutHeatmapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [mode, setMode] = useState<'heatmap' | 'clusters'>('heatmap');

  const geoStations = useMemo(
    () => stations.filter((s) => s.latitude !== null && s.longitude !== null),
    [stations]
  );

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
      minZoom: 10,
    }).setView(CENTER, 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    if (geoStations.length === 0) return;

    if (mode === 'heatmap') {
      geoStations.forEach((station) => {
        const layers = getHeatLayers(station.turnoutPercentage, station.totalRegistered);
        const safeName = escapeHtml(station.name);
        const safePsCode = escapeHtml(station.psCode);
        const popupContent = `
          <div style="font-family:system-ui,sans-serif;min-width:180px">
            <p style="margin:0 0 4px 0;font-size:13px;font-weight:700;color:#0f172a">${safeName}</p>
            <p style="margin:0 0 10px 0;font-size:11px;color:#64748b">${safePsCode}</p>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
              <span style="color:#64748b">Turnout</span>
              <span style="font-weight:700;color:#0f172a">${station.turnoutPercentage.toFixed(1)}%</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px">
              <span style="color:#64748b">Voted</span>
              <span style="font-weight:600;color:#0f172a">${station.totalVoted.toLocaleString()} / ${station.totalRegistered.toLocaleString()}</span>
            </div>
          </div>
        `;

        L.circle([station.latitude!, station.longitude!], {
          radius: layers.outerRadius * 11,
          stroke: false,
          fillColor: layers.color,
          fillOpacity: layers.outerOpacity,
          interactive: false,
        }).addTo(layerGroup);

        L.circle([station.latitude!, station.longitude!], {
          radius: layers.middleRadius * 8,
          stroke: false,
          fillColor: layers.color,
          fillOpacity: layers.middleOpacity,
          interactive: false,
        }).addTo(layerGroup);

        L.circleMarker([station.latitude!, station.longitude!], {
          radius: layers.coreRadius,
          fillColor: layers.color,
          fillOpacity: layers.coreOpacity,
          color: '#ffffff',
          weight: 1.5,
          opacity: 0.9,
        })
          .bindPopup(popupContent, { maxWidth: 240 })
          .addTo(layerGroup);
      });
    } else {
      geoStations.forEach((station) => {
        const safeName = escapeHtml(station.name);
        const safePsCode = escapeHtml(station.psCode);
        const popupContent = `
          <div style="font-family:system-ui,sans-serif;min-width:180px">
            <p style="margin:0 0 4px 0;font-size:13px;font-weight:700;color:#0f172a">${safeName}</p>
            <p style="margin:0 0 10px 0;font-size:11px;color:#64748b">${safePsCode}</p>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
              <span style="color:#64748b">Turnout</span>
              <span style="font-weight:700;color:#0f172a">${station.turnoutPercentage.toFixed(1)}%</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px">
              <span style="color:#64748b">Voted</span>
              <span style="font-weight:600;color:#0f172a">${station.totalVoted.toLocaleString()} / ${station.totalRegistered.toLocaleString()}</span>
            </div>
          </div>
        `;

        L.marker([station.latitude!, station.longitude!], { icon: createClusterIcon(station) })
          .bindPopup(popupContent, { maxWidth: 240 })
          .addTo(layerGroup);
      });
    }

    if (geoStations.length > 1) {
      const bounds = L.latLngBounds(geoStations.map((s) => [s.latitude!, s.longitude!] as [number, number]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    } else if (geoStations.length === 1) {
      map.setView([geoStations[0].latitude!, geoStations[0].longitude!], 13);
    }
  }, [geoStations, mode]);

  const averageTurnout = geoStations.length
    ? geoStations.reduce((sum, station) => sum + station.turnoutPercentage, 0) / geoStations.length
    : 0;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Geographic Distribution</h3>
          <p className="mt-1 text-sm text-gray-500">
            {geoStations.length} mapped stations with an average turnout of {averageTurnout.toFixed(1)}%.
          </p>
        </div>
        <div className="flex rounded-xl bg-gray-100 p-1">
          <button
            onClick={() => setMode('heatmap')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'heatmap' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Heat intensity
          </button>
          <button
            onClick={() => setMode('clusters')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'clusters' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Station pins
          </button>
        </div>
      </div>

      <div ref={mapRef} className="z-0 h-80 rounded-2xl border border-gray-200" />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-teal-700" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Very high</span>
          </div>
          <p className="mt-2 text-sm text-gray-700">80% and above turnout</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-sky-600" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">High</span>
          </div>
          <p className="mt-2 text-sm text-gray-700">50% to 79% turnout</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-violet-600" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Moderate</span>
          </div>
          <p className="mt-2 text-sm text-gray-700">20% to 49% turnout</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Low</span>
          </div>
          <p className="mt-2 text-sm text-gray-700">Below 20% turnout</p>
        </div>
      </div>
    </div>
  );
}
