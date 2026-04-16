import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import bcrypt from 'bcryptjs';
import { readUploadedFile } from '@/lib/spreadsheet';
import { validateVoterUploadRows } from '@/lib/voter-upload';

async function readUploadRows(file: File): Promise<Record<string, unknown>[]> {
  try {
    return await readUploadedFile(file);
  } catch {
    throw new ApiError(400, 'Invalid file format. Please upload an .xlsx or .csv file.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole('ADMIN');
    const isPreview = request.nextUrl.searchParams.get('preview') === 'true';
    const isOverride = request.nextUrl.searchParams.get('override') === 'true';

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

    // Verify password when performing an override import
    if (isOverride && !isPreview) {
      const password = formData.get('password') as string | null;
      if (!password) {
        return NextResponse.json({ error: 'Password confirmation required to override existing records' }, { status: 400 });
      }

      const adminUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { password: true },
      });

      if (!adminUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const isValidPassword = await bcrypt.compare(password, adminUser.password);
      if (!isValidPassword) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 403 });
      }
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
    const validation = validateVoterUploadRows(rows, stations, existingVoters, isOverride);

    if (isPreview) {
      return NextResponse.json({
        fileName: file.name,
        totalRows: validation.totalRows,
        validRows: validation.validRowsCount,
        overrideRows: validation.overrideRowsCount,
        invalidRows: validation.invalidRowsCount,
        canImport: validation.invalidRowsCount === 0 && (validation.validRowsCount > 0 || validation.overrideRowsCount > 0),
        rows: validation.rows.slice(0, 25),
        errors: validation.errors.slice(0, 50),
      });
    }

    if (validation.invalidRowsCount > 0 || (validation.validRowsCount === 0 && validation.overrideRowsCount === 0)) {
      return NextResponse.json(
        {
          error: 'Validation failed. Please review the preview and fix the listed rows before uploading.',
          fileName: file.name,
          totalRows: validation.totalRows,
          validRows: validation.validRowsCount,
          overrideRows: validation.overrideRowsCount,
          invalidRows: validation.invalidRowsCount,
          rows: validation.rows.slice(0, 25),
          errors: validation.errors.slice(0, 50),
        },
        { status: 422 },
      );
    }

    let insertedCount = 0;
    let updatedCount = 0;

    // Insert new voters
    if (validation.validRows.length > 0) {
      const result = await prisma.voter.createMany({
        data: validation.validRows,
      });
      insertedCount = result.count;
    }

    // Upsert override rows (update existing records)
    if (validation.overrideRows.length > 0) {
      await Promise.all(
        validation.overrideRows.map((row) =>
          prisma.voter.upsert({
            where: { voterId_stationId: { voterId: row.voterId, stationId: row.stationId } },
            update: {
              firstName: row.firstName,
              lastName: row.lastName,
              age: row.age,
              gender: row.gender,
              photo: row.photo,
            },
            create: row,
          }),
        ),
      );
      updatedCount = validation.overrideRows.length;
    }

    const successCount = insertedCount + updatedCount;

    await logAudit({
      userId: user.id,
      action: 'CREATE',
      entity: 'Voter',
      entityId: `bulk_upload_${Date.now()}`,
      detail: `Bulk uploaded ${successCount} voters from file "${file.name}" (${insertedCount} new, ${updatedCount} overridden)`,
      metadata: {
        successCount,
        insertedCount,
        updatedCount,
        errorCount: 0,
        totalProcessed: validation.totalRows,
        fileName: file.name,
      },
    });

    return NextResponse.json({
      successCount,
      insertedCount,
      updatedCount,
      errorCount: 0,
      totalProcessed: validation.totalRows,
      validRows: validation.validRowsCount,
      overrideRows: validation.overrideRowsCount,
      invalidRows: 0,
      canImport: true,
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
  }
}
