import sharp from 'sharp';
export async function photoFixture(color = '#337766') {
  const buffer = await sharp({ create: { width: 80, height: 100, channels: 3, background: color } }).png().toBuffer();
  return { name: 'synthetic-photo.png', mimeType: 'image/png', buffer };
}
