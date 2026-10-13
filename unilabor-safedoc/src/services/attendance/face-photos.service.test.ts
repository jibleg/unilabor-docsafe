import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFacePhotosDir, resolveFacePhotoPath } from './face-photo-files';
import { isJpeg } from './face-photos.service';

describe('fotografia de rostro', () => {
  it('solo acepta JPEG por firma', () => {
    expect(isJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(true);
    expect(isJpeg(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isJpeg(Buffer.from([0xff, 0xd8]))).toBe(false);
  });

  it('resuelve rutas dentro del directorio base y rechaza escapes', () => {
    expect(resolveFacePhotoPath('7/abc.jpg')).toBe(path.join(getFacePhotosDir(), '7', 'abc.jpg'));
    expect(resolveFacePhotoPath('../secreto.jpg')).toBeNull();
    expect(resolveFacePhotoPath('/etc/passwd')).toBeNull();
  });
});
