'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import AdminHeader from '@/components/layout/AdminHeader';
import { TrashIcon, CheckCircleIcon, PlusIcon, ArchiveBoxArrowDownIcon, BoltIcon } from '@heroicons/react/24/outline';

// ── Types ──

interface Candidate {
  id?: string;
  name: string;
  party: string;
  partyFull: string;
  color: string;
}

interface Station {
  id: string;
  psCode: string;
  name: string;
  agentId: string | null;
  agent: { id: string; name: string } | null;
}

interface Agent {
  id: string;
  name: string;
  role: string;
}

interface Assignment {
  stationId: string;
  agentId: string;
}

// ── Types ──

interface AllElection {
  id: string;
  name: string;
  description: string | null;
  date: string | null;
  status: string;
  isActive: boolean;
  _count: { candidates: number; results: number };
}

// ── All Elections List (separate component to isolate from wizard hydration) ──

function AllElectionsList() {
  const [elections, setElections] = useState<AllElection[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch('/api/elections')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setElections(data); })
      .catch(() => {});
  }, [refreshKey]);

  const handleArchive = async (id: string, name: string) => {
    if (!confirm(`Archive "${name}"? This will mark it as COMPLETED and move it to Election Archives.`)) return;
    await fetch('/api/elections', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'COMPLETED' }),
    });
    setRefreshKey((k) => k + 1);
  };

  const handleActivate = async (id: string) => {
    await fetch('/api/elections/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ electionId: id }),
    });
    setRefreshKey((k) => k + 1);
  };

  if (elections.length === 0) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-4">
        <ArchiveBoxArrowDownIcon className="h-5 w-5 text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">All Elections</h2>
        <span className="text-sm text-gray-400">({elections.length})</span>
      </div>
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Election</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Date</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Candidates</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-center py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {elections.map((el) => (
                <tr key={el.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 px-6">
                    <div>
                      <p className="font-medium text-gray-900">{el.name}</p>
                      {el.description && (
                        <p className="text-xs text-gray-400 truncate max-w-xs">{el.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-xs">
                    {el.date
                      ? new Date(el.date).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="py-3 px-4 text-center text-gray-600">{el._count.candidates}</td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <Badge
                        variant={
                          el.status === 'ONGOING' ? 'success'
                          : el.status === 'UPCOMING' ? 'info'
                          : 'neutral'
                        }
                      >
                        {el.status}
                      </Badge>
                      {el.isActive && <Badge variant="success" dot>Active</Badge>}
                    </div>
                  </td>
                  <td className="py-3 px-6">
                    <div className="flex items-center justify-center gap-2">
                      {!el.isActive && el.status !== 'COMPLETED' && (
                        <button
                          onClick={() => handleActivate(el.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Set as active election"
                        >
                          <BoltIcon className="h-3.5 w-3.5" />
                          Activate
                        </button>
                      )}
                      {el.status !== 'COMPLETED' && (
                        <button
                          onClick={() => handleArchive(el.id, el.name)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Archive election"
                        >
                          <ArchiveBoxArrowDownIcon className="h-3.5 w-3.5" />
                          Archive
                        </button>
                      )}
                      {el.status === 'COMPLETED' && (
                        <span className="text-xs text-gray-400 italic">Archived</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Component ──

export default function ElectionSetupWizard() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1 — Election details
  const [electionName, setElectionName] = useState('');
  const [electionDescription, setElectionDescription] = useState('');
  const [electionDate, setElectionDate] = useState('');
  const [electionId, setElectionId] = useState<string | null>(null);

  // Step 2 — Candidates
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candName, setCandName] = useState('');
  const [candParty, setCandParty] = useState('');
  const [candPartyFull, setCandPartyFull] = useState('');
  const [candColor, setCandColor] = useState('#3B82F6');

  // Step 3 — Agent assignments
  const [stations, setStations] = useState<Station[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});


  // ── Step 1: Create election ──

  const createElection = async () => {
    if (!electionName.trim()) {
      setError('Election name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/elections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: electionName,
          description: electionDescription || undefined,
          date: electionDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create election');
      setElectionId(data.id);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Add candidate ──

  const addCandidate = async () => {
    if (!candName.trim() || !candParty.trim()) {
      setError('Candidate name and party abbreviation are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: candName,
          party: candParty,
          partyFull: candPartyFull || undefined,
          color: candColor,
          electionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add candidate');
      setCandidates((prev) => [...prev, { id: data.id, name: candName, party: candParty, partyFull: candPartyFull, color: candColor }]);
      setCandName('');
      setCandParty('');
      setCandPartyFull('');
      setCandColor('#3B82F6');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const removeCandidate = async (index: number) => {
    const cand = candidates[index];
    if (cand.id) {
      await fetch(`/api/candidates?id=${cand.id}`, { method: 'DELETE' });
    }
    setCandidates((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Step 3: Load stations & agents ──

  useEffect(() => {
    if (step === 3) {
      Promise.all([
        fetch('/api/stations').then((r) => r.json()),
        fetch('/api/users').then((r) => r.json()),
      ]).then(([stationsData, usersData]) => {
        setStations(Array.isArray(stationsData) ? stationsData : []);
        setAgents((Array.isArray(usersData) ? usersData : []).filter((u: Agent) => u.role === 'AGENT'));
      });
    }
  }, [step]);

  const unassignedStations = stations.filter((s) => !s.agentId);

  const assignAgent = (stationId: string, agentId: string) => {
    setAssignments((prev) => {
      const copy = { ...prev };
      if (agentId) {
        copy[stationId] = agentId;
      } else {
        delete copy[stationId];
      }
      return copy;
    });
  };

  const bulkAssignRandom = () => {
    const available = agents.filter(
      (a) => !Object.values(assignments).includes(a.id) && !stations.some((s) => s.agentId === a.id)
    );
    const bulk: Record<string, string> = { ...assignments };
    unassignedStations.forEach((s) => {
      if (bulk[s.id]) return;
      const agent = available.shift();
      if (agent) bulk[s.id] = agent.id;
    });
    setAssignments(bulk);
  };

  const saveAssignments = async () => {
    const entries = Object.entries(assignments);
    if (entries.length === 0) {
      setStep(4);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/stations/assign-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignments: entries.map(([stationId, agentId]) => ({ stationId, agentId })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign agents');
      setStep(4);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 4: Activate ──

  const activateElection = async () => {
    if (!electionId) return;
    setLoading(true);
    setError('');
    try {
      // Use the dedicated active endpoint which deactivates all others first
      const res = await fetch('/api/elections/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ electionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to activate election');
      setStep(5); // success
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // ── Step indicator ──

  const stepLabels = ['Details', 'Candidates', 'Agents', 'Review'];

  return (
    <div>
      <AdminHeader title="Election Setup Wizard" />
      <div className="p-6 max-w-6xl mx-auto">
        {/* Step progress — hidden on terminal completion screens */}
        {step < 5 && <div className="flex items-center justify-center gap-2 mb-8">
          {stepLabels.map((label, i) => {
            const num = i + 1;
            const isActive = step === num;
            const isDone = step > num;
            return (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    isDone
                      ? 'bg-green-500 text-white'
                      : isActive
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {isDone ? <CheckCircleIcon className="h-5 w-5" /> : num}
                </div>
                <span className={`text-sm font-medium ${isActive ? 'text-primary-700' : 'text-gray-500'}`}>{label}</span>
                {i < stepLabels.length - 1 && <div className="w-12 h-0.5 bg-gray-200 mx-1" />}
              </div>
            );
          })}
        </div>}

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        {/* ── Step 1: Election Details ── */}
        {step === 1 && (
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Election Details</h2>
            <div className="space-y-4">
              <Input
                label="Election Name"
                placeholder="e.g. 2026 Parliamentary Election"
                value={electionName}
                onChange={(e) => setElectionName(e.target.value)}
                required
              />
              <div className="w-full">
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:bg-white focus:outline-none transition-colors"
                  rows={3}
                  placeholder="Optional description..."
                  value={electionDescription}
                  onChange={(e) => setElectionDescription(e.target.value)}
                />
              </div>
              <Input
                label="Election Date"
                type="date"
                value={electionDate}
                onChange={(e) => setElectionDate(e.target.value)}
              />
              <div className="pt-4">
                <Button onClick={createElection} loading={loading}>
                  Create Election
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ── Step 2: Candidates ── */}
        {step === 2 && (
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Add Candidates</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Input
                label="Candidate Name"
                placeholder="Full name"
                value={candName}
                onChange={(e) => setCandName(e.target.value)}
              />
              <Input
                label="Party (Abbreviation)"
                placeholder="e.g. NPP"
                value={candParty}
                onChange={(e) => setCandParty(e.target.value)}
              />
              <Input
                label="Party Full Name"
                placeholder="e.g. New Patriotic Party"
                value={candPartyFull}
                onChange={(e) => setCandPartyFull(e.target.value)}
              />
              <div className="w-full">
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={candColor}
                    onChange={(e) => setCandColor(e.target.value)}
                    className="h-10 w-14 rounded border border-gray-200 cursor-pointer"
                  />
                  <span className="text-sm text-gray-500">{candColor}</span>
                </div>
              </div>
            </div>
            <Button onClick={addCandidate} loading={loading} icon={<PlusIcon className="h-4 w-4" />} size="sm">
              Add Candidate
            </Button>

            {/* List */}
            {candidates.length > 0 && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Added Candidates ({candidates.length})
                </h3>
                <div className="space-y-2">
                  {candidates.map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: c.color }} />
                        <span className="text-sm font-medium text-gray-900">{c.name}</span>
                        <Badge variant="info">{c.party}</Badge>
                        {c.partyFull && <span className="text-xs text-gray-500">{c.partyFull}</span>}
                      </div>
                      <button onClick={() => removeCandidate(i)} className="text-red-500 hover:text-red-700">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <Button onClick={() => setStep(3)} disabled={candidates.length === 0}>
                Next
              </Button>
            </div>
          </Card>
        )}

        {/* ── Step 3: Assign Agents ── */}
        {step === 3 && (
          <Card>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Assign Agents to Stations</h2>
              <Button variant="secondary" size="sm" onClick={bulkAssignRandom}>
                Bulk Auto-Assign
              </Button>
            </div>

            {unassignedStations.length === 0 && stations.length > 0 && (
              <p className="text-sm text-green-600 mb-4">All stations already have agents assigned.</p>
            )}

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {unassignedStations.map((station) => (
                <div key={station.id} className="flex items-center justify-between gap-4 p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{station.psCode}</span>
                    <span className="text-sm text-gray-500 ml-2">{station.name}</span>
                  </div>
                  <select
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    value={assignments[station.id] || ''}
                    onChange={(e) => assignAgent(station.id, e.target.value)}
                  >
                    <option value="">-- Select Agent --</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-between">
              <Button variant="secondary" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={saveAssignments} loading={loading}>
                Next
              </Button>
            </div>
          </Card>
        )}

        {/* ── Step 4: Review & Activate ── */}
        {step === 4 && (
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Review &amp; Activate</h2>
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Election Name</span>
                  <span className="font-medium text-gray-900">{electionName}</span>
                </div>
                {electionDescription && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Description</span>
                    <span className="font-medium text-gray-900">{electionDescription}</span>
                  </div>
                )}
                {electionDate && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Date</span>
                    <span className="font-medium text-gray-900">{electionDate}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Candidates</span>
                  <Badge variant="info">{candidates.length}</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Agents Assigned (this session)</span>
                  <Badge variant="success">{Object.keys(assignments).length}</Badge>
                </div>
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                Activating this election will deactivate any currently active election. You can also save it as a draft and activate later.
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="secondary" onClick={() => setStep(3)}>
                  Back
                </Button>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(6)}
                  >
                    Save as Draft
                  </Button>
                  <Button onClick={activateElection} loading={loading}>
                    Activate Election
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ── Step 5: Activated Success ── */}
        {step === 5 && (
          <Card>
            <div className="text-center py-8">
              <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Election Activated!</h2>
              <p className="text-gray-500 mb-6">
                <strong>{electionName}</strong> is now the active election with {candidates.length} candidates.
              </p>
              <div className="flex justify-center gap-3">
                <Button variant="secondary" onClick={() => (window.location.href = '/admin')}>
                  Go to Dashboard
                </Button>
                <Button
                  onClick={() => {
                    setStep(1);
                    setElectionId(null);
                    setElectionName('');
                    setElectionDescription('');
                    setElectionDate('');
                    setCandidates([]);
                    setAssignments({});
                    setError('');
                  }}
                >
                  Create Another
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ── Step 6: Saved as Draft ── */}
        {step === 6 && (
          <Card>
            <div className="text-center py-8">
              <CheckCircleIcon className="h-16 w-16 text-blue-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Election Saved as Draft</h2>
              <p className="text-gray-500 mb-2">
                <strong>{electionName}</strong> has been saved with {candidates.length} candidates and {Object.keys(assignments).length} agent assignments.
              </p>
              <p className="text-sm text-gray-400 mb-6">
                You can activate this election later from the Election Selector in the sidebar.
              </p>
              <div className="flex justify-center gap-3">
                <Button variant="secondary" onClick={() => (window.location.href = '/admin')}>
                  Go to Dashboard
                </Button>
                <Button
                  onClick={() => {
                    setStep(1);
                    setElectionId(null);
                    setElectionName('');
                    setElectionDescription('');
                    setElectionDate('');
                    setCandidates([]);
                    setAssignments({});
                    setError('');
                  }}
                >
                  Create Another
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ── All Elections ── */}
        <AllElectionsList />
      </div>
    </div>
  );
}
