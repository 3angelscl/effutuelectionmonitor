'use client';

import { useState, useRef } from 'react';
import { fetcher } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { toast } from 'sonner';
import {
  PhotoIcon,
  ArrowUpTrayIcon,
  XMarkIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

interface TallyPhoto {
  id: string;
  photoUrl: string;
  caption: string | null;
  createdAt: string;
  user: { id: string; name: string; role: string };
  station: { id: string; psCode: string; name: string };
  election: { id: string; name: string } | null;
}

interface StationData {
  id: string;
  psCode: string;
  name: string;
  agentId: string | null;
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AgentTallyPhotosPage() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string })?.id;

  const { data: stations } = useSWR<StationData[]>('/api/stations', fetcher);
  const station = (Array.isArray(stations) ? stations : []).find((s) => s.agentId === userId);

  const { data: photosData, mutate: mutatePhotos } = useSWR<{ photos: TallyPhoto[]; total: number }>(
    '/api/tally-photos',
    fetcher,
    { refreshInterval: 30000 }
  );

  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<TallyPhoto | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const photos = photosData?.photos || [];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      toast.error('Only JPG and PNG files are allowed');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. Maximum 10MB.');
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCaption('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (caption.trim()) formData.append('caption', caption.trim());

      const res = await fetch('/api/tally-photos', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to upload photo');
        return;
      }

      toast.success('Tally sheet photo uploaded successfully');
      handleClearFile();
      mutatePhotos();
    } catch {
      toast.error('Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (!station) {
    return (
      <div className="p-6">
        <Card className="text-center py-12">
          <PhotoIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No polling station assigned</p>
          <p className="text-gray-400 text-sm mt-1">Contact your administrator for station assignment.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900">Tally Sheet Photos</h2>
        <p className="text-gray-500 text-sm mt-1">
          {station.name} ({station.psCode}) &middot; Upload photos of your official tally sheet
        </p>
      </div>

      {/* Upload Card */}
      <Card>
        <h3 className="text-base font-semibold text-gray-900 mb-4">Upload Tally Sheet Photo</h3>

        {!selectedFile ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-colors"
          >
            <ArrowUpTrayIcon className="h-10 w-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">Click to select a photo</p>
            <p className="text-xs text-gray-400 mt-1">JPG or PNG, max 10MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Preview */}
            <div className="relative rounded-xl overflow-hidden border border-gray-200">
              {preview && (
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full max-h-64 object-contain bg-gray-50"
                />
              )}
              <button
                onClick={handleClearFile}
                className="absolute top-2 right-2 w-8 h-8 bg-white rounded-full shadow flex items-center justify-center hover:bg-gray-100"
              >
                <XMarkIcon className="h-4 w-4 text-gray-600" />
              </button>
            </div>

            {/* Caption */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Caption <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="e.g. Final count tally sheet page 1"
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                maxLength={200}
              />
            </div>

            <Button
              onClick={handleUpload}
              loading={uploading}
              className="w-full bg-green-600 hover:bg-green-700"
              icon={<CheckCircleIcon className="h-4 w-4" />}
            >
              {uploading ? 'Uploading...' : 'Upload Photo'}
            </Button>
          </div>
        )}
      </Card>

      {/* Uploaded Photos Gallery */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">
            Uploaded Photos
            {photos.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">({photos.length})</span>
            )}
          </h3>
        </div>

        {photos.length === 0 ? (
          <Card className="text-center py-10">
            <PhotoIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No tally photos uploaded yet</p>
            <p className="text-xs text-gray-400 mt-1">Photos you upload will appear here</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
                onClick={() => setLightboxPhoto(photo)}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                  <img
                    src={photo.photoUrl}
                    alt={photo.caption || 'Tally photo'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/uploads/placeholder.png'; }}
                  />
                </div>
                <div className="p-3">
                  {photo.caption && (
                    <p className="text-sm font-medium text-gray-900 truncate mb-1">{photo.caption}</p>
                  )}
                  {photo.election && (
                    <p className="text-xs text-gray-500 truncate mb-1">{photo.election.name}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">{getTimeAgo(photo.createdAt)}</p>
                    <Badge variant="info" size="sm">{photo.station.psCode}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="bg-white rounded-2xl overflow-hidden max-w-2xl w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxPhoto.photoUrl}
              alt={lightboxPhoto.caption || 'Tally photo'}
              className="w-full max-h-[70vh] object-contain bg-gray-900"
            />
            <div className="p-4">
              {lightboxPhoto.caption && (
                <p className="font-medium text-gray-900 mb-1">{lightboxPhoto.caption}</p>
              )}
              <div className="flex items-center justify-between text-sm text-gray-500">
                <div>
                  <span>Station: {lightboxPhoto.station.psCode} — {lightboxPhoto.station.name}</span>
                  {lightboxPhoto.election && (
                    <span className="block text-xs text-gray-400">{lightboxPhoto.election.name}</span>
                  )}
                </div>
                <span>{getTimeAgo(lightboxPhoto.createdAt)}</span>
              </div>
              <button
                onClick={() => setLightboxPhoto(null)}
                className="mt-4 w-full py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
