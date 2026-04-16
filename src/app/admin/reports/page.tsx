'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetcher } from '@/lib/utils';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';
import {
  ArrowDownTrayIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  FunnelIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

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

interface ExportCardConfig {
  key: string;
  title: string;
  description: string;
  helperText: string;
  badge: string;
  icon: typeof UserGroupIcon;
  iconClasses: string;
  formats: readonly ('csv' | 'xlsx')[];
  actionLabel: string;
  onDownload: (format: 'csv' | 'xlsx') => void;
}

interface PdfCardConfig {
  type: 'summary' | 'turnout' | 'results';
  title: string;
  description: string;
}

export default function ReportsPage() {
  const { data: elections, isLoading: electionsLoading } = useSWR<Election[]>('/api/elections', fetcher);

  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');

  useEffect(() => {
    if (elections && !selectedElectionId) {
      const active = elections.find((e) => e.isActive);
      if (active) setSelectedElectionId(active.id);
    }
  }, [elections, selectedElectionId]);

  const { data: candidates, isLoading: candidatesLoading } = useSWR<Candidate[]>(
    selectedElectionId ? `/api/candidates?electionId=${selectedElectionId}` : null,
    fetcher
  );

  useEffect(() => {
    setSelectedCandidateId('');
  }, [selectedElectionId]);

  const selectedElection = elections?.find((e) => e.id === selectedElectionId);
  const selectedCandidate = candidates?.find((c) => c.id === selectedCandidateId);
  const activeFilterCount = [Boolean(selectedElectionId), Boolean(dateFrom), Boolean(dateTo), Boolean(selectedCandidateId)]
    .filter(Boolean)
    .length;

  const buildVoterUrl = (format: 'csv' | 'xlsx') => {
    const params = new URLSearchParams({ format });
    if (selectedElectionId) params.set('electionId', selectedElectionId);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    return `/api/voters/export?${params.toString()}`;
  };

  const buildTurnoutUrl = (format: 'csv' | 'xlsx') => {
    const params = new URLSearchParams({ format });
    if (selectedElectionId) params.set('electionId', selectedElectionId);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    return `/api/turnout/export?${params.toString()}`;
  };

  const buildResultsUrl = (format: 'csv' | 'xlsx') => {
    const params = new URLSearchParams({ format });
    if (selectedElectionId) params.set('electionId', selectedElectionId);
    if (selectedCandidateId) params.set('candidateId', selectedCandidateId);
    return `/api/results/export?${params.toString()}`;
  };

  const buildPdfUrl = (type: string) => {
    const params = new URLSearchParams({ type });
    if (selectedElectionId) params.set('electionId', selectedElectionId);
    return `/api/reports/pdf?${params.toString()}`;
  };

  const openExport = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ── Email report modal ─────────────────────────────────────────────────────
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailReportType, setEmailReportType] = useState<'summary' | 'turnout' | 'results'>('summary');
  const [emailInput, setEmailInput] = useState('');
  const [emailRecipients, setEmailRecipients] = useState<string[]>([]);
  const [emailSending, setEmailSending] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const openEmailModal = (type: 'summary' | 'turnout' | 'results') => {
    setEmailReportType(type);
    setEmailRecipients([]);
    setEmailInput('');
    setEmailModalOpen(true);
  };

  const addEmailRecipient = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (!isValid) { toast.error('Invalid email address'); return; }
    if (emailRecipients.includes(trimmed)) { toast.error('Already added'); return; }
    if (emailRecipients.length >= 20) { toast.error('Maximum 20 recipients'); return; }
    setEmailRecipients((prev) => [...prev, trimmed]);
    setEmailInput('');
    emailInputRef.current?.focus();
  };

  const removeEmailRecipient = (email: string) => {
    setEmailRecipients((prev) => prev.filter((e) => e !== email));
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addEmailRecipient(); }
  };

  const handleSendReport = async () => {
    if (emailRecipients.length === 0) { toast.error('Add at least one recipient'); return; }
    setEmailSending(true);
    try {
      const res = await fetch('/api/reports/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: emailReportType,
          electionId: selectedElectionId || undefined,
          recipients: emailRecipients,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to send report'); return; }
      toast.success(data.message || 'Report sent successfully');
      setEmailModalOpen(false);
    } catch {
      toast.error('An error occurred. Please try again.');
    } finally {
      setEmailSending(false);
    }
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setSelectedCandidateId('');
  };

  const exportCards = useMemo<ExportCardConfig[]>(
    () => [
      {
        key: 'voters',
        title: 'Voter Register',
        description: 'All registered voters, polling station details, and vote status.',
        helperText:
          dateFrom || dateTo
            ? `Includes voters marked within ${dateFrom || 'the beginning'} to ${dateTo || 'now'}.`
            : 'Exports the full voter register for the selected election scope.',
        badge: 'Raw voter data',
        icon: UserGroupIcon,
        iconClasses: 'bg-blue-100 text-blue-700',
        formats: ['csv', 'xlsx'],
        actionLabel: 'Download voter register',
        onDownload: (format) => openExport(buildVoterUrl(format)),
      },
      {
        key: 'turnout',
        title: 'Turnout Summary',
        description: 'Polling-station level turnout totals, registered voters, and turnout percentage.',
        helperText:
          dateFrom || dateTo
            ? 'Date filters apply to votes cast within the selected turnout window.'
            : 'Exports turnout totals for the selected election across all polling stations.',
        badge: 'Station summary',
        icon: ChartBarIcon,
        iconClasses: 'bg-emerald-100 text-emerald-700',
        formats: ['csv', 'xlsx'],
        actionLabel: 'Download turnout summary',
        onDownload: (format) => openExport(buildTurnoutUrl(format)),
      },
      {
        key: 'results',
        title: 'Election Results',
        description: 'Candidate vote totals by polling station, party, and submission metadata.',
        helperText: selectedCandidate
          ? `Filtered to ${selectedCandidate.name}.`
          : 'Exports all submitted results for the selected election.',
        badge: 'Results data',
        icon: ClipboardDocumentListIcon,
        iconClasses: 'bg-amber-100 text-amber-700',
        formats: ['csv', 'xlsx'],
        actionLabel: 'Download results',
        onDownload: (format) => openExport(buildResultsUrl(format)),
      },
    ],
    [dateFrom, dateTo, selectedCandidate]
  );

  const pdfCards: PdfCardConfig[] = [
    {
      type: 'summary',
      title: 'Summary Report',
      description: 'A polished election overview with totals, turnout, and result summaries.',
    },
    {
      type: 'turnout',
      title: 'Turnout Report',
      description: 'A formatted polling-station turnout report for distribution or filing.',
    },
    {
      type: 'results',
      title: 'Results Report',
      description: 'A printable results report with candidate performance by station.',
    },
  ];

  return (
    <div className="flex-1">
      <AdminHeader title="Reports & Export" />

      <div className="space-y-4 p-4 md:space-y-6 md:p-6">
        <Card className="overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-100">
                Report center
              </div>
              <div>
                <h2 className="text-2xl font-semibold sm:text-3xl">Generate cleaner exports from one place</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
                  Choose an election, narrow the scope when needed, and download raw data or formal PDF reports
                  without switching pages.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-slate-200">
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Election</p>
                  <p className="mt-1 font-semibold text-white">
                    {selectedElection?.name || (electionsLoading ? 'Loading elections...' : 'Active election')}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Active filters</p>
                  <p className="mt-1 font-semibold text-white">{activeFilterCount}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Candidates</p>
                  <p className="mt-1 font-semibold text-white">
                    {selectedElection ? selectedElection._count.candidates.toLocaleString() : '--'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Results entries</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {selectedElection ? selectedElection._count.results.toLocaleString() : '--'}
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Candidate scope</p>
                <p className="mt-2 text-sm font-semibold text-white">{selectedCandidate?.name || 'All candidates'}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Turnout window</p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {dateFrom || dateTo ? `${dateFrom || 'Start'} to ${dateTo || 'Now'}` : 'Full period'}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FunnelIcon className="h-5 w-5 text-primary-600" />
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-gray-700">Report Filters</h2>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Election applies across the page. Date range affects voter and turnout exports. Candidate applies to results only.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={clearFilters} disabled={!dateFrom && !dateTo && !selectedCandidateId}>
              Clear optional filters
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-gray-600">Election</label>
              <select
                value={selectedElectionId}
                onChange={(e) => setSelectedElectionId(e.target.value)}
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="">{electionsLoading ? 'Loading elections...' : 'Use active election'}</option>
                {(Array.isArray(elections) ? elections : []).map((election) => (
                  <option key={election.id} value={election.id}>
                    {election.name} {election.isActive ? '(Active)' : `(${election.status})`}
                  </option>
                ))}
              </select>
              {selectedElection && (
                <p className="mt-1 text-xs text-gray-400">
                  {selectedElection._count.candidates} candidates | {selectedElection._count.results} result entries
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-gray-600">Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
              <p className="mt-1 text-xs text-gray-400">Used for voter and turnout exports.</p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-gray-600">Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                min={dateFrom || undefined}
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
              <p className="mt-1 text-xs text-gray-400">Must be on or after the start date.</p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-gray-600">Candidate</label>
              <select
                value={selectedCandidateId}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
                disabled={!Array.isArray(candidates) || candidates.length === 0}
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">
                  {candidatesLoading ? 'Loading candidates...' : !selectedElectionId ? 'Select an election first' : 'All candidates'}
                </option>
                {(Array.isArray(candidates) ? candidates : []).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.party})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">Only used for results exports.</p>
            </div>
          </div>

          {(dateFrom || dateTo || selectedCandidateId) && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
              <span className="text-xs font-medium text-gray-500">Active filters:</span>
              {dateFrom && (
                <button
                  type="button"
                  onClick={() => setDateFrom('')}
                  className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700"
                >
                  From: {dateFrom}
                  <span className="text-primary-500">x</span>
                </button>
              )}
              {dateTo && (
                <button
                  type="button"
                  onClick={() => setDateTo('')}
                  className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700"
                >
                  To: {dateTo}
                  <span className="text-primary-500">x</span>
                </button>
              )}
              {selectedCandidate && (
                <button
                  type="button"
                  onClick={() => setSelectedCandidateId('')}
                  className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700"
                >
                  Candidate: {selectedCandidate.name}
                  <span className="text-primary-500">x</span>
                </button>
              )}
            </div>
          )}
        </Card>

        <div>
          <h2 className="text-xl font-bold text-gray-900">Data Exports</h2>
          <p className="mt-1 text-sm text-gray-500">Download structured data for analysis, QA, and reporting workflows.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {exportCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.key} className="h-full border border-gray-200 bg-white">
                <div className="flex h-full flex-col">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${card.iconClasses}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      {card.badge}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-gray-900">{card.title}</h3>
                    <p className="text-sm text-gray-500">{card.description}</p>
                    <div className="rounded-2xl bg-slate-50 px-3 py-3 text-xs text-slate-600">
                      {card.helperText}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                    <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
                    {card.actionLabel}
                  </div>

                  <div className="mt-5 flex gap-3">
                    {card.formats.map((format) => (
                      <Button
                        key={format}
                        variant="outline"
                        size="sm"
                        className="flex-1 justify-center"
                        icon={<ArrowDownTrayIcon className="h-4 w-4" />}
                        onClick={() => card.onDownload(format)}
                      >
                        {format.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div>
          <h2 className="text-xl font-bold text-gray-900">PDF Reports</h2>
          <p className="mt-1 text-sm text-gray-500">Generate polished, print-ready reports for review, circulation, or filing.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {pdfCards.map((report) => (
            <Card key={report.type} className="h-full border border-gray-200 bg-gradient-to-br from-white to-rose-50/40">
              <div className="flex h-full flex-col">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                  <DocumentTextIcon className="h-5 w-5" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900">{report.title}</h3>
                  <p className="text-sm text-gray-500">{report.description}</p>
                </div>

                <div className="mt-4 rounded-2xl border border-rose-100 bg-white/80 px-3 py-3 text-xs text-gray-600">
                  Election: <span className="font-medium text-gray-900">{selectedElection?.name || 'Active election'}</span>
                </div>

                <div className="mt-auto pt-5 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 justify-center"
                    icon={<ArrowDownTrayIcon className="h-4 w-4" />}
                    onClick={() => openExport(buildPdfUrl(report.type))}
                  >
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 justify-center"
                    icon={<EnvelopeIcon className="h-4 w-4" />}
                    onClick={() => openEmailModal(report.type)}
                  >
                    Email
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Email Report Modal */}
        <Modal
          isOpen={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          title={`Email ${emailReportType === 'summary' ? 'Summary' : emailReportType === 'turnout' ? 'Turnout' : 'Results'} Report`}
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              The PDF report will be generated and emailed as an attachment to each recipient.
              Election: <span className="font-semibold text-gray-900">{selectedElection?.name || 'Active election'}</span>.
            </p>

            {/* Recipient chips */}
            {emailRecipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {emailRecipients.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 border border-primary-100 rounded-full text-xs font-medium text-primary-700"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeEmailRecipient(email)}
                      className="text-primary-400 hover:text-primary-700"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Email input */}
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                Add recipient email
              </label>
              <div className="flex gap-2">
                <input
                  ref={emailInputRef}
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={handleEmailKeyDown}
                  placeholder="name@example.com"
                  className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addEmailRecipient}
                  disabled={!emailInput.trim()}
                >
                  Add
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Press Enter or comma to add. Up to 20 recipients.</p>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="secondary"
                onClick={() => setEmailModalOpen(false)}
                disabled={emailSending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendReport}
                loading={emailSending}
                disabled={emailRecipients.length === 0 || emailSending}
                icon={<EnvelopeIcon className="h-4 w-4" />}
              >
                Send Report
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
