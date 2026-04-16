import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import { getResultsForExport } from '@/services/election-results';
import { buildCsv, buildXlsx } from '@/lib/spreadsheet';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['ADMIN', 'OFFICER']);

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';
    const candidateId = searchParams.get('candidateId');
    const electionId = searchParams.get('electionId');

    const { rows, wasTruncated, rowLimit } = await getResultsForExport({
      electionId: electionId || null,
      candidateId: candidateId || null,
    });

    const contentType = format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';
    const exportRows = rows as unknown as Record<string, unknown>[];
    const body = format === 'xlsx' ? await buildXlsx(exportRows, 'Results') : buildCsv(exportRows);

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="election-results.${format}"`,
    };

    if (wasTruncated) {
      // Inform callers that the dataset was capped — they should filter by
      // station or election to retrieve a complete export.
      headers['X-Export-Truncated'] = 'true';
      headers['X-Export-Row-Limit'] = String(rowLimit);
    }

    const responseBody = typeof body === 'string' ? body : new Uint8Array(body);
    return new NextResponse(responseBody, { headers });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Export results error:', error);
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
  }
}
