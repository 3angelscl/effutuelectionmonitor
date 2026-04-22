'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/utils';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
  ChartBarIcon,
  TrophyIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';

interface CandidateVote {
  id: string;
  name: string;
  party: string;
  color: string;
  votes: number;
  votePct: number;
}

interface ElectionTrend {
  id: string;
  name: string;
  date: string | null;
  status: string;
  turnoutPct: number;
  totalVoted: number;
  totalRegistered: number;
  totalVotes: number;
  candidateVotes: CandidateVote[];
}

interface PartyElectionEntry {
  electionId: string;
  electionName: string;
  votes: number;
  votePct: number;
}

interface PartyTrend {
  name: string;
  color: string;
  elections: PartyElectionEntry[];
}

interface TrendsData {
  elections: ElectionTrend[];
  partyTrends: PartyTrend[];
}

interface AgeBucket {
  label: string;
  total: number;
  voted: number;
  turnoutPct: number;
}

interface DemographicsData {
  ageBuckets: AgeBucket[];
  totalVoters: number;
  totalVoted: number;
}

interface SnapshotElection {
  id: string;
  name: string;
  date: string | null;
  color: string;
}

interface SnapshotSeries {
  electionId: string;
  hoursElapsed: number;
  turnoutPct: number;
}

interface CompareData {
  elections: SnapshotElection[];
  series: SnapshotSeries[];
}

interface AreaCandidate {
  candidateId: string;
  candidateName: string;
  party: string;
  color: string;
  votes: number;
  percentage: number;
}

interface ElectoralAreaStat {
  electoralArea: string;
  stationCount: number;
  stationsReporting: number;
  registeredVoters: number;
  votedVoters: number;
  turnoutPct: number;
  candidates: AreaCandidate[];
}

