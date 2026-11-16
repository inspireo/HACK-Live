import sharp from 'sharp';
import { maxPhotoUploadBytes, maxStoredPhotoBytes } from '../shared/profile';

// Only this trusted decoder constructs stored bytes. SVG, animation, metadata and
// original filenames never enter storage or member projections.
export async function normalizePhotoUpload(upload: unknown): Promise<Buffer | undefined> {
  if (upload === undefined || upload === null) return undefined;
  if (!upload || typeof upload !== 'object' || Array.isArray(upload) || Object.keys(upload).sort().join(',') !== 'base64,contentType') throw new Error('Choose a JPEG, PNG or WebP photo.');
  const { contentType, base64 } = upload as Record<string, unknown>;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType as string) || typeof base64 !== 'string' || !base64 || base64.length > Math.ceil(maxPhotoUploadBytes / 3) * 4 || (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64))) throw new Error('Choose a JPEG, PNG or WebP photo up to 2 MB.');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.toString('base64') !== base64) throw new Error('Photo could not be read. Choose it again.');
  if (bytes.length > maxPhotoUploadBytes) throw new Error('Photo must be 2 MB or smaller.');
  try {
    const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning', animated: true });
    const metadata = await image.metadata();
    const expected = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }[contentType as string];
    if (metadata.format !== expected || (metadata.pages || 1) !== 1) throw new Error('Unsupported photo.');
    const normalized = await image.rotate().resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    if (!normalized.length || normalized.length > maxStoredPhotoBytes) throw new Error('Photo is too detailed.');
    return normalized;
  } catch { throw new Error('Photo could not be read. Choose a still JPEG, PNG or WebP photo up to 2 MB and 16 megapixels.'); }
}
