import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    await requireRole(['ADMIN', 'OFFICER']);

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
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
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

    // Get existing voter IDs per station
    const existingVoters = await prisma.voter.findMany({
      select: { voterId: true, stationId: true },
    });
    const existingKeys = new Set(existingVoters.map((v) => `${v.voterId}|${v.stationId}`));

    const votersToCreate: {
      voterId: string;
      firstName: string;
      lastName: string;
      age: number;
      psCode: string;
      stationId: string;
    }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const voterId = String(row['voter_id'] || row['voterId'] || row['Voter ID'] || row['VOTER_ID'] || '').trim();
      const firstName = String(row['first_name'] || row['firstName'] || row['First Name'] || row['FIRST_NAME'] || '').trim();
      const lastName = String(row['last_name'] || row['lastName'] || row['Last Name'] || row['LAST_NAME'] || '').trim();
      const age = parseInt(String(row['age'] || row['Age'] || row['AGE'] || '0'));
      const psCode = String(row['ps_code'] || row['psCode'] || row['PS Code'] || row['PS_CODE'] || row['polling_station_code'] || '').trim();

      if (!voterId || !firstName || !lastName || !psCode) {
        errors.push(`Row ${rowNum}: Missing required fields`);
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

      votersToCreate.push({ voterId, firstName, lastName, age, psCode, stationId });
      existingKeys.add(key);
    }

    if (votersToCreate.length > 0) {
      const result = await prisma.voter.createMany({
        data: votersToCreate,
      });
      successCount = result.count;
    }

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
