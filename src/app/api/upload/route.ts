import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// SVG and PDF are intentionally excluded — SVG can embed JavaScript; PDF can contain
// active content. Both would be served from a public URL with no auth check.
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Magic byte signatures for allowed image types
const MAGIC_BYTES: { ext: string; bytes: number[] }[] = [
  { ext: '.jpg',  bytes: [0xff, 0xd8, 0xff] },
  { ext: '.jpeg', bytes: [0xff, 0xd8, 0xff] },
  { ext: '.png',  bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: '.gif',  bytes: [0x47, 0x49, 0x46] },
  { ext: '.webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header
];

function validateMagicBytes(buffer: Buffer, extension: string): boolean {
  const sig = MAGIC_BYTES.find((m) => m.ext === extension);
  if (!sig) return false;
  return sig.bytes.every((byte, i) => buffer[i] === byte);
}

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

    // Validate magic bytes — reject files where content doesn't match extension
    if (!validateMagicBytes(buffer, extension)) {
      return NextResponse.json(
        { error: 'File content does not match the declared file type' },
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
