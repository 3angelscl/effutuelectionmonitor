'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { TrashIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface TallyPhoto {
  id: string;
  photoUrl: string;
  caption: string | null;
  createdAt: string;
  user: { id: string; name: string; role: string };
  station: { id: string; psCode: string; name: string };
}

interface Station {
  id: string;
  psCode: string;
  name: string;
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export default function TallyPhotosPage() {
  const [selectedStationId, setSelectedStationId] = useState('');
  const [search, setSearch] = useState('');
  const [lightboxPhoto, setLightboxPhoto] = useState<TallyPhoto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Build query params
  const photosParams = new URLSearchParams();
  if (selectedStationId) photosParams.set('stationId', selectedStationId);
  photosParams.set('limit', '50');

  const { data: photosData, mutate: mutatePhotos, isLoading: photosLoading } = useSWR<{
    photos: TallyPhoto[];
    total: number;
    page: number;
    totalPages: number;
  }>(`/api/tally-photos?${photosParams.toString()}`, fetcher, { refreshInterval: 30000 });

  const { data: stationsRaw } = useSWR<{ id: string; psCode: string; name: string }[]>(
    '/api/stations',
    fetcher
  );

  const stations: Station[] = (Array.isArray(stationsRaw) ? stationsRaw : []).map((s) => ({
    id: s.id,
    psCode: s.psCode,
    name: s.name,
  }));

  const allPhotos: TallyPhoto[] = photosData?.photos || [];

  // Client-side search filter (by station name/code or agent name)
  const photos = search.trim()
    ? allPhotos.filter((p) => {
        const q = search.toLowerCase();
        return (
          p.station.psCode.toLowerCase().includes(q) ||
          p.station.name.toLowerCase().includes(q) ||
          p.user.name.toLowerCase().includes(q) ||
          (p.caption || '').toLowerCase().includes(q)
        );
      })
    : allPhotos;

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const res = await fetch(`/api/tally-photos?id=${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const body = await res.json();
          alert(body.error || 'Failed to delete photo');
          return;
        }
        await mutatePhotos();
        if (lightboxPhoto?.id === id) setLightboxPhoto(null);
      } finally {
        setDeletingId(null);
        setConfirmDeleteId(null);
      }
    },
    [mutatePhotos, lightboxPhoto]
  );

  return (
    <div className="flex-1">
      <AdminHeader title="Tally Photos" />

      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Tally Sheet Photos</h2>
          <p className="text-sm text-gray-500 mt-1">
            {photosData?.total ?? 0} photo{photosData?.total !== 1 ? 's' : ''} uploaded by field agents
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-xs">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search station or agent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          <select
            value={selectedStationId}
            onChange={(e) => setSelectedStationId(e.target.value)}
            className="py-2 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-w-[180px]"
          >
            <option value="">All Stations</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.psCode} — {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Photo grid */}
        {photosLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-64 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-500">No tally photos found</p>
              {(search || selectedStationId) && (
                <button
                  onClick={() => { setSearch(''); setSelectedStationId(''); }}
                  className="mt-2 text-sm text-primary-600 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden group"
              >
                {/* Thumbnail */}
                <div
                  className="relative h-48 bg-gray-100 cursor-pointer overflow-hidden"
                  onClick={() => setLightboxPhoto(photo)}
                >
                  <img
                    src={photo.photoUrl}
                    alt={photo.caption || `Tally sheet from ${photo.station.psCode}`}
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23f3f4f6"/%3E%3Ctext x="50" y="55" text-anchor="middle" fill="%239ca3af" font-size="12"%3ENo preview%3C/text%3E%3C/svg%3E';
                    }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                </div>

                {/* Card body */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {photo.station.psCode}
                        {' — '}
                        {photo.station.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        by {photo.user.name}
                      </p>
                      {photo.caption && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{photo.caption}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setConfirmDeleteId(photo.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      title="Delete photo"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{getTimeAgo(photo.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox modal */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="relative max-w-4xl w-full bg-white rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {lightboxPhoto.station.psCode} — {lightboxPhoto.station.name}
                </h3>
                <p className="text-sm text-gray-500">
                  Uploaded by {lightboxPhoto.user.name} · {getTimeAgo(lightboxPhoto.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfirmDeleteId(lightboxPhoto.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete photo"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setLightboxPhoto(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="bg-gray-900 flex items-center justify-center max-h-[70vh]">
              <img
                src={lightboxPhoto.photoUrl}
                alt={lightboxPhoto.caption || 'Tally sheet'}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
            {lightboxPhoto.caption && (
              <div className="px-6 py-3 text-sm text-gray-600 border-t border-gray-100">
                {lightboxPhoto.caption}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm delete modal */}
      <Modal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete Photo"
        size="sm"
      >
        <p className="text-gray-600 text-sm mb-6">
          Are you sure you want to delete this tally photo? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => setConfirmDeleteId(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
            disabled={deletingId === confirmDeleteId}
          >
            {deletingId === confirmDeleteId ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
