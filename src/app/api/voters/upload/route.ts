import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import * as XLSX from 'xlsx';
import { validateVoterUploadRows } from '@/lib/voter-upload';

async function readUploadRows(file: File): Promise<Record<string, unknown>[]> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.csv')) {
    const text = await file.text();
    if (!text.trim()) return [];
    const workbook = XLSX.read(text, { type: 'string' });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate magic bytes before handing to XLSX parser.
  // XLSX is a ZIP (50 4B 03 04); legacy XLS is OLE2 (D0 CF 11 E0).
  // Reject anything that doesn't match to prevent parser exploits.
  const isXlsx = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  const isXls  = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
  if (!isXlsx && !isXls) {
    throw new ApiError(400, 'Invalid file format. Please upload an .xlsx, .xls, or .csv file.');
  }

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole('ADMIN');
    const isPreview = request.nextUrl.searchParams.get('preview') === 'true';

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Limit file size to 10MB
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    let rows: Record<string, unknown>[];
    try {
      rows = await readUploadRows(file);
    } catch (error) {
      if (error instanceof ApiError) return error.toResponse();
      return NextResponse.json(
        { error: 'Could not parse spreadsheet. The file may be corrupted.' },
        { status: 400 },
      );
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    // Get all stations indexed by psCode (global)
    const stations = await prisma.pollingStation.findMany({
      select: { id: true, psCode: true, name: true },
    });

    // Get existing voter IDs per station (exclude soft-deleted)
    const existingVoters = await prisma.voter.findMany({
      where: { deletedAt: null },
      select: { voterId: true, stationId: true },
    });
    const validation = validateVoterUploadRows(rows, stations, existingVoters);

    if (isPreview) {
      return NextResponse.json({
        fileName: file.name,
        totalRows: validation.totalRows,
        validRows: validation.validRowsCount,
        invalidRows: validation.invalidRowsCount,
        canImport: validation.invalidRowsCount === 0 && validation.validRowsCount > 0,
        rows: validation.rows.slice(0, 25),
        errors: validation.errors.slice(0, 50),
      });
    }

    if (validation.invalidRowsCount > 0 || validation.validRowsCount === 0) {
      return NextResponse.json(
        {
          error: 'Validation failed. Please review the preview and fix the listed rows before uploading.',
          fileName: file.name,
          totalRows: validation.totalRows,
          validRows: validation.validRowsCount,
          invalidRows: validation.invalidRowsCount,
          rows: validation.rows.slice(0, 25),
          errors: validation.errors.slice(0, 50),
        },
        { status: 422 },
      );
    }

    const result = await prisma.voter.createMany({
      data: validation.validRows,
    });

    await logAudit({
      userId: user.id,
      action: 'CREATE',
      entity: 'Voter',
      entityId: `bulk_upload_${Date.now()}`,
      detail: `Bulk uploaded ${result.count} voters from file "${file.name}"`,
      metadata: { 
        successCount: result.count,
        errorCount: 0,
        totalProcessed: validation.totalRows,
        fileName: file.name,
      },
    });

    return NextResponse.json({
      successCount: result.count,
      errorCount: 0,
      totalProcessed: validation.totalRows,
      validRows: validation.validRowsCount,
      invalidRows: 0,
      canImport: true,
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
  }
}
