import { describe, expect, it } from 'vitest';
import { SIGNATURE_IMAGE_MAX_BYTES, fitInside, signatureImageIssue } from './signature-image';

describe('firma desde imagen', () => {
  it('solo acepta PNG o JPG, con contenido y hasta 5 MB', () => {
    expect(signatureImageIssue({ type: 'image/png', size: 1000 })).toBeNull();
    expect(signatureImageIssue({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(signatureImageIssue({ type: 'application/pdf', size: 1000 })).toContain('PNG o JPG');
    expect(signatureImageIssue({ type: 'image/svg+xml', size: 1000 })).toContain('PNG o JPG');
    expect(signatureImageIssue({ type: 'image/png', size: 0 })).toContain('vacío');
    expect(signatureImageIssue({ type: 'image/png', size: SIGNATURE_IMAGE_MAX_BYTES + 1 })).toContain('5 MB');
  });

  it('reduce una imagen grande conservando la proporción y la centra', () => {
    expect(fitInside(1000, 500, 400, 160, 10)).toEqual({ x: 60, y: 10, width: 280, height: 140 });
  });

  it('no agranda una imagen más pequeña que el lienzo', () => {
    expect(fitInside(100, 50, 400, 160)).toEqual({ x: 150, y: 55, width: 100, height: 50 });
  });
});
