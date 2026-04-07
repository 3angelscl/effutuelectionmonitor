import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { invalidateLiveSummary } from '@/lib/live-summary';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const { user: admin } = await requireRole('ADMIN');

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate magic bytes: XLSX = ZIP (50 4B 03 04), legacy XLS = OLE2 (D0 CF 11 E0)
    const isXlsx = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
    const isXls  = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;

    let rows: Record<string, unknown>[];

    if (isXlsx || isXls) {
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
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    } else {
      // Try CSV
      const text = buffer.toString('utf-8');
      const workbook = XLSX.read(text, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File is empty or has no data rows' }, { status: 400 });
    }

    if (rows.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 agents per import' }, { status: 400 });
    }

    // Pre-load stations indexed by psCode
    const stations = await prisma.pollingStation.findMany({
      select: { id: true, psCode: true, agentId: true },
    });
    const stationMap = new Map(stations.map((s) => [s.psCode.toLowerCase(), s]));

    // Pre-load existing emails (case-insensitive)
    const existingUsers = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { email: true },
    });
    const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const seenEmails = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed + header row

      const name  = String(row['name']  || row['Name']  || row['NAME']  || row['full_name'] || row['Full Name'] || '').trim();
      const email = String(row['email'] || row['Email'] || row['EMAIL'] || row['e-mail']    || '').trim().toLowerCase();
      const password = String(row['password'] || row['Password'] || row['PASSWORD'] || '').trim();
      const phone = String(row['phone'] || row['Phone'] || row['PHONE'] || row['phone_number'] || row['Phone Number'] || '').trim() || null;
      const psCode = String(row['ps_code'] || row['psCode'] || row['PS Code'] || row['PS_CODE'] || row['polling_station'] || row['Polling Station'] || '').trim().toLowerCase();

      // Validate required fields
      if (!name) {
        errors.push(`Row ${rowNum}: Name is required`);
        errorCount++;
        continue;
      }
      if (!email) {
        errors.push(`Row ${rowNum}: Email is required`);
        errorCount++;
        continue;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push(`Row ${rowNum}: Invalid email address "${email}"`);
        errorCount++;
        continue;
      }
      if (!password || password.length < 8) {
        errors.push(`Row ${rowNum}: Password must be at least 8 characters (agent: ${email})`);
        errorCount++;
        continue;
      }

      // Duplicate email in file
      if (seenEmails.has(email)) {
        errors.push(`Row ${rowNum}: Duplicate email "${email}" in file`);
        errorCount++;
        continue;
      }
      // Duplicate email in database
      if (existingEmails.has(email)) {
        errors.push(`Row ${rowNum}: Email "${email}" already exists`);
        errorCount++;
        continue;
      }

      // Validate polling station if provided
      let stationId: string | null = null;
      if (psCode) {
        const station = stationMap.get(psCode);
        if (!station) {
          errors.push(`Row ${rowNum}: Polling station "${psCode.toUpperCase()}" not found`);
          errorCount++;
          continue;
        }
        if (station.agentId) {
          errors.push(`Row ${rowNum}: Station "${psCode.toUpperCase()}" already has an agent assigned`);
          errorCount++;
          continue;
        }
        stationId = station.id;
      }

      seenEmails.add(email);

      try {
        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = await prisma.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            role: 'AGENT',
            phone: phone || null,
          },
          select: { id: true },
        });

        if (stationId) {
          await prisma.pollingStation.update({
            where: { id: stationId },
            data: { agentId: newUser.id },
          });
          // Mark station as taken so subsequent rows in the same file don't reuse it
          const s = stationMap.get(psCode);
          if (s) s.agentId = newUser.id;
        }

        existingEmails.add(email);
        successCount++;
      } catch {
        errors.push(`Row ${rowNum}: Failed to create agent "${email}"`);
        errorCount++;
      }
    }

    await logAudit({
      userId: admin.id,
      action: 'CREATE',
      entity: 'User',
      entityId: `bulk_import_${Date.now()}`,
      detail: `Bulk imported ${successCount} agents from "${file.name}" (${errorCount} errors)`,
      metadata: { successCount, errorCount, totalProcessed: rows.length, fileName: file.name },
    });

    if (successCount > 0) {
      await invalidateLiveSummary();
    }

    return NextResponse.json({
      successCount,
      errorCount,
      totalProcessed: rows.length,
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Agent import error:', error);
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
  }
}
