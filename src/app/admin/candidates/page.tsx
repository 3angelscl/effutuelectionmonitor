'use client';

import { useState } from 'react';
import { fetcher } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { toast } from 'sonner';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  PhotoIcon,
  StarIcon as StarIconOutline,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';

interface Election {
  id: string;
  name: string;
  favCandidate1Id: string | null;
  favCandidate2Id: string | null;
}

interface Candidate {
  id: string;
  name: string;
  party: string;
  partyFull: string | null;
  color: string;
  photo: string | null;
}

// Party icon component
function PartyIcon({ party, color }: { party: string; color: string }) {
  return (
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0"
      style={{ backgroundColor: color }}
    >
      {party === 'NPP' ? (
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 21V3h7v7h4V3h7v18h-7v-7h-4v7H3z" />
        </svg>
      ) : party === 'NDC' ? (
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14l-4-4 1.41-1.41L11 13.17l5.59-5.59L18 9l-7 7z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      )}
    </div>
  );
}

export default function CandidateManagement() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role;
  const canModify = userRole === 'ADMIN';

  const { data: candidates, mutate } = useSWR<Candidate[]>('/api/candidates', fetcher);
  const { data: elections, mutate: mutateElections } = useSWR<Election[]>('/api/elections', fetcher);
  const activeElection = elections?.find((e: any) => e.isActive);
  
  const setFavorite = async (candidateId: string, slot: 1 | 2) => {
    if (!activeElection) return;
    
    // Toggle off if already selected in this slot
    const newValue = (slot === 1 ? activeElection.favCandidate1Id : activeElection.favCandidate2Id) === candidateId 
      ? null 
      : candidateId;
      
    try {
      const res = await fetch('/api/elections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeElection.id,
          [slot === 1 ? 'favCandidate1Id' : 'favCandidate2Id']: newValue,
        }),
      });
      if (res.ok) {
        mutateElections();
      }
    } catch (err) {
      console.error('Failed to set favorite candidate:', err);
    }
  };
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [form, setForm] = useState({ name: '', party: '', partyFull: '', color: '#3B82F6', photo: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const perPage = 10;

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', party: '', partyFull: '', color: '#3B82F6', photo: '' });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (c: Candidate) => {
    setEditing(c);
    setForm({ name: c.name, party: c.party, partyFull: c.partyFull || '', color: c.color || '#3B82F6', photo: c.photo || '' });
    setError('');
    setModalOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/candidates/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setForm((prev) => ({ ...prev, photo: data.url }));
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = editing ? { id: editing.id, ...form } : form;
      const res = await fetch('/api/candidates', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || data.errors?.map((e: { message: string }) => e.message).join(', ') || 'Failed to save candidate');
        return;
      }

      mutate();
      toast.success(editing ? 'Candidate updated' : 'Candidate added');
      setModalOpen(false);
    } catch (err) {
      console.error(err);
      setError('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/candidates?id=${deleteTarget}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete candidate');
        return;
      }
      mutate();
      toast.success('Candidate deleted');
    } catch {
      toast.error('Failed to delete candidate. Please try again.');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Get unique parties for filter tabs
  const allCandidates = Array.isArray(candidates) ? candidates : [];
  const parties = [...new Set(allCandidates.map((c) => c.party))];

  // Filter candidates
  const filteredCandidates = filter === 'all'
    ? allCandidates
    : allCandidates.filter((c) => c.party === filter);

  const totalPages = Math.ceil(filteredCandidates.length / perPage);
  const paginatedCandidates = filteredCandidates.slice((page - 1) * perPage, page * perPage);

  // Generate ref ID
  const getRefId = (candidate: Candidate, index: number) => {
    return `CAN-${new Date().getFullYear()}-${String(index + 1).padStart(3, '0')}`;
  };

  // Generate initials
  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : name.slice(0, 2);
  };

  return (
    <div className="flex-1">
      <AdminHeader title="Candidate Management" />

      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Candidate Management</h2>
            <p className="text-sm text-gray-500 mt-1">
              Review and manage official candidates for the upcoming election.
            </p>
          </div>
          {canModify && (
            <Button icon={<PlusIcon className="h-4 w-4" />} onClick={openAdd}>
              Add New Candidate
            </Button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setFilter('all'); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              filter === 'all'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            All Candidates
          </button>
          {parties.map((party) => (
            <button
              key={party}
              onClick={() => { setFilter(party); setPage(1); }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                filter === party
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {party}
            </button>
          ))}
        </div>

        {/* Candidates Table */}
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Candidate Info</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Affiliation</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Constituency</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  {canModify && <th className="text-center py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedCandidates.map((candidate, idx) => {
                  const globalIdx = (page - 1) * perPage + idx;
                  return (
                    <tr key={candidate.id} className="border-b border-gray-50 hover:bg-gray-50">
                      {/* Candidate Info */}
                      <td className="py-5 px-6">
                        <div className="flex items-center gap-4">
                          {candidate.photo ? (
                            <img
                              src={candidate.photo}
                              alt={candidate.name}
                              className="w-12 h-12 rounded-full object-cover shrink-0 border-2 border-gray-100"
                            />
                          ) : (
                            <div
                              className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                              style={{ backgroundColor: candidate.color }}
                            >
                              {getInitials(candidate.name)}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-gray-900">{candidate.name}</p>
                            <p className="text-xs text-gray-500">Ref ID: {getRefId(candidate, globalIdx)}</p>
                          </div>
                        </div>
                      </td>
                      {/* Affiliation */}
                      <td className="py-5 px-4">
                        <div className="flex items-center gap-3">
                          <PartyIcon party={candidate.party} color={candidate.color} />
                          <div>
                            <p className="font-semibold text-gray-900">{candidate.party}</p>
                            <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                              {candidate.partyFull || (candidate.party === 'IND' ? 'No Party Affiliation' : candidate.party)}
                            </p>
                          </div>
                        </div>
                      </td>
                      {/* Constituency */}
                      <td className="py-5 px-4 text-gray-700">
                        Constituency
                      </td>
                      {/* Status */}
                      <td className="py-5 px-4 text-center">
                        <Badge variant="success" dot>Verified</Badge>
                      </td>
                      {/* Actions */}
                      {canModify && (
                        <td className="py-5 px-6">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setFavorite(candidate.id, 1)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                activeElection?.favCandidate1Id === candidate.id
                                  ? 'text-yellow-500 bg-yellow-50'
                                  : 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-50'
                              }`}
                              title="Set as 1st Comparison Candidate"
                            >
                              {activeElection?.favCandidate1Id === candidate.id ? (
                                <StarIconSolid className="h-4 w-4" />
                              ) : (
                                <StarIconOutline className="h-4 w-4" />
                              )}
                              <span className="sr-only">1st</span>
                            </button>
                            <button
                              onClick={() => setFavorite(candidate.id, 2)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                activeElection?.favCandidate2Id === candidate.id
                                  ? 'text-blue-500 bg-blue-50'
                                  : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
                              }`}
                              title="Set as 2nd Comparison Candidate"
                            >
                              {activeElection?.favCandidate2Id === candidate.id ? (
                                <StarIconSolid className="h-4 w-4" />
                              ) : (
                                <StarIconOutline className="h-4 w-4" />
                              )}
                              <span className="sr-only">2nd</span>
                            </button>
                            <button
                              onClick={() => openEdit(candidate)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(candidate.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filteredCandidates.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-500">
                      {filter === 'all'
                        ? 'No candidates added yet. Click "Add New Candidate" to get started.'
                        : `No ${filter} candidates found.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredCandidates.length > perPage && (
            <div className="px-6 py-4 flex items-center justify-between border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Showing <span className="font-medium text-gray-700">{(page - 1) * perPage + 1}</span> to{' '}
                <span className="font-medium text-gray-700">{Math.min(page * perPage, filteredCandidates.length)}</span> of{' '}
                <span className="font-medium text-gray-700">{filteredCandidates.length}</span> candidates
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  &lsaquo;
                </button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setPage(i + 1)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                      page === i + 1
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  &rsaquo;
                </button>
              </div>
            </div>
          )}
          {filteredCandidates.length > 0 && filteredCandidates.length <= perPage && (
            <div className="px-6 py-4 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Showing <span className="font-medium text-gray-700">1</span> to{' '}
                <span className="font-medium text-gray-700">{filteredCandidates.length}</span> of{' '}
                <span className="font-medium text-gray-700">{filteredCandidates.length}</span> candidates
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Candidate' : 'Add New Candidate'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          <Input
            label="Candidate Name"
            placeholder="e.g. Alexander Afenyo-Markin"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Party Abbreviation"
            placeholder="e.g. NPP"
            value={form.party}
            onChange={(e) => setForm({ ...form, party: e.target.value })}
            required
          />
          <Input
            label="Full Party Name"
            placeholder="e.g. New Patriotic Party"
            value={form.partyFull}
            onChange={(e) => setForm({ ...form, partyFull: e.target.value })}
          />
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Candidate Photo
            </label>
            <div className="flex items-center gap-4">
              {form.photo ? (
                <img
                  src={form.photo}
                  alt="Preview"
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300">
                  <PhotoIcon className="h-6 w-6 text-gray-400" />
                </div>
              )}
              <div className="flex-1">
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors text-sm text-gray-700">
                  {uploading ? 'Uploading...' : form.photo ? 'Change Photo' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={handlePhotoUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
                {form.photo && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, photo: '' })}
                    className="ml-2 text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
                <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP. Max 5MB.</p>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Party Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
              />
              <span className="text-sm text-gray-500">{form.color}</span>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Update' : 'Add Candidate'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Candidate"
        message="Are you sure you want to delete this candidate? This will also remove all associated results."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
