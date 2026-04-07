import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { invalidateLiveSummary } from '@/lib/live-summary';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole('ADMIN');

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const isCSV = fileName.endsWith('.csv');
    const isXLSX = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (!isCSV && !isXLSX) {
      return NextResponse.json({ error: 'Only CSV or XLSX files are supported' }, { status: 400 });
    }

    type RowRecord = Record<string, unknown>;
    let rows: RowRecord[] = [];

    if (isXLSX) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<RowRecord>(sheet);
    } else {
      // CSV parsing
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        return NextResponse.json({ error: 'File is empty or has no data rows' }, { status: 400 });
      }

      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
        const row: RowRecord = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx] ?? '';
        });
        rows.push(row);
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    // Get all existing stations by psCode
    const existingStations = await prisma.pollingStation.findMany({
      select: { psCode: true },
    });
    const existingPsCodes = new Set(existingStations.map((s) => s.psCode));

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      // Normalize field names (support various column name styles)
      const psCode = String(
        row['psCode'] || row['ps_code'] || row['PS Code'] || row['PS_CODE'] || row['pscode'] || ''
      ).trim();
      const name = String(
        row['name'] || row['Name'] || row['NAME'] || row['station_name'] || row['Station Name'] || ''
      ).trim();

      // Skip blank rows
      if (!psCode && !name) continue;

      if (!psCode) {
        errors.push(`Row ${rowNum}: Missing psCode`);
        continue;
      }
      if (!name) {
        errors.push(`Row ${rowNum}: Missing name for psCode "${psCode}"`);
        continue;
      }

      if (existingPsCodes.has(psCode)) {
        skipped++;
        continue;
      }

      const location = String(
        row['location'] || row['Location'] || row['LOCATION'] || ''
      ).trim() || null;

      const electoralArea = String(
        row['electoralArea'] || row['electoral_area'] || row['Electoral Area'] || row['ELECTORAL_AREA'] ||
        row['ward'] || row['Ward'] || row['WARD'] || ''
      ).trim() || null;

      const latRaw = String(row['latitude'] || row['Latitude'] || row['lat'] || '').trim();
      const lngRaw = String(row['longitude'] || row['Longitude'] || row['lng'] || row['lon'] || '').trim();

      const latitude = latRaw ? parseFloat(latRaw) : null;
      const longitude = lngRaw ? parseFloat(lngRaw) : null;

      const latitudeVal = latitude !== null && !isNaN(latitude) ? latitude : null;
      const longitudeVal = longitude !== null && !isNaN(longitude) ? longitude : null;

      try {
        if (electoralArea) {
          await prisma.electoralArea.upsert({
            where: { name: electoralArea },
            create: { name: electoralArea },
            update: {},
          });
        }

        await prisma.pollingStation.create({
          data: {
            psCode,
            name,
            location,
            electoralArea,
            latitude: latitudeVal,
            longitude: longitudeVal,
          },
        });
        existingPsCodes.add(psCode);
        created++;
      } catch (err) {
        errors.push(`Row ${rowNum}: Failed to create station "${psCode}" — ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    await logAudit({
      userId: user.id,
      action: 'BULK_IMPORT',
      entity: 'PollingStation',
      entityId: 'bulk',
      detail: `BULK_IMPORT PollingStation - ${created} created, ${skipped} skipped`,
      metadata: { created, skipped, errors: errors.slice(0, 10) },
    });

    if (created > 0) {
      await invalidateLiveSummary();
    }

    return NextResponse.json({
      created,
      skipped,
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Station upload error:', error);
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
  }
}
