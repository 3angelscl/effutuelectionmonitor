'use client';

import { useState, Fragment } from 'react';
import useSWR from 'swr';
import AdminHeader from '@/components/layout/AdminHeader';
import Card from '@/components/ui/Card';
import StatCard from '@/components/ui/StatCard';
import Badge from '@/components/ui/Badge';
import {
  UserGroupIcon,
  CheckCircleIcon,
  MapPinIcon,
  ChartBarIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ScoreBreakdown {
  assigned: number;
  checkedIn: number;
  checkInHistory: number;
  resultsSubmitted: number;
  votersProcessed: number;
}

interface AgentPerformance {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  photo: string | null;
  station: { id: string; psCode: string; name: string } | null;
  isCheckedIn: boolean;
  lastCheckIn: string | null;
  totalCheckIns: number;
  activityCount: number;
  resultsSubmitted: number;
  votersProcessed: number;
  performanceScore: number;
  scoreBreakdown: ScoreBreakdown;
}

interface PerformanceData {
  summary: {
    totalAgents: number;
    checkedIn: number;
    assigned: number;
    averageScore: number;
  };
  agents: AgentPerformance[];
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-green-600 bg-green-50';
  if (score >= 50) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

function getInitials(name: string) {
  const parts = name.split(' ');
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : name.slice(0, 2);
}

export default function AgentPerformancePage() {
  const { data } = useSWR<PerformanceData>('/api/agents/performance', fetcher, {
    refreshInterval: 30000,
  });
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const summary = data?.summary;
  const agents = data?.agents || [];

  return (
    <div className="flex-1">
      <AdminHeader title="Agent Performance" />

      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Agents"
            value={String(summary?.totalAgents || 0)}
            icon={<UserGroupIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Checked In"
            value={String(summary?.checkedIn || 0)}
            subtitle={summary ? `${Math.round((summary.checkedIn / Math.max(summary.totalAgents, 1)) * 100)}% of agents` : undefined}
            icon={<CheckCircleIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Assigned"
            value={String(summary?.assigned || 0)}
            subtitle={summary ? `${Math.round((summary.assigned / Math.max(summary.totalAgents, 1)) * 100)}% of agents` : undefined}
            icon={<MapPinIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Avg Performance"
            value={`${summary?.averageScore || 0}%`}
            icon={<ChartBarIcon className="h-6 w-6" />}
          />
        </div>

        {/* Performance Table */}
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Agent</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Station</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Check-ins</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Voters Processed</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Results</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Activities</th>
                  <th className="text-center py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Score</th>
                </tr>
              </thead>
              <tbody>
                {agents
                  .sort((a, b) => b.performanceScore - a.performanceScore)
                  .map((agent) => (
                    <Fragment key={agent.id}>
                    <tr className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          {agent.photo ? (
                            <img
                              src={agent.photo}
                              alt={agent.name}
                              className="w-9 h-9 rounded-full object-cover border-2 border-gray-100"
                            />
                          ) : (
                            <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 text-xs font-bold">
                              {getInitials(agent.name)}
                            </div>
                          )}
                          <div>
                            <a
                              href={`/admin/agents/${agent.id}`}
                              className="font-semibold text-gray-900 hover:text-primary-600 transition-colors"
                            >
                              {agent.name}
                            </a>
                            <p className="text-xs text-gray-500">{agent.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {agent.station ? (
                          <div>
                            <p className="text-gray-900 font-medium text-xs">{agent.station.name}</p>
                            <p className="text-xs text-primary-600">{agent.station.psCode}</p>
                          </div>
                        ) : (
                          <span className="text-orange-500 italic text-xs">Unassigned</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {agent.isCheckedIn ? (
                          <Badge variant="success" dot>Checked In</Badge>
                        ) : agent.station ? (
                          <Badge variant="warning" dot>Not Checked In</Badge>
                        ) : (
                          <Badge variant="neutral">N/A</Badge>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center text-gray-700 font-medium">
                        {agent.totalCheckIns}
                      </td>
                      <td className="py-4 px-4 text-center text-gray-700 font-medium">
                        {agent.votersProcessed}
                      </td>
                      <td className="py-4 px-4 text-center text-gray-700 font-medium">
                        {agent.resultsSubmitted}
                      </td>
                      <td className="py-4 px-4 text-center text-gray-700 font-medium">
                        {agent.activityCount}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${getScoreColor(agent.performanceScore)} hover:opacity-80 transition-opacity`}
                          title="Click for score breakdown"
                        >
                          {agent.performanceScore}%
                          <ChevronDownIcon className={`h-3 w-3 transition-transform ${expandedAgent === agent.id ? 'rotate-180' : ''}`} />
                        </button>
                      </td>
                    </tr>
                    {expandedAgent === agent.id && (
                      <tr className="bg-gray-50/80">
                        <td colSpan={8} className="px-6 py-3">
                          <div className="flex flex-wrap gap-4 text-xs">
                            <span className="font-semibold text-gray-700">Score Breakdown:</span>
                            <span className={agent.scoreBreakdown.assigned > 0 ? 'text-green-700' : 'text-gray-400'}>
                              Assigned to station: <strong>+{agent.scoreBreakdown.assigned}</strong>
                            </span>
                            <span className={agent.scoreBreakdown.checkedIn > 0 ? 'text-green-700' : 'text-gray-400'}>
                              Currently checked in: <strong>+{agent.scoreBreakdown.checkedIn}</strong>
                            </span>
                            <span className={agent.scoreBreakdown.checkInHistory > 0 ? 'text-blue-700' : 'text-gray-400'}>
                              Check-in history: <strong>+{agent.scoreBreakdown.checkInHistory}</strong>
                            </span>
                            <span className={agent.scoreBreakdown.resultsSubmitted > 0 ? 'text-purple-700' : 'text-gray-400'}>
                              Results submitted: <strong>+{agent.scoreBreakdown.resultsSubmitted}</strong>
                            </span>
                            <span className={agent.scoreBreakdown.votersProcessed > 0 ? 'text-orange-700' : 'text-gray-400'}>
                              Voters processed: <strong>+{agent.scoreBreakdown.votersProcessed}</strong>
                            </span>
                            <span className="text-gray-900 font-bold ml-2">
                              Total: {agent.performanceScore}/100
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                {agents.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-500">
                      No agents found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Score Legend */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Scoring Criteria (click a score to see breakdown)</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>Assigned to station (max +20)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>Currently checked in (max +25)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span>Has check-in history (max +15)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span>Results submitted (max +20)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span>Voters processed (up to +20)</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
