'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { parseBoundaryGeoJson } from '@/lib/electoral-area-boundary';

interface ElectoralAreaStation {
  id: string;
  psCode: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

interface ElectoralAreaOverview {
  id: string;
  name: string;
  boundaryGeoJson: string | null;
  stationCount: number;
  stations: ElectoralAreaStation[];
}

interface ElectoralAreasOverviewMapProps {
  areas: ElectoralAreaOverview[];
  height?: string;
}

const DEFAULT_CENTER: [number, number] = [5.355, -0.63];
const DEFAULT_ZOOM = 13;

function getAreaColor(index: number) {
  const palette = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#f97316', '#db2777', '#4f46e5'];
  return palette[index % palette.length];
}

export default function ElectoralAreasOverviewMap({ areas, height = 'h-[32rem]' }: ElectoralAreasOverviewMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const areaLayerRef = useRef<L.LayerGroup | null>(null);
  const stationLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, { zoomAnimation: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    areaLayerRef.current = L.layerGroup().addTo(map);
    stationLayerRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
      areaLayerRef.current = null;
      stationLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapRef.current) return;

    const raf = requestAnimationFrame(() => map.invalidateSize(true));
    return () => cancelAnimationFrame(raf);
  }, [areas]);

  useEffect(() => {
    const map = mapInstance.current;
    const areaLayer = areaLayerRef.current;
    const stationLayer = stationLayerRef.current;
    if (!map || !areaLayer || !stationLayer) return;

    areaLayer.clearLayers();
    stationLayer.clearLayers();

    const layers: L.Layer[] = [];

    areas.forEach((area, index) => {
      const points = parseBoundaryGeoJson(area.boundaryGeoJson);
      if (points.length >= 3) {
        const color = getAreaColor(index);
        const polygon = L.polygon(points, {
          color,
          weight: 2.5,
          fillColor: color,
          fillOpacity: 0.12,
        }).bindTooltip(area.name, { sticky: true });
        polygon.addTo(areaLayer);
        layers.push(polygon);
      }

      area.stations.forEach((station) => {
        if (station.latitude === null || station.longitude === null) return;
        const pin = L.circleMarker([station.latitude, station.longitude], {
          radius: 6,
          color: '#ffffff',
          weight: 2,
          fillColor: '#0f766e',
          fillOpacity: 1,
        }).bindPopup(`
          <div style="font-family:system-ui,sans-serif;min-width:160px">
            <div style="font-size:11px;font-weight:700;color:#0f766e;margin-bottom:4px">${station.psCode}</div>
            <div style="font-size:13px;font-weight:600;color:#111827">${station.name}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">${area.name}</div>
          </div>
        `);
        pin.addTo(stationLayer);
        layers.push(pin);
      });
    });

    if (layers.length > 0) {
      const group = L.featureGroup(layers);
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.12), { maxZoom: 14 });
      }
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, [areas]);

  return <div ref={mapRef} className={`${height} rounded-xl border border-gray-200 overflow-hidden`} />;
}
