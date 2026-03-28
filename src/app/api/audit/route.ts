import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

const RETENTION_DAYS = 14;

// Log purging is intentionally NOT triggered from GET requests.
// Use DELETE /api/audit to purge old logs explicitly (or via a cron job).

function escapeCsvField(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function GET(request: NextRequest) {
  try {
    await requireRole('ADMIN');

    const { searchParams } = new URL(request.url);
    const exportMode = searchParams.get('export');
    const type = searchParams.get('type') || '';
    const userId = searchParams.get('userId') || '';

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (userId) where.userId = userId;

    // CSV export mode — capped at 100,000 rows to prevent memory exhaustion
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
      const header = 'Date,Time,User,Role,Action,Title,Detail\r\n';
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
          escapeCsvField(log.user.name),
          escapeCsvField(log.user.role),
          escapeCsvField(action),
          escapeCsvField(log.title),
          escapeCsvField(log.detail),
        ].join(',');
      });

      const csv = header + rows.join('\r\n');

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="audit-log-${today}.csv"`,
        },
      });
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));

    const [logs, total] = await Promise.all([
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
    ]);

    return NextResponse.json({
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Audit log error:', error);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}

/**
 * DELETE /api/audit — manually purge logs older than 14 days.
 * Can also be called by a cron job.
 */
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
