'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { formatNumber } from '@/lib/utils';
import { CheckCircleIcon } from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Candidate {
  id: string;
  name: string;
  party: string;
  partyFull: string | null;
  color: string;
}

interface StationData {
  id: string;
  psCode: string;
  name: string;
  status: string;
  agentId: string | null;
  totalRegistered: number;
  totalVoted: number;
}

export default function ResultsPage() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string })?.id;

  const { data: stations } = useSWR<StationData[]>('/api/stations', fetcher);
  const { data: candidates } = useSWR<Candidate[]>('/api/candidates', fetcher);

  const station = (stations || []).find((s) => s.agentId === userId);

  const [votes, setVotes] = useState<Record<string, number>>({});
  const [resultType, setResultType] = useState<'PROVISIONAL' | 'FINAL'>('PROVISIONAL');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedType, setSubmittedType] = useState<string>('');
  const [error, setError] = useState('');
  const [tallyWarning, setTallyWarning] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // Load existing results
  const { data: existingResults } = useSWR(
    station?.id ? `/api/results?stationId=${station.id}` : null,
    fetcher
  );

  useEffect(() => {
    if (existingResults && Array.isArray(existingResults)) {
      const existing: Record<string, number> = {};
      existingResults.forEach((r: { candidateId: string; votes: number; resultType?: string }) => {
        existing[r.candidateId] = r.votes;
      });
      setVotes(existing);
      if (existingResults.length > 0) {
        setSubmitted(true);
        const type = existingResults[0]?.resultType || 'PROVISIONAL';
        setSubmittedType(type);
        setResultType(type as 'PROVISIONAL' | 'FINAL');
      }
    }
  }, [existingResults]);

  const totalVotes = Object.values(votes).reduce((sum, v) => sum + (v || 0), 0);

  // Reset tally warning when votes are changed
  const handleVoteChange = (candidateId: string, value: number) => {
    setVotes({ ...votes, [candidateId]: value });
    setTallyWarning('');
  };

  const handleSubmitClick = () => {
    if (!station?.id || !candidates) return;
    setError('');

    if (totalVotes === 0) {
      setError('Please enter vote counts for at least one candidate');
      return;
    }

    if (totalVotes > station.totalRegistered) {
      setError(`Total votes (${totalVotes}) cannot exceed registered voters (${station.totalRegistered})`);
      return;
    }

    // Warn if submitted votes don't match recorded turnout (but allow proceeding)
    if (station.totalVoted > 0 && totalVotes !== station.totalVoted && !tallyWarning) {
      const diff = Math.abs(totalVotes - station.totalVoted);
      setTallyWarning(
        `Mismatch: submitted ${formatNumber(totalVotes)} vs turnout ${formatNumber(station.totalVoted)} (difference: ${formatNumber(diff)})`
      );
      return;
    }

    setTallyWarning('');
    setShowConfirm(true);
  };

  const handleConfirmSubmit = async () => {
    if (!station?.id || !candidates) return;
    setShowConfirm(false);
    setSubmitting(true);

    try {
      const results = candidates.map((c) => ({
        candidateId: c.id,
        votes: votes[c.id] || 0,
      }));

      const res = await fetch('/api/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId: station.id, results, resultType }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to submit results');
        return;
      }

      setSubmitted(true);
      setSubmittedType(resultType);
    } catch {
      setError('An error occurred while submitting');
    } finally {
      setSubmitting(false);
    }
  };

  if (!station) {
    return (
      <div className="p-6">
        <Card className="text-center py-12">
          <p className="text-gray-500">No polling station assigned.</p>
        </Card>
      </div>
    );
  }

  const typeLabel = resultType === 'FINAL' ? 'FINAL' : 'PROVISIONAL';
  const confirmMessage = resultType === 'FINAL'
    ? `You are about to submit FINAL results with a total of ${formatNumber(totalVotes)} votes. Final results cannot be easily changed. Are you sure?`
    : `You are about to submit PROVISIONAL results with a total of ${formatNumber(totalVotes)} votes. Provisional results can be updated later.`;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900">Submit Election Results</h2>
        <p className="text-gray-500 text-sm mt-1">
          {station.name} ({station.psCode}) &middot; {formatNumber(station.totalRegistered)} registered voters
        </p>
      </div>

      {submitted && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
          <CheckCircleIcon className="h-6 w-6 text-green-600" />
          <div className="flex-1">
            <p className="font-medium text-green-800">Results have been submitted</p>
            <p className="text-sm text-green-600">You can update the results by resubmitting.</p>
          </div>
          <Badge variant={submittedType === 'FINAL' ? 'success' : 'warning'}>
            {submittedType === 'FINAL' ? 'FINAL' : 'PROVISIONAL'}
          </Badge>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {tallyWarning && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-amber-600 text-lg shrink-0">⚠️</span>
            <div>
              <p className="text-amber-800 text-sm font-semibold mb-1">Tally Mismatch</p>
              <p className="text-amber-700 text-sm">
                Your submitted total ({formatNumber(totalVotes)}) does not match the recorded turnout ({formatNumber(station.totalVoted)} voters marked as voted)
                — discrepancy of {formatNumber(Math.abs(totalVotes - station.totalVoted))}.
              </p>
              <p className="text-amber-600 text-xs mt-2">If you have verified your counts, click Submit again to proceed.</p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl space-y-4">
        {(candidates || []).map((candidate) => (
          <Card key={candidate.id}>
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: candidate.color }}
              >
                {candidate.party}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{candidate.name}</h3>
                <p className="text-xs text-gray-500">{candidate.partyFull || candidate.party}</p>
              </div>
              <div className="w-28 md:w-32">
                <input
                  type="number"
                  min="0"
                  max={station.totalRegistered}
                  value={votes[candidate.id] || ''}
                  onChange={(e) => handleVoteChange(candidate.id, parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full text-right text-lg font-bold px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                />
              </div>
            </div>
          </Card>
        ))}

        {/* Total */}
        <Card className="bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">Total Votes</p>
              <p className="text-xs text-gray-500">
                Max: {formatNumber(station.totalRegistered)} registered voters
              </p>
              {station.totalVoted > 0 && (
                <p className="text-xs text-blue-600 mt-1">
                  Recorded turnout: {formatNumber(station.totalVoted)} voted
                </p>
              )}
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${station.totalVoted > 0 && totalVotes !== station.totalVoted && totalVotes > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                {formatNumber(totalVotes)}
              </p>
              {totalVotes > station.totalRegistered && (
                <Badge variant="danger">Exceeds registered voters</Badge>
              )}
              {station.totalVoted > 0 && totalVotes > 0 && totalVotes !== station.totalVoted && totalVotes <= station.totalRegistered && (
                <Badge variant="warning">Differs from turnout</Badge>
              )}
            </div>
          </div>
        </Card>

        {/* Result Type Selector */}
        <Card>
          <p className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Result Type</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setResultType('PROVISIONAL')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-semibold transition-colors ${
                resultType === 'PROVISIONAL'
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}
            >
              <p>Provisional</p>
              <p className="text-xs font-normal mt-0.5 opacity-75">Preliminary count, can be updated</p>
            </button>
            <button
              type="button"
              onClick={() => setResultType('FINAL')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-semibold transition-colors ${
                resultType === 'FINAL'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}
            >
              <p>Final</p>
              <p className="text-xs font-normal mt-0.5 opacity-75">Official verified count</p>
            </button>
          </div>
        </Card>

        <Button
          size="lg"
          className={`w-full ${resultType === 'FINAL' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-500 hover:bg-orange-600'}`}
          onClick={handleSubmitClick}
          loading={submitting}
          disabled={totalVotes === 0}
        >
          {submitted ? `Update ${resultType === 'FINAL' ? 'Final' : 'Provisional'} Results` : `Submit ${resultType === 'FINAL' ? 'Final' : 'Provisional'} Results`}
        </Button>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirmSubmit}
        title={`Submit ${typeLabel} Results`}
        message={confirmMessage}
        confirmLabel={`Submit ${typeLabel}`}
        variant={resultType === 'FINAL' ? 'danger' : 'warning'}
        loading={submitting}
      />
    </div>
  );
}
