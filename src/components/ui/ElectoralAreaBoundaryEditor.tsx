'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLngPoint } from '@/lib/electoral-area-boundary';

interface StationMarker {
  id: string;
  psCode: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

interface ElectoralAreaBoundaryEditorProps {
  areaName: string;
  initialPoints: LatLngPoint[];
  stations: StationMarker[];
  onPointsChange?: (count: number) => void;
  height?: string;
}

export interface ElectoralAreaBoundaryEditorHandle {
  getPoints: () => LatLngPoint[];
}

const DEFAULT_CENTER: [number, number] = [5.355, -0.63];
const DEFAULT_ZOOM = 13;

function roundCoord(value: number) {
  return Math.round(value * 100000) / 100000;
}

const ElectoralAreaBoundaryEditor = forwardRef<ElectoralAreaBoundaryEditorHandle, ElectoralAreaBoundaryEditorProps>(function ElectoralAreaBoundaryEditor({
  areaName,
  initialPoints,
  stations,
  onPointsChange,
  height = 'h-[28rem]',
}, ref) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const polygonRef = useRef<L.Polygon | null>(null);
  const stationLayerRef = useRef<L.LayerGroup | null>(null);
  const vertexLayerRef = useRef<L.LayerGroup | null>(null);
  const mountedRef = useRef(true);
  const [points, setPoints] = useState<LatLngPoint[]>(initialPoints);

  const stationsWithCoords = useMemo(
    () => stations.filter((station) => station.latitude !== null && station.longitude !== null),
    [stations],
  );

  useImperativeHandle(ref, () => ({
    getPoints: () => points,
  }), [points]);

  useEffect(() => {
    setPoints(initialPoints);
  }, [areaName, initialPoints]);

  useEffect(() => {
    onPointsChange?.(points.length);
  }, [onPointsChange, points.length]);

  useEffect(() => {
    mountedRef.current = true;
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, { zoomAnimation: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    stationLayerRef.current = L.layerGroup().addTo(map);
    vertexLayerRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    map.on('click', (event: L.LeafletMouseEvent) => {
      const { lat, lng } = event.latlng;
      setPoints((current) => [...current, [roundCoord(lat), roundCoord(lng)]]);
    });

    return () => {
      mountedRef.current = false;
      map.remove();
      mapInstance.current = null;
      polygonRef.current = null;
      stationLayerRef.current = null;
      vertexLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapRef.current) return;

    // Leaflet maps inside modals need an explicit resize once visible.
    const timer = window.setTimeout(() => {
      if (mountedRef.current && mapInstance.current === map) {
        map.invalidateSize(true);
      }
    }, 50);

    return () => window.clearTimeout(timer);
  }, [areaName]);

  useEffect(() => {
    const map = mapInstance.current;
    const layer = stationLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    stationsWithCoords.forEach((station) => {
      const marker = L.circleMarker([station.latitude!, station.longitude!], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#0f766e',
        fillOpacity: 1,
      }).bindTooltip(`${station.psCode} - ${station.name}`, { direction: 'top' });
      marker.addTo(layer);
    });
  }, [stationsWithCoords]);

  useEffect(() => {
    const map = mapInstance.current;
    const vertexLayer = vertexLayerRef.current;
    if (!map || !vertexLayer) return;

    vertexLayer.clearLayers();

    if (polygonRef.current) {
      polygonRef.current.remove();
      polygonRef.current = null;
    }

    if (points.length >= 3) {
      polygonRef.current = L.polygon(points, {
        color: '#1d4ed8',
        weight: 3,
        fillColor: '#60a5fa',
        fillOpacity: 0.22,
      })
        .bindTooltip(areaName, { sticky: true })
        .addTo(map);
    }

    const vertexIcon = L.divIcon({
      className: 'electoral-area-vertex',
      html: '<div style="width:14px;height:14px;border-radius:9999px;background:#1d4ed8;border:2px solid white;box-shadow:0 1px 6px rgba(0,0,0,0.25)"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    points.forEach((point, index) => {
      const marker = L.marker(point, {
        draggable: true,
        icon: vertexIcon,
      });

      marker.on('drag', (event) => {
        const latlng = (event.target as L.Marker).getLatLng();
        setPoints((current) =>
          current.map((existing, currentIndex) =>
            currentIndex === index
              ? [roundCoord(latlng.lat), roundCoord(latlng.lng)]
              : existing,
          ),
        );
      });

      marker.on('contextmenu', () => {
        setPoints((current) => current.filter((_, currentIndex) => currentIndex !== index));
      });

      marker.addTo(vertexLayer);
    });

    const featureLayers: L.Layer[] = [];
    if (polygonRef.current) featureLayers.push(polygonRef.current);
    featureLayers.push(...vertexLayer.getLayers());
    featureLayers.push(...(stationLayerRef.current?.getLayers() ?? []));

    if (featureLayers.length > 0) {
      const bounds = L.featureGroup(featureLayers).getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.12), { maxZoom: 15 });
      }
    }

  }, [areaName, points]);

  const clearBoundary = () => setPoints([]);
  const undoLastPoint = () => setPoints((current) => current.slice(0, -1));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <div>
          <p className="font-semibold">Define {areaName} boundary</p>
          <p className="text-xs text-blue-700 mt-1">
            Click the map to add boundary points. Drag blue points to adjust. Right-click a point to remove it.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-white/90 px-2.5 py-1 font-medium text-blue-800">
            {points.length} point{points.length === 1 ? '' : 's'}
          </span>
          <span className="rounded-full bg-white/90 px-2.5 py-1 font-medium text-blue-800">
            {stationsWithCoords.length} station{stationsWithCoords.length === 1 ? '' : 's'} on map
          </span>
        </div>
      </div>

      <div ref={mapRef} className={`${height} relative z-0 rounded-xl border border-gray-200`} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          Save requires at least 3 points. Station markers are shown in teal for reference.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={undoLastPoint}
            disabled={points.length === 0}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Undo Point
          </button>
          <button
            type="button"
            onClick={clearBoundary}
            disabled={points.length === 0}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear Boundary
          </button>
        </div>
      </div>
    </div>
  );
});

export default ElectoralAreaBoundaryEditor;
