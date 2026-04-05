/**
 * Centralized Zod validation schemas for all API inputs.
 *
 * Usage in route handlers:
 *   import { electionCreateSchema } from '@/lib/validations';
 *   import { parseBody } from '@/lib/validations';
 *
 *   const data = await parseBody(request, electionCreateSchema);
 */

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { sanitizeText } from './sanitize';
import { ApiError } from './api-auth';

// ─── Helpers ────────────────────────────────────────────────

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Throws a friendly 400 error with field-level details on failure.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Invalid JSON body');
  }
  return parseData(body, schema);
}

/**
 * Parse and validate arbitrary data against a Zod schema.
 */
export function parseData<T extends z.ZodTypeAny>(
  data: unknown,
  schema: T,
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fieldErrors = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ValidationError(
      fieldErrors.map((e) => `${e.field}: ${e.message}`).join('; '),
      fieldErrors,
    );
  }
  return result.data;
}

export class ValidationError extends ApiError {
  constructor(
    message: string,
    public readonly fieldErrors?: { field: string; message: string }[],
  ) {
    super(400, message);
  }

  toResponse() {
    return NextResponse.json(
      {
        error: this.message,
        ...(this.fieldErrors && { fieldErrors: this.fieldErrors }),
      },
      { status: 400 },
    );
  }
}

/**
 * Parse query/search params against a Zod schema.
 */
export function parseQuery<T extends z.ZodTypeAny>(
  searchParams: URLSearchParams,
  schema: T,
): z.infer<T> {
  const obj: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    obj[key] = value;
  });
  return parseData(obj, schema);
}

// ─── Pagination ─────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Parse page/limit from URL search params, guarding against negative/NaN values.
 * Returns validated { page, limit, skip } ready for Prisma queries.
 */
export function parsePagination(
  searchParams: URLSearchParams,
  opts?: { defaultLimit?: number },
): { page: number; limit: number; skip: number } {
  const schema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(opts?.defaultLimit ?? 20),
  });
  const raw = {
    page: searchParams.get('page') ?? '1',
    limit: searchParams.get('limit') ?? String(opts?.defaultLimit ?? 20),
  };
  const result = schema.safeParse(raw);
  const { page, limit } = result.success ? result.data : { page: 1, limit: opts?.defaultLimit ?? 20 };
  return { page, limit, skip: (page - 1) * limit };
}

// ─── Auth Schemas ───────────────────────────────────────────

export const passwordComplexityMsg = 'Password must contain at least 1 uppercase letter, 1 number, and 1 special character';
export const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/;

export const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  totp: z.string().optional(),
});

export const resetRequestSchema = z.object({
  email: z.string().email('Valid email required'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(passwordRegex, passwordComplexityMsg),
});

// ─── Election Schemas ───────────────────────────────────────

// Accept both ISO datetime ("2024-12-07T00:00:00Z") and date-only ("2024-12-07") strings
const dateStringSchema = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Invalid date format' },
);

export const electionCreateSchema = z.object({
  name: z.string().min(1, 'Election name is required').max(200).transform((s) => sanitizeText(s)),
  description: z.string().max(1000).optional().nullable().transform((s) => (s ? sanitizeText(s) : s)),
  date: dateStringSchema.optional().nullable(),
});

export const electionUpdateSchema = z.object({
  id: z.string().uuid('Valid election ID required'),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  date: dateStringSchema.optional().nullable(),
  status: z.enum(['UPCOMING', 'ONGOING', 'COMPLETED']).optional(),
  favCandidate1Id: z.string().uuid().optional().nullable(),
  favCandidate2Id: z.string().uuid().optional().nullable(),
});

// ─── Candidate Schemas ──────────────────────────────────────

// Accepts relative upload paths (/uploads/...), absolute URLs, or empty string (treated as null)
const photoSchema = z.string()
  .refine(
    (v) => !v || v.startsWith('/') || URL.canParse(v),
    'Photo must be a valid URL or upload path',
  )
  .transform((v) => v || null)
  .optional()
  .nullable();

export const candidateCreateSchema = z.object({
  name: z.string().min(1, 'Candidate name is required').max(200).transform((s) => sanitizeText(s)),
  party: z.string().min(1, 'Party is required').max(100).transform((s) => sanitizeText(s)),
  partyFull: z.string().max(200).optional().nullable().transform((s) => (s ? sanitizeText(s) : s)),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex code like #3B82F6')
    .default('#3B82F6'),
  photo: photoSchema,
  electionId: z.string().uuid().optional(),
});

export const candidateUpdateSchema = z.object({
  id: z.string().uuid('Valid candidate ID required'),
  name: z.string().min(1).max(200).transform((s) => sanitizeText(s)).optional(),
  party: z.string().min(1).max(100).transform((s) => sanitizeText(s)).optional(),
  partyFull: z.string().max(200).optional().nullable().transform((s) => (s ? sanitizeText(s) : s)),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  photo: photoSchema,
});

// ─── User Schemas ───────────────────────────────────────────

export const userCreateSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(passwordRegex, passwordComplexityMsg),
  name: z.string().min(1, 'Name is required').max(200).transform((s) => sanitizeText(s)),
  role: z.enum(['ADMIN', 'AGENT', 'VIEWER', 'OFFICER']),
  phone: z.string().max(20).optional().nullable(),
  photo: photoSchema,
  stationId: z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
});

