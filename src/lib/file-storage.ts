import { del, put } from '@vercel/blob';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';

type StoreFileInput = {
  subfolder?: string;
  filename: string;
  buffer: Buffer;
  contentType?: string;
  cacheControlMaxAge?: number;
};

function normalizeSubfolder(subfolder?: string): string {
  if (!subfolder) return '';
  return subfolder.replace(/^\/+|\/+$/g, '');
}

function buildLocalUrl(pathname: string): string {
  return `/${pathname.replace(/\\/g, '/')}`;
}

export async function storeFile({
  subfolder,
  filename,
  buffer,
  contentType,
  cacheControlMaxAge = 60 * 60 * 24 * 30,
}: StoreFileInput): Promise<string> {
  const normalizedSubfolder = normalizeSubfolder(subfolder);
  const pathname = normalizedSubfolder
    ? `uploads/${normalizedSubfolder}/${filename}`
    : `uploads/${filename}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(pathname, buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType,
      cacheControlMaxAge,
    });
    return blob.url;
  }

  const localDir = normalizedSubfolder
    ? join(process.cwd(), 'public', 'uploads', ...normalizedSubfolder.split('/'))
    : join(process.cwd(), 'public', 'uploads');

  await mkdir(localDir, { recursive: true });
  await writeFile(join(localDir, filename), buffer);

  return buildLocalUrl(pathname);
}

export async function deleteStoredFile(url: string | null | undefined) {
  if (!url) return;

  if (/^https?:\/\//i.test(url) && process.env.BLOB_READ_WRITE_TOKEN) {
    await del(url);
    return;
  }

  if (!url.startsWith('/uploads/')) return;

  const relativeParts = url.replace(/^\/uploads\/?/, '').split('/').filter(Boolean);
  try {
    await unlink(join(process.cwd(), 'public', 'uploads', ...relativeParts));
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') throw error;
  }
}
