import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.pdf']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    await requireRole(['ADMIN', 'OFFICER', 'AGENT']);
    
    // Check content type to make sure it's multipart
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
    }

    const data = await request.formData();
    const file = data.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No valid file uploaded' }, { status: 400 });
    }

    // Cast to standard File
    const actualFile = file as any;
    
    // Validate file size
    if (actualFile.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
    }

    const bytes = await actualFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const extMatch = actualFile.name.match(/\.[0-9a-z]+$/i);
    const extension = extMatch ? extMatch[0].toLowerCase() : '';

    // Validate file extension
    if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: `File type not allowed. Accepted: ${[...ALLOWED_EXTENSIONS].join(', ')}` },
        { status: 400 },
      );
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = `${uniqueSuffix}${extension}`;
    
    const uploadDir = join(process.cwd(), 'public', 'uploads');
    
    try {
      await mkdir(uploadDir, { recursive: true });
    } catch (err) {
      // ignore
    }

    const filepath = join(uploadDir, filename);
    await writeFile(filepath, buffer);

    return NextResponse.json({ url: `/uploads/${filename}` });
  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
