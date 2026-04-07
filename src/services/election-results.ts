/**
 * Election Results Service
 *
 * Contains all business logic for submitting and exporting election results.
 * Route handlers should delegate to these functions rather than embedding
 * DB queries and validation inline.
 *
 * Benefits:
 *  - Testable without spinning up an HTTP server
 *  - Logic reusable across multiple API routes
 *  - DB queries isolated in one place
 */

import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { broadcastEvent } from '@/lib/events';
import { invalidateLiveSummary } from '@/lib/live-summary';
import { ApiError } from '@/lib/api-auth';
import type { AuthUser } from '@/lib/api-auth';

export interface ResultEntry {
  candidateId: string;
  votes: number;
  /** Optional optimistic-concurrency token from the client. If provided and
   *  the stored row's version has advanced past this value, the submission
   *  is rejected with 409 Conflict. */
  expectedVersion?: number;
}

export interface SubmitResultsInput {
  stationId: string;
  results: ResultEntry[];
  resultType: 'PROVISIONAL' | 'FINAL';
  adminOverride: boolean;
  user: AuthUser;
}

export interface SubmitResultsOutput {
  stationCode: string;
  electionId: string;
  totalVotes: number;
  registeredVotersCount: number;
}

/**
 * Validate and persist election results for a polling station.
 *
 * All validation and writes happen inside a single serialisable transaction
 * to prevent TOCTOU races (voter count drift, concurrent FINAL submissions).
 */