// Simple bar chart using inline SVG
function BarChart({ data, color }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barColor = color || '#2563eb';
  return (
    <div className="flex items-end gap-2 h-28">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span className="text-xs font-semibold text-gray-700">{d.value}%</span>
          <div className="w-full rounded-t-md transition-all" style={{ height: `${(d.value / max) * 80}px`, backgroundColor: barColor + 'cc' }} />
          <span className="text-[10px] text-gray-500 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// Trend indicator
function Trend({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (Math.abs(diff) < 0.5) return <MinusIcon className="h-4 w-4 text-gray-400" />;
  return diff > 0
    ? <span className="flex items-center gap-0.5 text-green-600 text-xs font-semibold"><ArrowTrendingUpIcon className="h-3.5 w-3.5" />+{diff.toFixed(1)}%</span>
    : <span className="flex items-center gap-0.5 text-red-500 text-xs font-semibold"><ArrowTrendingDownIcon className="h-3.5 w-3.5" />{diff.toFixed(1)}%</span>;
}

export default function AnalyticsPage() {
  const { data, isLoading } = useSWR<TrendsData>('/api/elections/trends', fetcher);
  const { data: demoData } = useSWR<DemographicsData>('/api/stats/demographics', fetcher);
  const { data: areaData } = useSWR<ElectoralAreaStat[]>('/api/stats/electoral-area', fetcher);

  const elections = data?.elections || [];
  const partyTrends = data?.partyTrends || [];

  const electionIds = elections.map((e) => e.id).join(',');
  const { data: compareData } = useSWR<CompareData>(
    electionIds ? `/api/snapshots/compare?elections=${electionIds}` : null,
    fetcher
  );

  const ageBuckets = demoData?.ageBuckets || [];
  const compareElections = compareData?.elections || [];
  const compareSeries = compareData?.series || [];

  // Build multi-line SVG chart data
  const chartWidth = 500;
  const chartHeight = 160;
  const padLeft = 36;
  const padBottom = 24;
  const padTop = 8;
  const padRight = 8;
  const innerW = chartWidth - padLeft - padRight;
  const innerH = chartHeight - padTop - padBottom;

  const allHours = compareSeries.map((s) => s.hoursElapsed);
  const maxHours = allHours.length > 0 ? Math.max(...allHours) : 1;
  const maxTurnout = 100;

  function toX(h: number) {
    return padLeft + (h / (maxHours || 1)) * innerW;
  }
  function toY(pct: number) {
    return padTop + innerH - (pct / maxTurnout) * innerH;
  }

  const linesByElection = compareElections.map((el) => {
    const points = compareSeries
      .filter((s) => s.electionId === el.id)
      .sort((a, b) => a.hoursElapsed - b.hoursElapsed)
      .map((s) => `${toX(s.hoursElapsed).toFixed(1)},${toY(s.turnoutPct).toFixed(1)}`)
      .join(' ');
    return { ...el, points };
  });

  // Y-axis gridlines at 0, 25, 50, 75, 100
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="flex-1">
      <AdminHeader title="Trend Analytics" />

      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Trend Analytics</h2>
          <p className="text-sm text-gray-500 mt-1">Cross-election comparison and historical performance trends</p>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse h-48" />
            ))}
          </div>
        )}

        {!isLoading && elections.length === 0 && (
          <div className="py-24 flex flex-col items-center justify-center text-center">
            <ChartBarIcon className="h-16 w-16 text-gray-200 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No Data Yet</h3>
            <p className="text-sm text-gray-500 max-w-xs">
              Trend analytics will appear once at least one election has results recorded.
            </p>
          </div>
        )}

        {elections.length > 0 && (
          <>
            {/* Turnout Trend */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Voter Turnout Trend</h3>
                  <p className="text-sm text-gray-500">Turnout percentage across all recorded elections</p>
                </div>
                {elections.length >= 2 && (
                  <Trend
                    current={elections[elections.length - 1].turnoutPct}
                    previous={elections[elections.length - 2].turnoutPct}
                  />
                )}
              </div>
              <BarChart
                data={elections.map((e) => ({
                  label: e.name.length > 12 ? e.name.slice(0, 12) + '…' : e.name,
                  value: e.turnoutPct,
                }))}
                color="#2563eb"
              />
              {elections.length >= 2 && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Highest Turnout</p>
                    <p className="text-sm font-bold text-gray-900">
                      {Math.max(...elections.map((e) => e.turnoutPct))}%
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {elections.find((e) => e.turnoutPct === Math.max(...elections.map((x) => x.turnoutPct)))?.name}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Average Turnout</p>
                    <p className="text-sm font-bold text-gray-900">
                      {(elections.reduce((s, e) => s + e.turnoutPct, 0) / elections.length).toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500">across {elections.length} elections</p>
                  </div>
                </div>
              )}
            </Card>

            {/* Per-Election Results Grid */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Election Results Comparison</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {elections.map((election) => (
                  <Card key={election.id}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{election.name}</p>
                        {election.date && (
                          <p className="text-xs text-gray-500">
                            {new Date(election.date).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                      <Badge variant={election.status === 'COMPLETED' ? 'neutral' : 'success'} size="sm">
                        {election.status}
                      </Badge>
                    </div>
                    <div className="flex gap-4 text-center mb-4">
                      <div>
                        <p className="text-lg font-bold text-gray-900">{election.turnoutPct}%</p>
                        <p className="text-xs text-gray-500">Turnout</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-gray-900">{election.totalVotes.toLocaleString()}</p>
                        <p className="text-xs text-gray-500">Votes</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-gray-900">{election.candidateVotes.length}</p>
                        <p className="text-xs text-gray-500">Candidates</p>
                      </div>
                    </div>
                    {election.candidateVotes.slice(0, 3).map((c, i) => (
                      <div key={c.id} className="mb-2">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {i === 0 && c.votes > 0 && <TrophyIcon className="h-3 w-3 text-yellow-500 shrink-0" />}
                            <span className="font-medium text-gray-800 truncate">{c.name}</span>
                            <span className="text-gray-400 shrink-0">{c.party}</span>
                          </div>
                          <span className="font-semibold text-gray-900 shrink-0 ml-1">{c.votePct}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${c.votePct}%`, backgroundColor: c.color }} />
                        </div>
                      </div>
                    ))}
                  </Card>
                ))}
              </div>
            </div>

            {/* Party Performance Trends */}
            {partyTrends.length > 0 && elections.length >= 2 && (
              <Card>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Party Performance Over Time</h3>
                <p className="text-sm text-gray-500 mb-5">Vote share (%) per party across elections</p>
                <div className="space-y-6">
                  {partyTrends.map((party) => (
                    <div key={party.name}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: party.color }} />
                        <span className="text-sm font-semibold text-gray-900">{party.name}</span>
                        {party.elections.length >= 2 && (
                          <Trend
                            current={party.elections[party.elections.length - 1].votePct}
                            previous={party.elections[party.elections.length - 2].votePct}
                          />
                        )}
                      </div>
                      <div className="flex items-end gap-2 h-16">
                        {party.elections.map((pe, i) => {
                          const maxPct = Math.max(...party.elections.map((x) => x.votePct), 1);
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                              <span className="text-[10px] font-semibold text-gray-700">{pe.votePct}%</span>
                              <div
                                className="w-full rounded-t-sm"
                                style={{
                                  height: `${(pe.votePct / maxPct) * 40}px`,
                                  backgroundColor: party.color + 'bb',
                                }}
                              />
                              <span className="text-[9px] text-gray-400 truncate w-full text-center">{pe.electionName.slice(0, 10)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Voter Demographics */}
            <Card>
              <h3 className="text-base font-semibold text-gray-900 mb-1">Voter Demographics</h3>
              <p className="text-sm text-gray-500 mb-4">Turnout by age group for the active election</p>
              {ageBuckets.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No demographic data available.</p>
              ) : (
                <>
                  <div className="space-y-3">
                    {ageBuckets.map((bucket) => {
                      const votedPct = bucket.total > 0 ? (bucket.voted / bucket.total) * 100 : 0;
                      const notVotedPct = 100 - votedPct;
                      return (
                        <div key={bucket.label} className="flex items-center gap-3">
                          <span className="text-xs font-medium text-gray-700 w-12 shrink-0">{bucket.label}</span>
                          <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden flex">
                            {votedPct > 0 && (
                              <div
                                className="h-full bg-green-500 flex items-center justify-center"
                                style={{ width: `${votedPct}%` }}
                                title={`Voted: ${bucket.voted}`}
                              />
                            )}
                            {notVotedPct > 0 && (
                              <div
                                className="h-full bg-gray-300 flex items-center justify-center"
                                style={{ width: `${notVotedPct}%` }}
                                title={`Not voted: ${bucket.total - bucket.voted}`}
                              />
                            )}
                          </div>
                          <span className="text-xs font-semibold text-gray-700 w-10 text-right shrink-0">
                            {bucket.turnoutPct}%
                          </span>
                          <span className="text-[10px] text-gray-400 w-16 shrink-0">
                            {bucket.voted.toLocaleString()}/{bucket.total.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {ageBuckets.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span className="inline-block w-3 h-3 rounded-sm bg-green-500" />
                        Voted
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span className="inline-block w-3 h-3 rounded-sm bg-gray-300" />
                        Not voted
                      </div>
                      <span className="ml-auto text-sm text-gray-700">
                        Most active age group:{' '}
                        <span className="font-semibold text-gray-900">
                          {ageBuckets.reduce((best, b) => (b.turnoutPct > best.turnoutPct ? b : best), ageBuckets[0]).label}
                        </span>{' '}
                        (
                        {ageBuckets.reduce((best, b) => (b.turnoutPct > best.turnoutPct ? b : best), ageBuckets[0]).turnoutPct}%
                        {' '}turnout)
                      </span>
                    </div>
                  )}
                </>
              )}
            </Card>

            {/* Electoral Area Trends */}
            {areaData && areaData.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-1">
                  <MapPinIcon className="h-5 w-5 text-primary-500" />
                  <h3 className="text-base font-semibold text-gray-900">Electoral Area Trends</h3>
                </div>
                <p className="text-sm text-gray-500 mb-5">Turnout by electoral area for the active election</p>

                {/* Turnout bar chart per area */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Turnout by Electoral Area</p>
                  <div className="space-y-2">
                    {[...areaData]
                      .sort((a, b) => b.turnoutPct - a.turnoutPct)
                      .map((area) => (
                        <div key={area.electoralArea} className="flex items-center gap-3">
                          <span className="text-xs font-medium text-gray-700 w-44 shrink-0 truncate" title={area.electoralArea}>
                            {area.electoralArea}
                          </span>
                          <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                            <div
                              className="h-full rounded bg-primary-500 transition-all"
                              style={{ width: `${area.turnoutPct}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-gray-800 w-10 text-right shrink-0">
                            {area.turnoutPct}%
                          </span>
                          <div className="flex flex-col items-end w-28 shrink-0">
                            <span className="text-[10px] font-medium text-gray-700">
                              {area.votedVoters.toLocaleString()} / {area.registeredVoters.toLocaleString()}
                            </span>
                            <span className="text-[9px] text-gray-400">
                              {area.stationsReporting}/{area.stationCount} stns
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Turnout Progression Comparison */}
            <Card>
              <h3 className="text-base font-semibold text-gray-900 mb-1">Turnout Progression Comparison</h3>
              <p className="text-sm text-gray-500 mb-4">How turnout evolved over time for each election</p>
              {compareElections.length === 0 || compareSeries.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No snapshot history available</p>
              ) : (
                <>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-4 mb-4">
                    {compareElections.map((el) => (
                      <div key={el.id} className="flex items-center gap-1.5 text-xs text-gray-700">
                        <span className="inline-block w-4 h-0.5 rounded" style={{ backgroundColor: el.color }} />
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: el.color }}
                        />
                        {el.name}
                      </div>
                    ))}
                  </div>
                  {/* SVG multi-line chart */}
                  <div className="w-full overflow-x-auto">
                    <svg
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      className="w-full"
                      style={{ minWidth: 320 }}
                    >
                      {/* Gridlines */}
                      {yTicks.map((tick) => (
                        <g key={tick}>
                          <line
                            x1={padLeft}
                            y1={toY(tick)}
                            x2={chartWidth - padRight}
                            y2={toY(tick)}
                            stroke="#e5e7eb"
                            strokeWidth="1"
                          />
                          <text
                            x={padLeft - 4}
                            y={toY(tick) + 3}
                            textAnchor="end"
                            fontSize="9"
                            fill="#9ca3af"
                          >
                            {tick}%
                          </text>
                        </g>
                      ))}
                      {/* X axis label */}
                      <text
                        x={chartWidth / 2}
                        y={chartHeight - 2}
                        textAnchor="middle"
                        fontSize="9"
                        fill="#9ca3af"
                      >
                        Hours elapsed
                      </text>
                      {/* Lines per election */}
                      {linesByElection.map((el) =>
                        el.points ? (
                          <polyline
                            key={el.id}
                            points={el.points}
                            fill="none"
                            stroke={el.color}
                            strokeWidth="2"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                        ) : null
                      )}
                      {/* Dots per election */}
                      {compareElections.map((el) =>
                        compareSeries
                          .filter((s) => s.electionId === el.id)
                          .map((s, i) => (
                            <circle
                              key={`${el.id}-${i}`}
                              cx={toX(s.hoursElapsed)}
                              cy={toY(s.turnoutPct)}
                              r="2.5"
                              fill={el.color}
                            >
                              <title>{`${el.name}: ${s.turnoutPct}% at ${s.hoursElapsed}h`}</title>
                            </circle>
                          ))
                      )}
                    </svg>
                  </div>
                </>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