export const userUpdateSchema = z.object({
  name: z.string().min(1).max(200).transform((s) => sanitizeText(s)).optional(),
  phone: z.string().max(20).optional().nullable(),
  photo: photoSchema,
  role: z.enum(['ADMIN', 'AGENT', 'VIEWER', 'OFFICER']).optional(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(passwordRegex, passwordComplexityMsg)
    .optional(),
});

// ─── Station Schemas ────────────────────────────────────────

export const stationCreateSchema = z.object({
  psCode: z.string().min(1, 'PS Code is required').max(50).transform((s) => sanitizeText(s)),
  name: z.string().min(1, 'Station name is required').max(200).transform((s) => sanitizeText(s)),
  location: z.string().max(500).optional().nullable().transform((s) => (s ? sanitizeText(s) : s)),
  ward: z.string().max(200).optional().nullable().transform((s) => (s ? sanitizeText(s) : s)),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
});

export const stationUpdateSchema = z.object({
  id: z.string().uuid('Valid station ID required'),
  name: z.string().min(1).max(200).transform((s) => sanitizeText(s)).optional(),
  location: z.string().max(500).optional().nullable().transform((s) => (s ? sanitizeText(s) : s)),
  ward: z.string().max(200).optional().nullable().transform((s) => (s ? sanitizeText(s) : s)),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
});

export const stationAssignSchema = z.object({
  agentId: z.string().uuid('Valid agent ID required'),
  stationId: z.string().uuid('Valid station ID required'),
});

export const bulkAssignSchema = z.object({
  assignments: z
    .array(
      z.object({
        agentId: z.string().uuid(),
        stationId: z.string().uuid(),
      }),
    )
    .min(1, 'At least one assignment is required')
    .max(100, 'Maximum 100 assignments at once'),
});

// ─── Results Schemas ────────────────────────────────────────

export const resultSubmitSchema = z.object({
  stationId: z.string().uuid('Valid station ID required'),
  results: z
    .array(
      z.object({
        candidateId: z.string().uuid(),
        votes: z.number().int().min(0, 'Votes must be a non-negative integer').max(999999, 'Vote count exceeds maximum allowed'),
        // Optional optimistic-concurrency token. When present, the server will
        // only update if the stored row's version matches — otherwise 409.
        expectedVersion: z.number().int().min(1).optional(),
      }),
    )
    .min(1, 'At least one result is required'),
  resultType: z.enum(['PROVISIONAL', 'FINAL']).default('PROVISIONAL'),
  adminOverride: z.boolean().default(false),
});

// ─── Chat Schemas ───────────────────────────────────────────

export const chatSendSchema = z.object({
  receiverId: z.string().uuid('Valid receiver ID required'),
  message: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(5000, 'Message too long (max 5000 characters)')
    .transform((s) => sanitizeText(s.trim())),
});

export const broadcastSchema = z.object({
  message: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(5000, 'Message too long (max 5000 characters)')
    .transform((s) => sanitizeText(s.trim())),
});

// ─── Incident Schemas ───────────────────────────────────────

export const incidentCreateSchema = z.object({
  stationId: z.string().uuid('Valid station ID required'),
  type: z.enum([
    'IRREGULARITY',
    'VIOLENCE',
    'EQUIPMENT_FAILURE',
    'VOTER_INTIMIDATION',
    'OTHER',
  ]),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  title: z.string().min(1, 'Title is required').max(200).transform((s) => sanitizeText(s)),
  description: z.string().min(1, 'Description is required').max(5000).transform((s) => sanitizeText(s)),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  photoUrl: z.string().optional().nullable(),
});

export const incidentUpdateSchema = z.object({
  status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']),
  resolvedAt: z.string().datetime().optional(),
});

// ─── Check-in Schemas ───────────────────────────────────────

export const checkinSchema = z.object({
  type: z.enum(['CHECK_IN', 'CHECK_OUT']),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
});

// ─── Turnout Schema ─────────────────────────────────────────

export const turnoutMarkSchema = z.object({
  voterId: z.string().min(1, 'Voter ID required'),
  hasVoted: z.boolean(),
});

// ─── Voter Schemas ──────────────────────────────────────────

export const voterCreateSchema = z.object({
  voterId: z.string().min(1, 'Voter ID is required').max(50).transform((s) => sanitizeText(s)),
  firstName: z.string().min(1, 'First name is required').max(100).transform((s) => sanitizeText(s)),
  lastName: z.string().min(1, 'Last name is required').max(100).transform((s) => sanitizeText(s)),
  age: z.coerce.number().int().min(18, 'Must be at least 18').max(150),
  psCode: z.string().min(1, 'PS Code is required'),
  photo: photoSchema,
});

export const voterUpdateSchema = z.object({
  id: z.string().uuid('Valid ID required'),
  voterId: z.string().min(1).max(50).transform((s) => sanitizeText(s)).optional(),
  firstName: z.string().min(1).max(100).transform((s) => sanitizeText(s)).optional(),
  lastName: z.string().min(1).max(100).transform((s) => sanitizeText(s)).optional(),
  age: z.coerce.number().int().min(18).max(150).optional(),
  photo: photoSchema,
});
