import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    await requireRole('ADMIN');

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Limit file size to 5MB
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Only JPG, JPEG, and PNG are allowed.' }, { status: 400 });
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
    const filename = `candidate-${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'candidates');
    const filePath = path.join(uploadDir, filename);

    await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, buffer);

    const url = `/uploads/candidates/${filename}`;
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
