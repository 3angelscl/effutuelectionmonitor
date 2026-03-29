'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  ArrowDownTrayIcon,
  UserGroupIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Election {
  id: string;
  name: string;
  status: string;
  isActive: boolean;
  date: string | null;
  _count: { candidates: number; results: number };
}

interface Candidate {
  id: string;
  name: string;
  party: string;
}

export default function ReportsPage() {
  const { data: elections } = useSWR<Election[]>('/api/elections', fetcher);

  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');

  // Auto-select active election as default
  useEffect(() => {
    if (elections && !selectedElectionId) {
      const active = elections.find((e) => e.isActive);
      if (active) setSelectedElectionId(active.id);
    }
  }, [elections, selectedElectionId]);

  // Fetch candidates for selected election
  const { data: candidates } = useSWR<Candidate[]>(
    selectedElectionId ? `/api/candidates?electionId=${selectedElectionId}` : null,
    fetcher
  );

  // Reset candidate when election changes
  useEffect(() => {
    setSelectedCandidateId('');
  }, [selectedElectionId]);

  // ── URL builders ──
  const buildVoterUrl = (format: string) => {
    const p = new URLSearchParams({ format });
    if (selectedElectionId) p.set('electionId', selectedElectionId);
    if (dateFrom) p.set('dateFrom', dateFrom);
    if (dateTo) p.set('dateTo', dateTo);
    return `/api/voters/export?${p}`;
  };

  const buildResultsUrl = (format: string) => {
    const p = new URLSearchParams({ format });
    if (selectedElectionId) p.set('electionId', selectedElectionId);
    if (selectedCandidateId) p.set('candidateId', selectedCandidateId);
    return `/api/results/export?${p}`;
  };

  const buildPdfUrl = (type: string) => {
    const p = new URLSearchParams({ type });
    if (selectedElectionId) p.set('electionId', selectedElectionId);
    return `/api/reports/pdf?${p}`;
  };

  const selectedElection = elections?.find((e) => e.id === selectedElectionId);

  return (
    <div className="flex-1">
      <AdminHeader title="Reports & Export" />

      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* ── Filters ── */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <FunnelIcon className="h-5 w-5 text-primary-600" />
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Report Filters</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Election */}
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                Election
              </label>
              <select
                value={selectedElectionId}
                onChange={(e) => setSelectedElectionId(e.target.value)}
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              >
                <option value="">— Active Election —</option>
                {(Array.isArray(elections) ? elections : []).map((el) => (
                  <option key={el.id} value={el.id}>
                    {el.name} {el.isActive ? '(Active)' : `(${el.status})`}
                  </option>
                ))}
              </select>
              {selectedElection && (
                <p className="text-xs text-gray-400 mt-1">
                  {selectedElection._count.candidates} candidates · {selectedElection._count.results} result entries
                </p>
              )}
            </div>

            {/* Date From */}
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                Date From <span className="normal-case font-normal text-gray-400">(voter turnout)</span>
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                Date To <span className="normal-case font-normal text-gray-400">(voter turnout)</span>
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                min={dateFrom || undefined}
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>

            {/* Candidate */}
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                Candidate <span className="normal-case font-normal text-gray-400">(results only)</span>
              </label>
              <select
                value={selectedCandidateId}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
                disabled={!Array.isArray(candidates) || candidates.length === 0}
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">All Candidates</option>
                {(Array.isArray(candidates) ? candidates : []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.party})
                  </option>
                ))}
              </select>
              {!selectedElectionId && (
                <p className="text-xs text-gray-400 mt-1">Select an election first</p>
              )}
            </div>
          </div>

          {/* Active filter pills */}
          {(dateFrom || dateTo || selectedCandidateId) && (
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-gray-100">
              <span className="text-xs text-gray-500">Active filters:</span>
              {dateFrom && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 text-xs rounded-full font-medium">
                  From: {dateFrom}
                  <button onClick={() => setDateFrom('')} className="ml-1 hover:text-primary-900">×</button>
                </span>
              )}
              {dateTo && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 text-xs rounded-full font-medium">
                  To: {dateTo}
                  <button onClick={() => setDateTo('')} className="ml-1 hover:text-primary-900">×</button>
                </span>
              )}
              {selectedCandidateId && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 text-xs rounded-full font-medium">
                  Candidate: {candidates?.find((c) => c.id === selectedCandidateId)?.name}
                  <button onClick={() => setSelectedCandidateId('')} className="ml-1 hover:text-primary-900">×</button>
                </span>
              )}
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setSelectedCandidateId(''); }}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </Card>

        {/* ── Data Export ── */}
        <div>
          <h2 className="text-xl font-bold text-gray-900">Data Export</h2>
          <p className="text-sm text-gray-500 mt-1">Download election data in CSV or Excel format</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Voter Register */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                <UserGroupIcon className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Voter Register</h3>
                <p className="text-xs text-gray-500">All registered voters with vote status</p>
              </div>
            </div>
            {(dateFrom || dateTo) && (
              <p className="text-xs text-primary-600 bg-primary-50 px-3 py-1.5 rounded-lg mb-3">
                Filtered: voters who voted {dateFrom && `from ${dateFrom}`}{dateTo && ` to ${dateTo}`}
              </p>
            )}
            <div className="flex gap-3">
              {(['csv', 'xlsx'] as const).map((fmt) => (
                <Button
                  key={fmt}
                  variant="outline"
                  size="sm"
                  icon={<ArrowDownTrayIcon className="h-4 w-4" />}
                  onClick={() => window.open(buildVoterUrl(fmt), '_blank')}
                >
                  {fmt.toUpperCase()}
                </Button>
              ))}
            </div>
          </Card>

          {/* Turnout Report */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                <ChartBarIcon className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Turnout Report</h3>
                <p className="text-xs text-gray-500">Voter turnout per polling station</p>
              </div>
            </div>
            {(dateFrom || dateTo) && (
              <p className="text-xs text-primary-600 bg-primary-50 px-3 py-1.5 rounded-lg mb-3">
                Filtered to date range
              </p>
            )}
            <div className="flex gap-3">
              {(['csv', 'xlsx'] as const).map((fmt) => (
                <Button
                  key={fmt}
                  variant="outline"
                  size="sm"
                  icon={<ArrowDownTrayIcon className="h-4 w-4" />}
                  onClick={() => window.open(buildVoterUrl(fmt), '_blank')}
                >
                  {fmt.toUpperCase()}
                </Button>
              ))}
            </div>
          </Card>

          {/* Election Results */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                <ClipboardDocumentListIcon className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Election Results</h3>
                <p className="text-xs text-gray-500">Votes per candidate per polling station</p>
              </div>
            </div>
            {selectedCandidateId && (
              <p className="text-xs text-primary-600 bg-primary-50 px-3 py-1.5 rounded-lg mb-3">
                Candidate: {candidates?.find((c) => c.id === selectedCandidateId)?.name}
              </p>
            )}
            <div className="flex gap-3">
              {(['csv', 'xlsx'] as const).map((fmt) => (
                <Button
                  key={fmt}
                  variant="outline"
                  size="sm"
                  icon={<ArrowDownTrayIcon className="h-4 w-4" />}
                  onClick={() => window.open(buildResultsUrl(fmt), '_blank')}
                >
                  {fmt.toUpperCase()}
                </Button>
              ))}
            </div>
          </Card>
        </div>

        {/* ── PDF Reports ── */}
        <div>
          <h2 className="text-xl font-bold text-gray-900">PDF Reports</h2>
          <p className="text-sm text-gray-500 mt-1">Generate and download formatted PDF reports</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              title: 'Summary Report',
              description: 'Full election summary with statistics, results, and station overview',
              type: 'summary',
            },
            {
              title: 'Turnout Report',
              description: 'Detailed voter turnout breakdown by polling station',
              type: 'turnout',
            },
            {
              title: 'Results Report',
              description: 'Complete election results with per-station candidate votes',
              type: 'results',
            },
          ].map((report) => (
            <Card key={report.type}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <DocumentTextIcon className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{report.title}</h3>
                  <p className="text-xs text-gray-500">{report.description}</p>
                </div>
              </div>
              {selectedElection && (
                <p className="text-xs text-gray-500 mb-3">
                  Election: <span className="font-medium text-gray-700">{selectedElection.name}</span>
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                icon={<ArrowDownTrayIcon className="h-4 w-4" />}
                onClick={() => window.open(buildPdfUrl(report.type), '_blank')}
              >
                Download PDF
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
