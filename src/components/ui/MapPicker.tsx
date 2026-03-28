'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapPickerProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
  height?: string;
}

// Effutu constituency center
const DEFAULT_CENTER: [number, number] = [5.355, -0.630];
const DEFAULT_ZOOM = 14;

export default function MapPicker({ latitude, longitude, onChange, height = 'h-64' }: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const center: [number, number] = latitude && longitude
      ? [latitude, longitude]
      : DEFAULT_CENTER;

    const map = L.map(mapRef.current).setView(center, DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // Custom marker icon
    const icon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
    });

    if (latitude && longitude) {
      markerRef.current = L.marker([latitude, longitude], { icon }).addTo(map);
    }

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
      }
      onChange(Math.round(lat * 10000) / 10000, Math.round(lng * 10000) / 10000);
    });

    mapInstance.current = map;
    setReady(true);

    return () => {
      map.remove();
      mapInstance.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker when props change externally
  useEffect(() => {
    if (!ready || !mapInstance.current) return;
    if (latitude && longitude && markerRef.current) {
      markerRef.current.setLatLng([latitude, longitude]);
    }
  }, [latitude, longitude, ready]);

  return (
    <div>
      <div ref={mapRef} className={`${height} rounded-lg border border-gray-200 z-0`} />
      <p className="text-xs text-gray-400 mt-1">Click on the map to set the station location</p>
    </div>
  );
}
