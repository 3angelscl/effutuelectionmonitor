export type LatLngPoint = [number, number];

interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

function isValidLngLatPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1]) &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

export function serializeBoundary(points: LatLngPoint[]): string | null {
  if (points.length < 3) return null;

  const ring = points.map(([lat, lng]) => [lng, lat]);
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) {
    ring.push([firstLng, firstLat]);
  }

  const polygon: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [ring],
  };

  return JSON.stringify(polygon);
}

export function parseBoundaryGeoJson(boundaryGeoJson: string | null | undefined): LatLngPoint[] {
  if (!boundaryGeoJson) return [];

  try {
    const parsed = JSON.parse(boundaryGeoJson) as GeoJsonPolygon;
    if (parsed.type !== 'Polygon' || !Array.isArray(parsed.coordinates) || parsed.coordinates.length === 0) {
      return [];
    }

    const ring = parsed.coordinates[0];
    if (!Array.isArray(ring) || ring.length < 4) return [];

    const normalized = ring.slice(0, -1).filter(isValidLngLatPair).map(([lng, lat]) => [lat, lng] as LatLngPoint);
    return normalized.length >= 3 ? normalized : [];
  } catch {
    return [];
  }
}

export function isValidBoundaryGeoJson(boundaryGeoJson: string | null | undefined): boolean {
  if (!boundaryGeoJson) return true;
  return parseBoundaryGeoJson(boundaryGeoJson).length >= 3;
}

export function getBoundaryCenter(points: LatLngPoint[]): LatLngPoint | null {
  if (points.length === 0) return null;
  const totals = points.reduce(
    (acc, [lat, lng]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }),
    { lat: 0, lng: 0 },
  );

  return [totals.lat / points.length, totals.lng / points.length];
}
