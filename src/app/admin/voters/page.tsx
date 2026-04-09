'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { fetcher } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { toast } from 'sonner';
import Drawer from '@/components/ui/Drawer';
import {
  MagnifyingGlassIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  FunnelIcon,
  PencilIcon,
  TrashIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';

const PAGE_SIZE = 30;

interface VoterData {
  id: string;
  voterId: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: string | null;
  psCode: string;
  photo: string | null;
  hasVoted: boolean;
  pollingStation: { name: string; psCode: string; electoralArea: string | null };
}

interface VoterSummary {
  total: number;
  ageBands: { label: string; count: number }[];
  genderCounts: { male: number; female: number; unknown: number };
}

interface VoterPage {
  voters: VoterData[];
  total: number;
  page: number;
  totalPages: number;
  summary: VoterSummary;
}

interface UploadPreviewRow {
  rowNum: number;
  voterId: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: 'Male' | 'Female' | null;
  psCode: string;
  photo: string | null;
  stationName: string | null;
  status: 'valid' | 'error';
  errors: string[];
}

interface UploadPreviewResult {
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  canImport: boolean;
  rows: UploadPreviewRow[];
  errors: string[];
}

export default function VoterManagement() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const userRole = (session?.user as { role?: string })?.role;
  const canModify = userRole === 'ADMIN';
  const canUpload = userRole === 'ADMIN';

  // Support search from URL params (e.g. navigating from header search)
  const initialSearch = searchParams.get('search') || '';
  const [search, setSearch] = useState(initialSearch);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [psFilter, setPsFilter] = useState('');
  const [electoralAreaFilter, setElectoralAreaFilter] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<UploadPreviewResult | null>(null);
  const [uploadPreviewing, setUploadPreviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    successCount: number;
    errorCount: number;
    errors: string[];
  } | null>(null);
  const [uploadError, setUploadError] = useState('');

  // Add Modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    voterId: '', firstName: '', lastName: '', age: '', gender: '', photo: '', psCode: ''
  });

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editVoter, setEditVoter] = useState<VoterData | null>(null);
  const [editForm, setEditForm] = useState({
    voterId: '', firstName: '', lastName: '', age: '', gender: '', photo: '',
  });
  const [selectedVoter, setSelectedVoter] = useState<VoterData | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Infinite loading with SWR
  const getKey = (pageIndex: number, prevData: VoterPage | null) => {
    if (prevData && pageIndex >= prevData.totalPages) return null;
    const params = new URLSearchParams({
      page: String(pageIndex + 1),
      limit: String(PAGE_SIZE),
      ...(search && { search }),
      ...(psFilter && { stationId: psFilter }),
      ...(electoralAreaFilter && { electoralArea: electoralAreaFilter }),
    });
    return `/api/voters?${params}`;
  };

  const {
    data: pages,
    size,
    setSize,
    mutate,
    isValidating,
  } = useSWRInfinite<VoterPage>(getKey, fetcher, {
    revalidateFirstPage: true,
    revalidateOnFocus: false,
  });

  const { data: stations } = useSWR('/api/stations', fetcher);

  const allVoters = pages ? pages.flatMap((p) => Array.isArray(p?.voters) ? p.voters : []) : [];
  const total = pages?.[0]?.total || 0;
  const totalPages = pages?.[0]?.totalPages || 1;
  const summary = pages?.[0]?.summary;
  const isLoadingMore = size > 0 && pages && typeof pages[size - 1] === 'undefined';
  const hasMore = size < totalPages;
  const stationOptions = Array.isArray(stations) ? stations : [];
  const electoralAreas = Array.from(new Set(
    stationOptions
      .map((s: { electoralArea?: string | null }) => s.electoralArea)
      .filter((area): area is string => Boolean(area))
  )).sort((a, b) => a.localeCompare(b));
  const filteredStationOptions = electoralAreaFilter
    ? stationOptions.filter((s: { electoralArea?: string | null }) => s.electoralArea === electoralAreaFilter)
    : stationOptions;

  // Infinite scroll observer
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isValidating) {
          setSize((s) => s + 1);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isValidating, setSize]);

  // Reset pages when search/filter changes
  useEffect(() => {
    setSize(1);
  }, [search, psFilter, electoralAreaFilter, setSize]);

  useEffect(() => {
    if (!psFilter) return;
    const stillVisible = filteredStationOptions.some((s: { id: string }) => s.id === psFilter);
    if (!stillVisible) setPsFilter('');
  }, [electoralAreaFilter, filteredStationOptions, psFilter]);

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchInput(e.target.value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSearch(e.target.value);
      }, 400);
    },
    []
  );

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const resetUploadState = useCallback(() => {
    setUploadFile(null);
    setUploadPreview(null);
    setUploadResult(null);
    setUploadError('');
    setUploadPreviewing(false);
    setUploading(false);
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  }, []);

  const closeUploadModal = useCallback(() => {
    setUploadModalOpen(false);
    resetUploadState();
  }, [resetUploadState]);

  const openUploadModal = useCallback(() => {
    resetUploadState();
    setUploadModalOpen(true);
  }, [resetUploadState]);

  const handleUploadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setUploadFile(file);
    setUploadPreview(null);
    setUploadResult(null);
    setUploadError('');
  };

  const handlePreviewUpload = async () => {
    if (!uploadFile) {
      setUploadError('Please choose a file first.');
      return;
    }

    setUploadPreviewing(true);
    setUploadError('');
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);

      const res = await fetch('/api/voters/upload?preview=true', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();

      if (!res.ok) {
        setUploadPreview(result.rows ? {
          fileName: result.fileName || uploadFile.name,
          totalRows: result.totalRows || 0,
          validRows: result.validRows || 0,
          invalidRows: result.invalidRows || 0,
          canImport: false,
          rows: Array.isArray(result.rows) ? result.rows : [],
          errors: Array.isArray(result.errors) ? result.errors : [result.error || 'Preview failed'],
        } : null);
        setUploadError(result.error || 'Preview failed');
        return;
      }

      setUploadPreview({
        fileName: result.fileName || uploadFile.name,
        totalRows: result.totalRows || 0,
        validRows: result.validRows || 0,
        invalidRows: result.invalidRows || 0,
        canImport: Boolean(result.canImport),
        rows: Array.isArray(result.rows) ? result.rows : [],
        errors: Array.isArray(result.errors) ? result.errors : [],
      });
    } catch {
      setUploadError('An unexpected error occurred during preview.');
    } finally {
      setUploadPreviewing(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (!uploadFile) {
      setUploadError('Please choose a file first.');
      return;
    }
    if (!uploadPreview?.canImport) {
      setUploadError('Please resolve the validation errors before uploading.');
      return;
    }

    setUploading(true);
    setUploadResult(null);
    setUploadError('');

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);

      const res = await fetch('/api/voters/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();

      if (!res.ok) {
        if (res.status === 422 && Array.isArray(result.rows)) {
          setUploadPreview({
            fileName: result.fileName || uploadFile.name,
            totalRows: result.totalRows || 0,
            validRows: result.validRows || 0,
            invalidRows: result.invalidRows || 0,
            canImport: false,
            rows: result.rows,
            errors: Array.isArray(result.errors) ? result.errors : [result.error || 'Validation failed'],
          });
        }
        setUploadError(result.error || 'Upload failed');
        return;
      }

      setUploadResult({
        successCount: result.successCount || 0,
        errorCount: result.errorCount || 0,
        errors: Array.isArray(result.errors) ? result.errors : [],
      });
      mutate();
      toast.success('Voter register imported successfully');
    } catch {
      setUploadResult({ successCount: 0, errorCount: 1, errors: ['An unexpected error occurred during upload.'] });
    } finally {
      setUploading(false);
    }
  };

  // --- Edit Voter ---
  const openEditModal = (voter: VoterData) => {
    setEditVoter(voter);
    setEditForm({
      voterId: voter.voterId,
      firstName: voter.firstName,
      lastName: voter.lastName,
      age: String(voter.age),
      gender: voter.gender || '',
      photo: voter.photo || '',
    });
    setError('');
    setEditModalOpen(true);
  };

  const openVoterDrawer = (voter: VoterData) => {
    setSelectedVoter(voter);
  };

  const closeVoterDrawer = () => {
    setSelectedVoter(null);
  };

  const openDrawerEdit = () => {
    if (!selectedVoter) return;
    const voter = selectedVoter;
    closeVoterDrawer();
    openEditModal(voter);
  };

  const openDrawerDelete = () => {
    if (!selectedVoter) return;
    setDeleteTarget(selectedVoter.id);
    closeVoterDrawer();
  };

  const handlePhotoUpload = async (file: File, isAdd: boolean = false) => {
    const voterId = (isAdd ? addForm.voterId : editForm.voterId).trim();
    if (!voterId) {
      setError('Enter the voter ID before uploading a photo');
      return;
    }

    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('voterId', voterId);
      const res = await fetch('/api/voters/photo', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to upload photo');
        return;
      }
      const { url } = await res.json();
      if (isAdd) {
        setAddForm((f) => ({ ...f, photo: url }));
      } else {
        setEditForm((f) => ({ ...f, photo: url }));
      }
    } catch {
      setError('Failed to upload photo');
    } finally {
      setPhotoUploading(false);
    }
  };

  const openAddModal = () => {
    setAddForm({
      voterId: '',
      firstName: '',
      lastName: '',
      age: '',
      gender: '',
      photo: '',
      psCode: psFilter || '', // Default to current filter station
    });
    setError('');
    setAddModalOpen(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/voters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add voter');
        return;
      }
      // Search for the new voter by name so they appear at the top of the list
      const newSearch = addForm.lastName;
      setSearchInput(newSearch);
      setSearch(newSearch);
      mutate();
      toast.success('Voter added successfully');
      setAddModalOpen(false);
    } catch (err) {
      console.error('Fetch error:', err);
      setError('An error occurred');
    } finally {
      setAdding(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editVoter) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/voters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editVoter.id,
          voterId: editForm.voterId,
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          age: editForm.age,
          gender: editForm.gender,
          photo: editForm.photo,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update voter');
        return;
      }
      mutate();
      toast.success('Voter updated');
      setEditModalOpen(false);
      setEditVoter(null);
    } catch {
      setError('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  // --- Delete Voter ---
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/voters?id=${deleteTarget}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete voter');
        return;
      }
      mutate();
      toast.success('Voter deleted');
    } catch {
      toast.error('Failed to delete voter. Please try again.');
    } finally {
      setDeleteTarget(null);
    }
  };

  // --- Delete All Voters ---
  const [deleteAllPassword, setDeleteAllPassword] = useState('');
  const [deleteAllPasswordError, setDeleteAllPasswordError] = useState('');

  const handleDeleteAll = async () => {
    if (!deleteAllPassword) {
      setDeleteAllPasswordError('Please enter your password to confirm');
      return;
    }
    setDeleteAllPasswordError('');
    setDeletingAll(true);
    try {
      const params = new URLSearchParams();
      if (psFilter) params.set('stationId', psFilter);
      if (electoralAreaFilter) params.set('electoralArea', electoralAreaFilter);
      params.set('deleteAll', 'true');
      const res = await fetch(`/api/voters?${params}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deleteAllPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (data.error === 'Invalid password') {
          setDeleteAllPasswordError('Incorrect password. Please try again.');
        } else {
          toast.error(data.error || 'Failed to delete voters');
        }
        return;
      }
      const data = await res.json();
      toast.success(`Successfully deleted ${data.deletedCount} voters`);
      mutate();
      setDeleteAllOpen(false);
      setDeleteAllPassword('');
    } catch {
      toast.error('Failed to delete voters. Please try again.');
    } finally {
      setDeletingAll(false);
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-orange-500',
      'bg-teal-600', 'bg-rose-600', 'bg-indigo-600', 'bg-amber-600',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const deleteAllLabel = psFilter
    ? `all voters at this station`
    : electoralAreaFilter
      ? `all voters in ${electoralAreaFilter}`
    : `all ${total.toLocaleString()} voters`;
  const chartTotal = summary?.total || total;
  const ageBands = summary?.ageBands || [];
  const genderCounts = summary?.genderCounts || { male: 0, female: 0, unknown: 0 };
  const genderKnownTotal = genderCounts.male + genderCounts.female;
  const malePct = genderKnownTotal > 0 ? (genderCounts.male / genderKnownTotal) * 100 : 0;
  const femalePct = genderKnownTotal > 0 ? (genderCounts.female / genderKnownTotal) * 100 : 0;
  const agePeak = Math.max(1, ...ageBands.map((band) => band.count));
  const ageBarColors = ['bg-emerald-500', 'bg-sky-500', 'bg-amber-500', 'bg-violet-500', 'bg-rose-500'];

  return (
    <div className="flex-1">
      <AdminHeader title="Voters Register" />

      <div className="p-4 md:p-6 space-y-6">
        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between flex-wrap gap-4">
          <div className="flex items-center flex-wrap gap-3">
            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by voter ID or name..."
                value={searchInput}
                onChange={handleSearch}
                className="pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-lg w-full sm:w-65 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            {/* Station Filter */}
            <div className="relative">
              <FunnelIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                value={psFilter}
                onChange={(e) => {
                  setPsFilter(e.target.value);
                }}
                className="pl-10 pr-8 py-2.5 text-sm bg-white border border-gray-200 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              >
                <option value="">All Stations</option>
                {filteredStationOptions.map((s: { id: string; psCode: string; name: string }) => (
                  <option key={s.id} value={s.id}>
                    {s.psCode} - {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <FunnelIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                value={electoralAreaFilter}
                onChange={(e) => setElectoralAreaFilter(e.target.value)}
                className="pl-10 pr-8 py-2.5 text-sm bg-white border border-gray-200 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              >
                <option value="">Electoral Areas</option>
                {electoralAreas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {canModify && total > 0 && (
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                icon={<TrashIcon className="h-4 w-4" />}
                onClick={() => setDeleteAllOpen(true)}
              >
                Delete All
              </Button>
            )}
            {canUpload && (
              <Button
                variant="outline"
                icon={<ArrowDownTrayIcon className="h-4 w-4" />}
                onClick={() => {
                  const params = new URLSearchParams({ format: 'xlsx' });
                  if (psFilter) params.set('stationId', psFilter);
                  if (electoralAreaFilter) params.set('electoralArea', electoralAreaFilter);
                  if (search) params.set('search', search);
                  window.open(`/api/voters/export?${params.toString()}`, '_blank');
                }}
              >
                Export
              </Button>
            )}
            {canUpload && (
              <Button
                variant="outline"
                icon={<ArrowUpTrayIcon className="h-4 w-4" />}
                onClick={openUploadModal}
              >
                Upload
              </Button>
            )}
            {canModify && (
              <Button
                variant="primary"
                className="bg-indigo-600 hover:bg-indigo-700"
                icon={<MagnifyingGlassIcon className="h-4 w-4 rotate-45" />}
                onClick={openAddModal}
              >
                Add Voter
              </Button>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card className="bg-gradient-to-br from-white to-slate-50">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Voters Found</p>
                <p className="text-3xl font-semibold text-gray-900">{chartTotal.toLocaleString()}</p>
                <p className="text-sm text-gray-500 mt-1">Filtered by station, electoral area, or search term.</p>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p>Male: {genderCounts.male.toLocaleString()}</p>
                <p>Female: {genderCounts.female.toLocaleString()}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">Age Demographics</h2>
                <span className="text-xs text-gray-500">18+ voters</span>
              </div>
              <div className="space-y-2">
                {ageBands.map((band) => {
                  const width = `${Math.max(6, Math.round((band.count / agePeak) * 100))}%`;
                  const colorClass = ageBarColors[ageBands.findIndex((item) => item.label === band.label) % ageBarColors.length];
                  return (
                    <div key={band.label} className="grid grid-cols-[72px_1fr_56px] items-center gap-3">
                      <span className="text-xs font-medium text-gray-500">{band.label}</span>
                      <div className="h-4 rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${colorClass}`}
                          style={{ width }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-600 text-right">
                        {band.count.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
                {ageBands.length === 0 && (
                  <p className="text-sm text-gray-500">No age data available yet.</p>
                )}
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-white to-slate-50">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Gender</p>
                <p className="text-2xl font-semibold text-gray-900">Male / Female</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4">
              <div
                className="relative h-48 w-48 rounded-full"
                style={{
                  background: genderKnownTotal > 0
                    ? `conic-gradient(#2563eb 0 ${malePct}%, #f43f5e ${malePct}% ${malePct + femalePct}%)`
                    : 'conic-gradient(#e5e7eb 0 100%)',
                }}
              >
                <div className="absolute inset-8 rounded-full bg-white shadow-sm flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-semibold text-gray-900">{genderKnownTotal.toLocaleString()}</span>
                  <span className="text-xs text-gray-500">Known gender records</span>
                </div>
              </div>
              <div className="grid w-full grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-blue-900">Male</span>
                    <span className="text-xs font-semibold text-blue-700">{malePct.toFixed(2)}%</span>
                  </div>
                  <p className="mt-1 text-lg font-semibold text-blue-950">{genderCounts.male.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-rose-900">Female</span>
                    <span className="text-xs font-semibold text-rose-700">{femalePct.toFixed(2)}%</span>
                  </div>
                  <p className="mt-1 text-lg font-semibold text-rose-950">{genderCounts.female.toLocaleString()}</p>
                </div>
              </div>
              {genderCounts.unknown > 0 && (
                <p className="text-xs text-gray-500">{genderCounts.unknown.toLocaleString()} records still need a gender value.</p>
              )}
            </div>
          </Card>
        </div>

        {/* Voters Table */}
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Voter</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Voter ID</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Age</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Gender</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Electoral Area</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">PS Code</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Station</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  {canModify && <th className="text-center py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {allVoters.map((voter) => (
                  <tr
                    key={voter.id}
                    className="border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50 focus-within:bg-gray-50"
                    onClick={() => openVoterDrawer(voter)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openVoterDrawer(voter);
                      }
                    }}
                    tabIndex={0}
                    aria-label={`View details for ${voter.firstName} ${voter.lastName}`}
                  >
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-3">
                        {voter.photo ? (
                          <img
                            src={voter.photo}
                            alt={`${voter.firstName} ${voter.lastName}`}
                            className="w-9 h-9 rounded-full object-cover shrink-0 border border-gray-200"
                          />
                        ) : (
                          <div className={`w-9 h-9 ${getAvatarColor(voter.firstName + voter.lastName)} rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                            {getInitials(voter.firstName, voter.lastName)}
                          </div>
                        )}
                        <span className="font-medium text-gray-900">
                          {voter.firstName} {voter.lastName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-gray-700">{voter.voterId}</td>
                    <td className="py-3 px-4 text-center text-gray-600">{voter.age}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                        voter.gender === 'Male'
                          ? 'bg-emerald-50 text-emerald-700'
                          : voter.gender === 'Female'
                            ? 'bg-pink-50 text-pink-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}>
                        {voter.gender || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {voter.pollingStation.electoralArea || 'Unassigned'}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">{voter.psCode}</td>
                    <td className="py-3 px-4 text-gray-600">{voter.pollingStation.name}</td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant={voter.hasVoted ? 'success' : 'neutral'} size="sm">
                        {voter.hasVoted ? 'Voted' : 'Not Voted'}
                      </Badge>
                    </td>
                    {canModify && (
                      <td className="py-3 px-6 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(voter);
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit voter"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(voter.id);
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete voter"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {allVoters.length === 0 && !isValidating && (
                  <tr>
                    <td colSpan={canModify ? 9 : 8} className="py-12 text-center text-gray-500">
                      {search || psFilter || electoralAreaFilter ? 'No voters found matching your filters' : 'No voters registered yet. Upload a voter register to get started.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />

          {/* Loading indicator */}
          {(isLoadingMore || isValidating) && allVoters.length > 0 && (
            <div className="py-4 text-center">
              <div className="inline-flex items-center gap-2 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
                Loading more voters...
              </div>
            </div>
          )}

          {/* End of list */}
          {!hasMore && allVoters.length > 0 && (
            <div className="py-3 text-center text-xs text-gray-400">
              Showing all {total.toLocaleString()} voters
            </div>
          )}
        </Card>
      </div>

      <Drawer
        isOpen={!!selectedVoter}
        onClose={closeVoterDrawer}
        title="Voter Details"
        size="lg"
      >
        {selectedVoter && (
          <div className="p-6 space-y-6">
            <div className="flex items-start gap-4">
              {selectedVoter.photo ? (
                <img
                  src={selectedVoter.photo}
                  alt={`${selectedVoter.firstName} ${selectedVoter.lastName}`}
                  className="w-20 h-20 rounded-2xl object-cover border border-gray-200 shadow-sm"
                />
              ) : (
                <div className={`w-20 h-20 ${getAvatarColor(selectedVoter.firstName + selectedVoter.lastName)} rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-sm`}>
                  {getInitials(selectedVoter.firstName, selectedVoter.lastName)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-2xl font-semibold text-gray-900 truncate">
                  {selectedVoter.firstName} {selectedVoter.lastName}
                </p>
                <p className="text-sm text-gray-500 font-mono">{selectedVoter.voterId}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant={selectedVoter.hasVoted ? 'success' : 'neutral'} size="sm">
                    {selectedVoter.hasVoted ? 'Voted' : 'Not Voted'}
                  </Badge>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    selectedVoter.gender === 'Male'
                      ? 'bg-blue-50 text-blue-700'
                      : selectedVoter.gender === 'Female'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedVoter.gender || 'Unknown'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Age</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{selectedVoter.age}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Gender</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{selectedVoter.gender || 'Unknown'}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Polling Station</p>
                <p className="mt-1 text-base font-semibold text-gray-900">{selectedVoter.pollingStation.name}</p>
                <p className="text-sm text-gray-500 font-mono">{selectedVoter.psCode}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Electoral Area</p>
                <p className="mt-1 text-sm text-gray-900">{selectedVoter.pollingStation.electoralArea || 'Unassigned'}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Photo</p>
              {selectedVoter.photo ? (
                <a
                  href={selectedVoter.photo}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  Open voter photo
                </a>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No photo has been uploaded for this voter yet.</p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              {canModify && (
                <>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={openDrawerEdit}
                  >
                    Edit Voter
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    onClick={openDrawerDelete}
                  >
                    Delete Voter
                  </Button>
                </>
              )}
              {!canModify && (
                <Button variant="secondary" className="flex-1" onClick={closeVoterDrawer}>
                  Close
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Add Voter Modal */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Register Individual Voter">
        <form onSubmit={handleAdd} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          {/* Photo Upload */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Voter Photo
            </label>
            <div className="flex items-center gap-4">
              {addForm.photo ? (
                <img
                  src={addForm.photo}
                  alt="Preview"
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                  <PhotoIcon className="h-6 w-6 text-gray-400" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 transition-colors inline-block text-center">
                  {photoUploading ? 'Uploading...' : addForm.photo ? 'Change Photo' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    disabled={photoUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file, true);
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="mt-3">
              <Input
                label="Photo URL"
                value={addForm.photo}
                onChange={(e) => setAddForm((f) => ({ ...f, photo: e.target.value }))}
                placeholder="Paste a Cloudinary or public image URL"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Optional. You can paste a Cloudinary URL instead of uploading a file.
              </p>
            </div>
          </div>

          <Input
            label="Voter ID"
            value={addForm.voterId}
            onChange={(e) => setAddForm((f) => ({ ...f, voterId: e.target.value }))}
            placeholder="e.g., 2345678901"
            required
          />
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={addForm.firstName}
              onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))}
              required
            />
            <Input
              label="Last Name"
              value={addForm.lastName}
              onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Age"
              type="number"
              value={addForm.age}
              onChange={(e) => setAddForm((f) => ({ ...f, age: e.target.value }))}
              required
            />
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                Gender
              </label>
              <select
                value={addForm.gender}
                onChange={(e) => setAddForm((f) => ({ ...f, gender: e.target.value }))}
                required
                className="w-full h-11 px-4 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Polling Station
            </label>
            <select
              value={addForm.psCode}
              onChange={(e) => setAddForm((f) => ({ ...f, psCode: e.target.value }))}
              required
              className="w-full h-11 px-4 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="">Select Polling Station</option>
              {(Array.isArray(stations) ? stations : []).map((s: { id: string; psCode: string; name: string; electoralArea?: string | null }) => (
                <option key={s.id} value={s.psCode}>
                  {s.psCode} - {s.name}
                  {s.electoralArea ? ` (${s.electoralArea})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button variant="secondary" type="button" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={adding}>
              Create Voter
            </Button>
          </div>
        </form>
      </Modal>

            {/* Upload Modal */}
      <Modal
        isOpen={uploadModalOpen}
        onClose={closeUploadModal}
        title="Upload Voter Register"
        size="xl"
      >
        <div className="space-y-4">
          {uploadError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {uploadError}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">CSV columns</p>
            <code className="block text-xs text-blue-700">voter_id, first_name, last_name, age, gender, ps_code, photo_url (optional)</code>
            <p className="text-[11px] text-blue-700">
              `gender` must be Male or Female. `photo_url` can be a Cloudinary URL or any public image URL. Leave it blank if the voter has no photo yet.
              Preview the file first to catch row-level errors before importing.
            </p>
            <button
              type="button"
              onClick={() => {
                const csv = 'voter_id,first_name,last_name,age,gender,ps_code,photo_url\nV001,John,Mensah,35,Male,B100101,https://res.cloudinary.com/demo/image/upload/v1/voter-photos/v001.jpg\nV002,Abena,Asante,42,Female,B100101,\n';
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'voter_register_template.csv';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 underline"
            >
              <ArrowDownTrayIcon className="h-3.5 w-3.5" />
              Download CSV Template
            </button>
          </div>

          <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center hover:border-primary-500 transition-colors">
            <ArrowUpTrayIcon className="h-8 w-8 text-gray-400 mx-auto mb-3" />
            <input
              type="file"
              name="file"
              accept=".csv,.xlsx,.xls"
              required
              ref={uploadInputRef}
              className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 file:font-medium hover:file:bg-primary-100"
              onChange={handleUploadFileChange}
            />
            <p className="text-xs text-gray-500 mt-2">CSV or Excel (.xlsx/.xls) accepted · max 10 MB</p>
            {uploadFile && (
              <p className="mt-2 text-xs font-medium text-gray-700">
                Selected file: <span className="text-gray-900">{uploadFile.name}</span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handlePreviewUpload}
              loading={uploadPreviewing}
              disabled={!uploadFile || uploading}
            >
              Preview & Validate
            </Button>
            <Button
              type="button"
              onClick={handleConfirmUpload}
              loading={uploading}
              disabled={!uploadFile || !uploadPreview?.canImport || uploadPreviewing}
            >
              Import Voters
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={closeUploadModal}
              disabled={uploadPreviewing || uploading}
            >
              {uploadResult ? 'Close' : 'Cancel'}
            </Button>
          </div>

          {uploadPreview && (
            <div className="space-y-4">
              <div className={`grid gap-3 md:grid-cols-4 rounded-lg border p-4 ${
                uploadPreview.invalidRows > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'
              }`}>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">File</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{uploadPreview.fileName}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Total rows</p>
                  <p className="text-sm font-semibold text-gray-900">{uploadPreview.totalRows.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Valid rows</p>
                  <p className="text-sm font-semibold text-green-700">{uploadPreview.validRows.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Invalid rows</p>
                  <p className="text-sm font-semibold text-amber-700">{uploadPreview.invalidRows.toLocaleString()}</p>
                </div>
              </div>

              {!uploadPreview.canImport && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Fix the validation errors below before importing. The upload is blocked until the preview is clean.
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Row</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Voter</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Station</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Gender</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Photo</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadPreview.rows.map((row) => (
                      <tr key={row.rowNum} className="border-b border-gray-100 last:border-b-0 align-top">
                        <td className="px-4 py-3 text-gray-500">{row.rowNum}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{row.firstName} {row.lastName}</p>
                          <p className="text-xs text-gray-500 font-mono">{row.voterId}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          <p>{row.stationName || row.psCode}</p>
                          <p className="text-xs text-gray-500 font-mono">{row.psCode}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.gender === 'Male'
                              ? 'bg-blue-50 text-blue-700'
                              : row.gender === 'Female'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-gray-100 text-gray-600'
                          }`}>
                            {row.gender || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{row.photo ? 'Provided' : 'Not provided'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={row.status === 'valid' ? 'success' : 'neutral'} size="sm">
                            {row.status === 'valid' ? 'Valid' : 'Needs fix'}
                          </Badge>
                          {row.errors.length > 0 && (
                            <p className="mt-1 text-xs text-red-600">{row.errors.join('; ')}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {uploadPreview.totalRows > uploadPreview.rows.length && (
                <p className="text-xs text-gray-500">
                  Showing the first {uploadPreview.rows.length} rows of {uploadPreview.totalRows.toLocaleString()}.
                </p>
              )}

              {Array.isArray(uploadPreview.errors) && uploadPreview.errors.length > 0 && (
                <details className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs">
                  <summary className="cursor-pointer font-medium text-red-700">
                    View validation errors ({uploadPreview.errors.length})
                  </summary>
                  <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto text-red-700">
                    {uploadPreview.errors.map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {uploadResult && (
            <div className={`rounded-lg border p-4 space-y-2 ${
              uploadResult.errorCount > 0 && uploadResult.successCount === 0
                ? 'bg-red-50 border-red-200'
                : uploadResult.errorCount > 0
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-green-50 border-green-200'
            }`}>
              <div className="flex items-center gap-2">
                {uploadResult.successCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-700">
                    ? {uploadResult.successCount} voters imported
                  </span>
                )}
                {uploadResult.errorCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-700 ml-auto">
                    {uploadResult.errorCount} errors
                  </span>
                )}
              </div>
              {(uploadResult.errors?.length ?? 0) > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-red-700 font-medium mb-1">View errors ({uploadResult.errors?.length})</summary>
                  <ul className="space-y-0.5 max-h-40 overflow-y-auto text-red-700 bg-red-50 rounded p-2">
                    {uploadResult.errors?.map((err, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-red-400 shrink-0">•</span>
                        {err}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </Modal>
      {/* Edit Voter Modal */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Voter">
        <form onSubmit={handleEdit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          {editVoter && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">
                Station: {editVoter.pollingStation.psCode} - {editVoter.pollingStation.name}
                {editVoter.pollingStation.electoralArea ? ` Â· ${editVoter.pollingStation.electoralArea}` : ''}
              </p>
            </div>
          )}

          {/* Photo Upload */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Voter Photo
            </label>
            <div className="flex items-center gap-4">
              {editForm.photo ? (
                <img
                  src={editForm.photo}
                  alt="Preview"
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                  <PhotoIcon className="h-6 w-6 text-gray-400" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 transition-colors inline-block text-center">
                  {photoUploading ? 'Uploading...' : editForm.photo ? 'Change Photo' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    disabled={photoUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file, false);
                    }}
                  />
                </label>
                {editForm.photo && (
                  <button
                    type="button"
                    onClick={() => setEditForm((f) => ({ ...f, photo: '' }))}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3">
              <Input
                label="Photo URL"
                value={editForm.photo}
                onChange={(e) => setEditForm((f) => ({ ...f, photo: e.target.value }))}
                placeholder="Paste a Cloudinary or public image URL"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Optional. You can paste a Cloudinary URL instead of uploading a file.
              </p>
            </div>
          </div>

          <Input
            label="Voter ID"
            value={editForm.voterId}
            onChange={(e) => setEditForm((f) => ({ ...f, voterId: e.target.value }))}
            placeholder="10-digit voter ID"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={editForm.firstName}
              onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
              required
            />
            <Input
              label="Last Name"
              value={editForm.lastName}
              onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Age"
              type="number"
              value={editForm.age}
              onChange={(e) => setEditForm((f) => ({ ...f, age: e.target.value }))}
              required
            />
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                Gender
              </label>
              <select
                value={editForm.gender}
                onChange={(e) => setEditForm((f) => ({ ...f, gender: e.target.value }))}
                required
                className="w-full h-11 px-4 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <Button variant="secondary" type="button" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Voter"
        message="Are you sure you want to delete this voter?"
        confirmLabel="Delete"
        variant="danger"
      />

      <Modal
        isOpen={deleteAllOpen}
        onClose={() => { setDeleteAllOpen(false); setDeleteAllPassword(''); setDeleteAllPasswordError(''); }}
        title="Delete All Voters"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-red-50 shrink-0">
              <TrashIcon className="h-6 w-6 text-red-500" />
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Are you sure you want to permanently delete {deleteAllLabel}? This will also delete all associated turnout records. This action cannot be undone.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Enter your password to confirm
            </label>
            <input
              type="password"
              value={deleteAllPassword}
              onChange={(e) => { setDeleteAllPassword(e.target.value); setDeleteAllPasswordError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDeleteAll(); }}
              placeholder="Your admin password"
              className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 ${
                deleteAllPasswordError
                  ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500'
                  : 'border-gray-200 focus:ring-primary-500/20 focus:border-primary-500'
              }`}
              autoFocus
            />
            {deleteAllPasswordError && (
              <p className="text-xs text-red-600 mt-1">{deleteAllPasswordError}</p>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="secondary"
              onClick={() => { setDeleteAllOpen(false); setDeleteAllPassword(''); setDeleteAllPasswordError(''); }}
              disabled={deletingAll}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteAll}
              loading={deletingAll}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={!deleteAllPassword}
            >
              Delete All
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

