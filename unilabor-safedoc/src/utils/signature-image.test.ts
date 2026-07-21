import { describe, expect, it } from 'vitest';
import { decodeSignaturePng } from './signature-image';

// PNG minimo valido (1x1) para superar el umbral de bytes.
const validPngBase64 = Buffer.alloc(200, 7).toString('base64');

describe('decodeSignaturePng', () => {
  it('decodifica un data URL PNG', () => {
    const buffer = decodeSignaturePng(`data:image/png;base64,${validPngBase64}`);
    expect(buffer).not.toBeNull();
    expect(buffer?.length).toBe(200);
  });

  it('acepta base64 crudo sin prefijo data URL', () => {
    expect(decodeSignaturePng(validPngBase64)?.length).toBe(200);
  });

  it('ignora espacios al inicio y al final', () => {
    expect(decodeSignaturePng(`  data:image/png;base64,${validPngBase64}  `)).not.toBeNull();
  });

  it('devuelve null con una firma vacia', () => {
    expect(decodeSignaturePng('')).toBeNull();
  });

  it('devuelve null cuando el payload es demasiado pequenio', () => {
    expect(decodeSignaturePng(Buffer.alloc(20).toString('base64'))).toBeNull();
  });
});
