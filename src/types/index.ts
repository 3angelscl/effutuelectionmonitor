export type UserRole = 'ADMIN' | 'AGENT' | 'VIEWER' | 'OFFICER';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  photo?: string | null;
}

export interface Election {
  id: string;
  name: string;
  description: string | null;
  date: string | null;
  isActive: boolean;
  status: string;
}

export interface StationStats {
  psCode: string;
  name: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  resultType: string | null;
  totalRegistered: number;
  totalVoted: number;
  turnoutPercentage: number;
  agentName: string | null;
}

export interface CandidateResult {
  candidateId: string;
  candidateName: string;
  party: string;
  partyFull: string | null;
  color: string;
  totalVotes: number;
  percentage: number;
}

export interface Discrepancy {
  psCode: string;
  stationName: string;
  type: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  details: Record<string, number>;
}

export interface DashboardStats {
  totalRegisteredVoters: number;
  totalVoted: number;
  turnoutPercentage: number;
  totalStations: number;
  stationsReporting: number;
  stationsCompleted: number;
  candidateResults: CandidateResult[];
  stations: StationStats[];
  election: Election | null;
  overallResultType: string | null;
  discrepancies: Discrepancy[];
  favCandidate1: CandidateResult | null;
  favCandidate2: CandidateResult | null;
}

export interface VoterUploadResult {
  successCount: number;
  errorCount: number;
  errors: string[];
}
