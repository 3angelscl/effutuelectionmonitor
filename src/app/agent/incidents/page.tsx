'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Station {
  id: string;
  psCode: string;
  name: string;
  agentId: string | null;
}

interface Incident {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  station: { name: string; psCode: string };
}

interface IncidentResponse {
  incidents: Incident[];
  total: number;
  page: number;
  totalPages: number;
}

const INCIDENT_TYPES = [
  { value: 'IRREGULARITY', label: 'Irregularity' },
  { value: 'VIOLENCE', label: 'Violence' },
  { value: 'EQUIPMENT_FAILURE', label: 'Equipment Failure' },
  { value: 'VOTER_INTIMIDATION', label: 'Voter Intimidation' },
  { value: 'OTHER', label: 'Other' },
];

const SEVERITY_LEVELS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

function getSeverityVariant(severity: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (severity) {
    case 'LOW': return 'success';
    case 'MEDIUM': return 'warning';
    case 'HIGH': return 'danger';
    case 'CRITICAL': return 'danger';
    default: return 'neutral';
  }
}

function getStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'OPEN': return 'danger';
    case 'INVESTIGATING': return 'warning';
    case 'RESOLVED': return 'success';
    case 'DISMISSED': return 'neutral';
    default: return 'neutral';
  }
}

export default function AgentIncidentsPage() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string })?.id;

  const { data: stations } = useSWR<Station[]>('/api/stations', fetcher);
  const station = (stations || []).find((s) => s.agentId === userId);

  const { data: incidentData, mutate } = useSWR<IncidentResponse>(
    '/api/incidents?limit=50',
    fetcher,
    { refreshInterval: 30000 }
  );

  const [type, setType] = useState('IRREGULARITY');
  const [severity, setSeverity] = useState('MEDIUM');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // Auto-detect GPS location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      setGpsStatus('loading');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude);
          setLongitude(position.coords.longitude);
          setGpsStatus('success');
        },
        () => {
          setGpsStatus('error');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!station?.id) return;

    setError('');
    setSuccess('');

    if (!title.trim() || !description.trim()) {
      setError('Title and description are required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: station.id,
          type,
          severity,
          title: title.trim(),
          description: description.trim(),
          latitude,
          longitude,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to submit incident');
        return;
      }

      setSuccess('Incident reported successfully');
      setTitle('');
      setDescription('');
      setType('IRREGULARITY');
      setSeverity('MEDIUM');
      mutate();
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

  const incidents = incidentData?.incidents || [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900">Report Incident</h2>
        <p className="text-gray-500 text-sm mt-1">
          {station.name} ({station.psCode})
        </p>
      </div>

      {/* Submit Form */}
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Incident Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              >
                {INCIDENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              >
                {SEVERITY_LEVELS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the incident"
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide detailed information about the incident..."
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
              required
            />
          </div>

          {/* GPS Status */}
          <div className="flex items-center gap-2 text-sm">
            {gpsStatus === 'loading' && (
              <span className="text-gray-500">Detecting GPS location...</span>
            )}
            {gpsStatus === 'success' && (
              <span className="text-green-600">
                GPS location detected ({latitude?.toFixed(6)}, {longitude?.toFixed(6)})
              </span>
            )}
            {gpsStatus === 'error' && (
              <span className="text-yellow-600">GPS unavailable - incident will be submitted without location</span>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-green-700 text-sm">{success}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-red-600 hover:bg-red-700"
            loading={submitting}
            disabled={!title.trim() || !description.trim()}
          >
            Report Incident
          </Button>
        </form>
      </Card>

      {/* Previous Incidents */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">My Previous Incidents</h3>
        {incidents.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-gray-500 text-sm">No incidents reported yet.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {incidents.map((incident) => (
              <Card key={incident.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-gray-900 text-sm truncate">{incident.title}</h4>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2 mb-2">{incident.description}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={getSeverityVariant(incident.severity)}>
                        {incident.severity}
                      </Badge>
                      <Badge variant={getStatusVariant(incident.status)}>
                        {incident.status}
                      </Badge>
                      <span className="text-xs text-gray-400">
                        {incident.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">
                      {new Date(incident.createdAt).toLocaleString('en-GB', {
                        day: '2-digit', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
