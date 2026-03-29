'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { PlusIcon, CheckCircleIcon, ArchiveBoxArrowDownIcon } from '@heroicons/react/24/outline';
import { useSession } from 'next-auth/react';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Election {
  id: string;
  name: string;
  description: string | null;
  date: string | null;
  isActive: boolean;
  status: string;
  _count: { candidates: number; results: number };
}

export default function ElectionSelector() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role || 'VIEWER';
  const canManage = userRole === 'ADMIN';

  const { data: electionsRaw, mutate } = useSWR('/api/elections', fetcher);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', date: '' });
  const [saving, setSaving] = useState(false);

  // Guard against non-array responses (e.g. a 401 { error: "..." } during hydration)
  const elections: Election[] = Array.isArray(electionsRaw) ? electionsRaw : [];

  const activeElection = elections.find((e) => e.isActive);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch('/api/elections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      mutate();
      setCreateOpen(false);
      setForm({ name: '', description: '', date: '' });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (electionId: string) => {
    await fetch('/api/elections/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ electionId }),
    });
    mutate();
    window.location.reload();
  };

  const handleArchive = async (electionId: string, electionName: string) => {
    if (!confirm(`Archive "${electionName}"? This will mark it as COMPLETED and move it to Election Archives.`)) return;
    await fetch('/api/elections', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: electionId, status: 'COMPLETED' }),
    });
    mutate();
  };

  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">Active Election</p>
          {activeElection ? (
            <p className="text-xs font-semibold text-gray-800 truncate">{activeElection.name}</p>
          ) : (
            <p className="text-xs text-gray-500 italic">No election active</p>
          )}
        </div>
        {canManage && (
          <button
            onClick={() => setCreateOpen(true)}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
            title="Manage Elections"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {canManage && <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Manage Elections" size="lg">
        <div className="space-y-4">
          {/* Existing elections */}
          {elections.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase">Existing Elections</p>
              {elections.map((el) => (
                <div
                  key={el.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-sm text-gray-900">{el.name}</p>
                    <p className="text-xs text-gray-500">
                      {el._count.candidates} candidates &middot; {el._count.results} results
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={el.status === 'ONGOING' ? 'success' : el.status === 'UPCOMING' ? 'info' : 'neutral'}
                    >
                      {el.status}
                    </Badge>
                    {el.isActive ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                        <CheckCircleIcon className="h-4 w-4" /> Active
                      </span>
                    ) : el.status === 'COMPLETED' ? (
                      <span className="flex items-center gap-1 text-xs text-gray-400 font-medium">
                        <ArchiveBoxArrowDownIcon className="h-4 w-4" /> Archived
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleActivate(el.id)}
                        >
                          Set Active
                        </Button>
                        <button
                          onClick={() => handleArchive(el.id, el.name)}
                          className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Archive election"
                        >
                          <ArchiveBoxArrowDownIcon className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create new */}
          <div className="border-t border-gray-200 pt-4">
            <p className="text-xs font-bold text-gray-500 uppercase mb-3">Create New Election</p>
            <form onSubmit={handleCreate} className="space-y-3">
              <Input
                label="Election Name"
                placeholder="e.g. General Election 2025"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Input
                label="Description (optional)"
                placeholder="e.g. Effutu Constituency Presidential & Parliamentary"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              <Input
                label="Election Date (optional)"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
                  Close
                </Button>
                <Button type="submit" loading={saving}>
                  Create Election
                </Button>
              </div>
            </form>
          </div>
        </div>
      </Modal>}
    </div>
  );
}