export async function submitResults(input: SubmitResultsInput): Promise<SubmitResultsOutput> {
  const { stationId, results, resultType, adminOverride, user } = input;

  const station = await prisma.pollingStation.findUnique({ where: { id: stationId } });
  if (!station) throw new ApiError(404, 'Polling station not found');

  if (user.role === 'AGENT' && station.agentId !== user.id) {
    throw new ApiError(403, 'Not authorized for this polling station');
  }

  if (user.role === 'AGENT') {
    const latestCheckIn = await prisma.agentCheckIn.findFirst({
      where: {
        userId: user.id,
        stationId,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!latestCheckIn || latestCheckIn.type !== 'CHECK_IN') {
      throw new ApiError(403, 'You must check in at your polling station before submitting results');
    }
  }

  const activeElection = await prisma.election.findFirst({ where: { isActive: true } });
  if (!activeElection) throw new ApiError(400, 'No active election');

  const totalSubmittedVotes = results.reduce((sum, r) => sum + r.votes, 0);
  let registeredVotersCount = 0;

  await prisma.$transaction(async (tx) => {
    registeredVotersCount = await tx.voter.count({
      where: { stationId, deletedAt: null },
    });

    if (totalSubmittedVotes > registeredVotersCount) {
      if (user.role !== 'ADMIN' || !adminOverride) {
        throw new ApiError(
          400,
          `Total votes (${totalSubmittedVotes}) exceed registered voters (${registeredVotersCount}).`,
        );
      }
    }

    const lockedCount = await tx.electionResult.count({
      where: { stationId, electionId: activeElection.id, resultType: 'FINAL' },
    });

    if (lockedCount > 0) {
      if (user.role === 'AGENT') {
        throw new ApiError(
          403,
          'Final results have already been submitted. Results are locked.',
        );
      }
      if (!adminOverride) {
        throw new ApiError(
          403,
          'Results are locked (FINAL). An admin override is required.',
        );
      }
    }

    for (const r of results) {
      const existing = await tx.electionResult.findFirst({
        where: { stationId, candidateId: r.candidateId, electionId: activeElection.id },
        select: { id: true, version: true },
      });

      if (existing) {
        // Optimistic concurrency: if the client supplied expectedVersion,
        // it must match the stored version. updateMany returns a count so
        // we can detect races without a second query.
        if (r.expectedVersion !== undefined) {
          const { count } = await tx.electionResult.updateMany({
            where: { id: existing.id, version: r.expectedVersion },
            data: {
              votes: r.votes,
              resultType,
              submittedById: user.id,
              version: { increment: 1 },
            },
          });
          if (count === 0) {
            throw new ApiError(
              409,
              `Result for candidate ${r.candidateId} was updated by another user. ` +
              `Reload and try again. (expected v${r.expectedVersion}, stored v${existing.version})`,
            );
          }
        } else {
          // Legacy clients without version tokens — last-write-wins.
          await tx.electionResult.update({
            where: { id: existing.id },
            data: {
              votes: r.votes,
              resultType,
              submittedById: user.id,
              version: { increment: 1 },
            },
          });
        }
      } else {
        if (r.expectedVersion !== undefined) {
          throw new ApiError(
            409,
            `Result for candidate ${r.candidateId} no longer exists. Reload and try again.`,
          );
        }
        await tx.electionResult.create({
          data: {
            stationId,
            candidateId: r.candidateId,
            votes: r.votes,
            resultType,
            submittedById: user.id,
            electionId: activeElection.id,
          },
        });
      }
    }
  });

  await logAudit({
    userId: user.id,
    action: 'SUBMIT',
    entity: 'ElectionResult',
    entityId: stationId,
    detail: `Submitted ${resultType} results for station "${station.psCode}" (${results.length} candidates)`,
    metadata: {
      stationId,
      resultType,
      candidateCount: results.length,
      totalVotes: totalSubmittedVotes,
      registeredVotersCount,
    },
  });

  await invalidateLiveSummary(activeElection.id);

  broadcastEvent('results:submitted', {
    stationId,
    stationCode: station.psCode,
    electionId: activeElection.id,
    resultType,
  });

  return {
    stationCode: station.psCode,
    electionId: activeElection.id,
    totalVotes: totalSubmittedVotes,
    registeredVotersCount,
  };
}

export interface ExportFilter {
  electionId?: string | null;
  candidateId?: string | null;
}

export interface ExportRow {
  Election: string;
  'PS Code': string;
  'Station Name': string;
  Candidate: string;
  Party: string;
  Votes: number;
  'Submitted By': string;
  'Submitted At': string;
}

export interface ExportResult {
  rows: ExportRow[];
  wasTruncated: boolean;
  rowLimit: number;
}

/** Fetch results for export, capped at MAX_EXPORT_ROWS with truncation detection. */
export async function getResultsForExport(filter: ExportFilter): Promise<ExportResult> {
  let { electionId } = filter;
  const { candidateId } = filter;

  if (!electionId) {
    const active = await prisma.election.findFirst({ where: { isActive: true } });
    electionId = active?.id ?? null;
  }

  const where: Record<string, string> = {};
  if (electionId) where.electionId = electionId;
  if (candidateId) where.candidateId = candidateId;

  const MAX_EXPORT_ROWS = 50_000;

  const raw = await prisma.electionResult.findMany({
    where,
    include: {
      candidate: true,
      pollingStation: { select: { name: true, psCode: true } },
      submittedBy: { select: { name: true } },
      election: { select: { name: true } },
    },
    orderBy: [{ pollingStation: { psCode: 'asc' } }, { votes: 'desc' }],
    take: MAX_EXPORT_ROWS + 1,
  });

  const wasTruncated = raw.length > MAX_EXPORT_ROWS;
  const results = wasTruncated ? raw.slice(0, MAX_EXPORT_ROWS) : raw;

  const rows: ExportRow[] = results.map((r) => ({
    Election: r.election.name,
    'PS Code': r.pollingStation.psCode,
    'Station Name': r.pollingStation.name,
    Candidate: r.candidate.name,
    Party: r.candidate.party,
    Votes: r.votes,
    'Submitted By': r.submittedBy.name,
    'Submitted At': r.updatedAt.toISOString(),
  }));

  return { rows, wasTruncated, rowLimit: MAX_EXPORT_ROWS };
}
