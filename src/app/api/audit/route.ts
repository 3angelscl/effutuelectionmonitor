import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma';

const RETENTION_DAYS = 14;

function escapeCsvField(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildAuditWhere(searchParams: URLSearchParams): Prisma.ActivityLogWhereInput {
  const type = searchParams.get('type') || '';
  const userId = searchParams.get('userId') || '';
  const action = searchParams.get('action') || '';
  const entity = searchParams.get('entity') || '';
  const search = searchParams.get('search') || '';
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  const where: Prisma.ActivityLogWhereInput = {};

  if (type) where.type = type;
  if (userId) where.userId = userId;
  if (action) where.title = { startsWith: action };

  if (entity) {
    where.AND = [
      ...(where.AND && Array.isArray(where.AND) ? where.AND : []),
      {
        OR: [
          { title: { contains: entity, mode: 'insensitive' } },
          { detail: { contains: entity, mode: 'insensitive' } },
          { metadata: { contains: `"entity":"${entity}"` } },
          { metadata: { contains: `"entity": "${entity}"` } },
        ],
      },
    ];
  }

  if (dateFrom || dateTo) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (dateFrom) createdAt.gte = new Date(`${dateFrom}T00:00:00`);
    if (dateTo) createdAt.lte = new Date(`${dateTo}T23:59:59.999`);
    where.createdAt = createdAt;
  }

  if (search.trim()) {
    const searchOr: Prisma.ActivityLogWhereInput[] = [
      { title: { contains: search, mode: 'insensitive' } },
      { detail: { contains: search, mode: 'insensitive' } },
      { metadata: { contains: search, mode: 'insensitive' } },
      { user: { is: { name: { contains: search, mode: 'insensitive' } } } },
      { user: { is: { email: { contains: search, mode: 'insensitive' } } } },
      { user: { is: { role: { contains: search, mode: 'insensitive' } } } },
    ];
    where.AND = [
      ...(where.AND && Array.isArray(where.AND) ? where.AND : []),
      { OR: searchOr },
    ];
  }

  return where;
}

export async function GET(request: NextRequest) {
  try {
    await requireRole('ADMIN');

    const { searchParams } = new URL(request.url);
    const exportMode = searchParams.get('export');
    const where = buildAuditWhere(searchParams);

    if (exportMode === 'csv') {
      const MAX_EXPORT_ROWS = 100_000;
      const logs = await prisma.activityLog.findMany({
        where,
        include: {
          user: { select: { name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_EXPORT_ROWS,
      });

      const today = new Date().toISOString().slice(0, 10);
      const header = 'Date,Time,Type,User,Email,Role,Action,Title,Detail,Metadata\r\n';
      const rows = logs.map((log) => {
        const d = new Date(log.createdAt);
        const date = d.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        const time = d.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        const action = log.title.split(' ')[0];

        return [
          escapeCsvField(date),
          escapeCsvField(time),
          escapeCsvField(log.type),
          escapeCsvField(log.user.name),
          escapeCsvField(log.user.email),
          escapeCsvField(log.user.role),
          escapeCsvField(action),
          escapeCsvField(log.title),
          escapeCsvField(log.detail),
          escapeCsvField(log.metadata),
        ].join(',');
      });

      return new NextResponse(header + rows.join('\r\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="audit-log-${today}.csv"`,
        },
      });
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)));

    const [logs, total, deleteCount, submitCount, alertCount, latestLog] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: {
          user: { select: { name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.activityLog.count({ where }),
      prisma.activityLog.count({ where: { AND: [where, { title: { startsWith: 'DELETE' } }] } }),
      prisma.activityLog.count({ where: { AND: [where, { title: { startsWith: 'SUBMIT' } }] } }),
      prisma.activityLog.count({ where: { AND: [where, { type: 'CONNECTIVITY_ALERT' }] } }),
      prisma.activityLog.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return NextResponse.json({
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary: {
        deleteCount,
        submitCount,
        alertCount,
        latestTimestamp: latestLog?.createdAt ?? null,
        retentionDays: RETENTION_DAYS,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Audit log error:', error);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await requireRole('ADMIN');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    const result = await prisma.activityLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      retentionDays: RETENTION_DAYS,
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Audit purge error:', error);
    return NextResponse.json({ error: 'Failed to purge audit logs' }, { status: 500 });
  }
}
