import { request } from './api';
import type { Asset } from './types';
export async function prepareImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)
    throw new Error('Choose a JPEG, PNG or WebP smaller than 8 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('This image could not be prepared.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encoded = canvas.toDataURL('image/jpeg', 0.84).split(',')[1];
  return { filename: file.name.replace(/\.[^.]+$/, '.jpg'), mimeType: 'image/jpeg', data: encoded };
}
export async function uploadImage(file: File): Promise<Asset> {
  const result = await request<{ asset: Asset }>('/assets', {
    method: 'POST',
    body: JSON.stringify(await prepareImage(file)),
  });
  return result.asset;
}
