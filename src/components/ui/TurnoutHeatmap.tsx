'use client';

import { useEffect, useRef, useState } from 'react';
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

// Effutu constituency center
const CENTER: [number, number] = [5.355, -0.630];

export default function TurnoutHeatmap({ stations }: TurnoutHeatmapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const [mode, setMode] = useState<'heatmap' | 'clusters'>('heatmap');

  const geoStations = stations.filter((s) => s.latitude && s.longitude);

  useEffect(() => {
    if (!mapRef.current) return;

    // Clean up existing map
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const map = L.map(mapRef.current, {
      scrollWheelZoom: false,
    }).setView(CENTER, 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map);

    if (geoStations.length === 0) {
      mapInstance.current = map;
      return;
    }

    if (mode === 'heatmap') {
      // Manual heatmap using circle markers with varying intensity
      geoStations.forEach((station) => {
        const turnout = station.turnoutPercentage;
        const color = turnout > 75 ? '#1d4ed8' : turnout > 50 ? '#60a5fa' : turnout > 25 ? '#93c5fd' : '#dbeafe';
        const radius = Math.max(15, Math.min(40, station.totalRegistered / 30));

        // Glow/heat effect with multiple circles
        L.circleMarker([station.latitude!, station.longitude!], {
          radius: radius + 15,
          fillColor: color,
          fillOpacity: 0.15,
          stroke: false,
        }).addTo(map);

        L.circleMarker([station.latitude!, station.longitude!], {
          radius: radius + 5,
          fillColor: color,
          fillOpacity: 0.25,
          stroke: false,
        }).addTo(map);

        L.circleMarker([station.latitude!, station.longitude!], {
          radius: radius,
          fillColor: color,
          fillOpacity: 0.5,
          color: color,
          weight: 2,
          opacity: 0.8,
        }).addTo(map)
          .bindPopup(`
            <div style="font-family: system-ui; min-width: 160px;">
              <p style="font-weight: 700; margin: 0 0 4px 0; font-size: 13px;">${station.name}</p>
              <p style="color: #6b7280; margin: 0 0 8px 0; font-size: 11px;">${station.psCode}</p>
              <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                <span style="color: #6b7280;">Turnout</span>
                <span style="font-weight: 600;">${station.turnoutPercentage}%</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span style="color: #6b7280;">Voted</span>
                <span style="font-weight: 600;">${station.totalVoted.toLocaleString()} / ${station.totalRegistered.toLocaleString()}</span>
              </div>
            </div>
          `);
      });
    } else {
      // Cluster mode — individual markers
      const icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      });

      geoStations.forEach((station) => {
        L.marker([station.latitude!, station.longitude!], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: system-ui; min-width: 160px;">
              <p style="font-weight: 700; margin: 0 0 4px 0; font-size: 13px;">${station.name}</p>
              <p style="color: #6b7280; margin: 0 0 8px 0; font-size: 11px;">${station.psCode}</p>
              <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                <span style="color: #6b7280;">Turnout</span>
                <span style="font-weight: 600;">${station.turnoutPercentage}%</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span style="color: #6b7280;">Voted</span>
                <span style="font-weight: 600;">${station.totalVoted.toLocaleString()} / ${station.totalRegistered.toLocaleString()}</span>
              </div>
            </div>
          `);
      });
    }

    // Fit bounds to show all stations
    if (geoStations.length > 1) {
      const bounds = L.latLngBounds(
        geoStations.map((s) => [s.latitude!, s.longitude!] as [number, number])
      );
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    mapInstance.current = map;

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [geoStations, mode]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Geographic Distribution</h3>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setMode('heatmap')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'heatmap' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Heatmap
          </button>
          <button
            onClick={() => setMode('clusters')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'clusters' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Clusters
          </button>
        </div>
      </div>

      <div ref={mapRef} className="h-80 rounded-lg border border-gray-200 z-0" />

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-700" />
          <span className="text-xs text-gray-600">High Turnout (&gt;75%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-400" />
          <span className="text-xs text-gray-600">Mid Turnout (50-75%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-200" />
          <span className="text-xs text-gray-600">Low Turnout (&lt;50%)</span>
        </div>
      </div>
    </div>
  );
}
