import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import * as XLSX from 'xlsx';

function readOptionalPhotoUrl(row: Record<string, unknown>): { photo: string | null; error?: string } {
  const raw = String(
    row['photo_url'] ??
    row['photoUrl'] ??
    row['photo'] ??
    row['Photo'] ??
    row['PHOTO_URL'] ??
    row['cloudinary_url'] ??
    row['cloudinaryUrl'] ??
    row['Cloudinary URL'] ??
    '',
  ).trim();

  if (!raw) return { photo: null };
  if (raw.startsWith('/') || URL.canParse(raw)) return { photo: raw };
  return { photo: null, error: 'Invalid photo URL' };
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole('ADMIN');

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

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate magic bytes before handing to XLSX parser.
    // XLSX is a ZIP (50 4B 03 04); legacy XLS is OLE2 (D0 CF 11 E0).
    // Reject anything that doesn't match to prevent parser exploits.
    const isXlsx = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
    const isXls  = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
    if (!isXlsx && !isXls) {
      return NextResponse.json(
        { error: 'Invalid file format. Please upload an .xlsx or .xls spreadsheet.' },
        { status: 400 },
      );
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      return NextResponse.json(
        { error: 'Could not parse spreadsheet. The file may be corrupted.' },
        { status: 400 },
      );
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Get all stations indexed by psCode (global)
    const stations = await prisma.pollingStation.findMany({
      select: { id: true, psCode: true },
    });
    const stationMap = new Map(stations.map((s) => [s.psCode, s.id]));

    // Get existing voter IDs per station (exclude soft-deleted)
    const existingVoters = await prisma.voter.findMany({
      where: { deletedAt: null },
      select: { voterId: true, stationId: true },
    });
    const existingKeys = new Set(existingVoters.map((v) => `${v.voterId}|${v.stationId}`));

    const votersToCreate: {
      voterId: string;
      firstName: string;
      lastName: string;
      age: number;
      stationId: string;
      photo: string | null;
    }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const voterId = String(row['voter_id'] || row['voterId'] || row['Voter ID'] || row['VOTER_ID'] || '').trim();
      const firstName = String(row['first_name'] || row['firstName'] || row['First Name'] || row['FIRST_NAME'] || '').trim();
      const lastName = String(row['last_name'] || row['lastName'] || row['Last Name'] || row['LAST_NAME'] || '').trim();
      const age = parseInt(String(row['age'] || row['Age'] || row['AGE'] || '0'));
      const psCode = String(row['ps_code'] || row['psCode'] || row['PS Code'] || row['PS_CODE'] || row['polling_station_code'] || '').trim();
      const { photo, error: photoError } = readOptionalPhotoUrl(row);

      if (!voterId || !firstName || !lastName || !psCode) {
        errors.push(`Row ${rowNum}: Missing required fields`);
        errorCount++;
        continue;
      }

      if (photoError) {
        errors.push(`Row ${rowNum}: ${photoError} for voter ${voterId}`);
        errorCount++;
        continue;
      }

      if (isNaN(age) || age < 18) {
        errors.push(`Row ${rowNum}: Invalid age for voter ${voterId}`);
        errorCount++;
        continue;
      }

      const stationId = stationMap.get(psCode);
      if (!stationId) {
        errors.push(`Row ${rowNum}: Polling station ${psCode} not found`);
        errorCount++;
        continue;
      }

      const key = `${voterId}|${stationId}`;
      if (existingKeys.has(key)) {
        errors.push(`Row ${rowNum}: Voter ID ${voterId} already exists at station ${psCode}`);
        errorCount++;
        continue;
      }

      if (votersToCreate.some((v) => v.voterId === voterId && v.stationId === stationId)) {
        errors.push(`Row ${rowNum}: Duplicate voter ID ${voterId} in file`);
        errorCount++;
        continue;
      }

      votersToCreate.push({ voterId, firstName, lastName, age, stationId, photo });
      existingKeys.add(key);
    }

    if (votersToCreate.length > 0) {
      const result = await prisma.voter.createMany({
        data: votersToCreate,
      });
      successCount = result.count;
    }

    await logAudit({
      userId: user.id,
      action: 'CREATE',
      entity: 'Voter',
      entityId: `bulk_upload_${Date.now()}`,
      detail: `Bulk uploaded ${successCount} voters from file "${file.name}" (${errorCount} errors)`,
      metadata: { 
        successCount, 
        errorCount, 
        totalProcessed: rows.length,
        fileName: file.name
      },
    });

    return NextResponse.json({
      successCount,
      errorCount,
      totalProcessed: rows.length,
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
  }
}
