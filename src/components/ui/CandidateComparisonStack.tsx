'use client';

import { formatNumber } from '@/lib/utils';

interface CandidateData {
  candidateId: string;
  candidateName: string;
  party: string;
  color: string;
  totalVotes: number;
  percentage: number;
}

interface Props {
  candidate1: CandidateData | null;
  candidate2: CandidateData | null;
  totalVotes: number;
}

export default function CandidateComparisonStack({ candidate1, candidate2, totalVotes }: Props) {
  if (!candidate1 && !candidate2) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <p className="text-sm text-gray-500">No favorite candidates set for comparison.</p>
      </div>
    );
  }

  const c1Votes = candidate1?.totalVotes || 0;
  const c2Votes = candidate2?.totalVotes || 0;

  // Percentages of total valid votes
  const c1Percentage = totalVotes > 0 ? Math.round((c1Votes / totalVotes) * 1000) / 10 : 0;
  const c2Percentage = totalVotes > 0 ? Math.round((c2Votes / totalVotes) * 1000) / 10 : 0;
  const otherPercentage = Math.max(0, 100 - c1Percentage - c2Percentage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-900">Key Candidates Comparison</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: candidate1?.color || '#cbd5e1' }} />
            <span className="text-xs font-bold text-gray-600 truncate max-w-[80px]">
              {candidate1?.party || 'N/A'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: candidate2?.color || '#cbd5e1' }} />
            <span className="text-xs font-bold text-gray-600 truncate max-w-[80px]">
              {candidate2?.party || 'N/A'}
            </span>
          </div>
        </div>
      </div>

      <div className="relative h-14 w-full bg-gray-100 rounded-2xl overflow-hidden shadow-inner flex border border-gray-200/50">
        {/* 50% Marker */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-900/10 z-10 flex flex-col items-center">
          <div className="absolute -top-1 px-1.5 py-0.5 bg-gray-800 text-white text-[9px] font-black rounded uppercase tracking-tighter">
            50%
          </div>
        </div>

        {/* Candidate 1 Segment */}
        {candidate1 && (
          <div
            className="h-full transition-all duration-1000 ease-in-out relative flex items-center justify-center"
            style={{ width: `${c1Percentage}%`, backgroundColor: candidate1.color }}
          >
            {c1Percentage >= 10 && (
              <span className="text-white font-black text-sm drop-shadow-sm">
                {c1Percentage}%
              </span>
            )}
          </div>
        )}

        {/* Candidate 2 Segment */}
        {candidate2 && (
          <div
            className="h-full transition-all duration-1000 ease-in-out relative flex items-center justify-center border-l-2 border-white/10"
            style={{ width: `${c2Percentage}%`, backgroundColor: candidate2.color }}
          >
            {c2Percentage >= 10 && (
              <span className="text-white font-black text-sm drop-shadow-sm">
                {c2Percentage}%
              </span>
            )}
          </div>
        )}

        {/* Remaining Space (Other Candidates / Unaccounted) */}
        {otherPercentage > 0 && (
          <div
            className="h-full bg-gray-200 transition-all duration-1000"
            style={{ width: `${otherPercentage}%` }}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div
          className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm transition-all"
          style={{ borderLeft: `4px solid ${candidate1?.color || '#e2e8f0'}` }}
        >
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
            {candidate1?.candidateName || 'Candidate 1'}
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-black text-gray-900">
              {formatNumber(c1Votes)}
            </span>
            <span className="text-[10px] font-bold text-gray-400">VOTES</span>
            <span className="text-xs font-bold ml-auto" style={{ color: candidate1?.color || '#94a3b8' }}>
              {c1Percentage}%
            </span>
          </div>
        </div>

        <div
          className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm transition-all"
          style={{ borderLeft: `4px solid ${candidate2?.color || '#e2e8f0'}` }}
        >
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
            {candidate2?.candidateName || 'Candidate 2'}
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-black text-gray-900">
              {formatNumber(c2Votes)}
            </span>
            <span className="text-[10px] font-bold text-gray-400">VOTES</span>
            <span className="text-xs font-bold ml-auto" style={{ color: candidate2?.color || '#94a3b8' }}>
              {c2Percentage}%
            </span>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-gray-400 text-center uppercase font-bold tracking-tighter">
        Relative performance of selected candidates vs total valid votes ({formatNumber(totalVotes)})
      </p>
    </div>
  );
}
