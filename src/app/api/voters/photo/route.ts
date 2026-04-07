import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    await requireRole(['ADMIN', 'OFFICER']);

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const voterId = String(formData.get('voterId') || '').trim();

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!voterId) {
      return NextResponse.json({ error: 'Voter ID is required to name the photo file.' }, { status: 400 });
    }

    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Only JPG, JPEG, and PNG are allowed.' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum 5MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate magic bytes (MIME type is client-controlled, bytes are not)
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng  = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    if (!isJpeg && !isPng) {
      return NextResponse.json({ error: 'Invalid image file. Only JPEG and PNG are allowed.' }, { status: 400 });
    }

    const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const allowedExts = ['jpg', 'jpeg', 'png'];
    const ext = allowedExts.includes(rawExt) ? rawExt : 'jpg';
    const safeVoterId = voterId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeVoterId) {
      return NextResponse.json({ error: 'Voter ID contains no valid filename characters.' }, { status: 400 });
    }

    const filename = `voter-${safeVoterId}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'voters');
    const filePath = path.join(uploadDir, filename);

    await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, buffer);

    const url = `/uploads/voters/${filename}`;
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
