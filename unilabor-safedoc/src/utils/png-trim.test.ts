import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import zlib from 'zlib';
import { inkBoundingBox, trimSignaturePng } from './png-trim';

// PNG RGBA sintetico: lienzo transparente con un trazo negro en una region.
const makePng = (width: number, height: number, ink: [number, number, number, number], colorType: 6 | 2 = 6): Buffer => {
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const p = y * (stride + 1) + 1 + x * channels;
      const inside = x >= ink[0] && x <= ink[2] && y >= ink[1] && y <= ink[3];
      if (colorType === 6) {
        raw[p] = 0; raw[p + 1] = 0; raw[p + 2] = 0; raw[p + 3] = inside ? 255 : 0;
      } else {
        const v = inside ? 0 : 255;
        raw[p] = v; raw[p + 1] = v; raw[p + 2] = v;
      }
    }
  }
  const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (b: Buffer) => {
    let c = 0xffffffff;
    for (const byte of b) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

describe('trimSignaturePng', () => {
  it('encuentra la caja de tinta y recorta el lienzo transparente alrededor', async () => {
    const png = makePng(400, 200, [100, 50, 199, 89]);
    expect(inkBoundingBox(png)).toEqual([100, 50, 199, 89]);
    const trimmed = trimSignaturePng(png);
    expect(trimmed.length).toBeLessThan(png.length + 1);
    // pdf-lib lo acepta y sus dimensiones son la tinta mas el margen.
    const doc = await PDFDocument.create();
    const image = await doc.embedPng(trimmed);
    expect(image.width).toBeGreaterThanOrEqual(100);
    expect(image.width).toBeLessThan(130);
    expect(image.height).toBeGreaterThanOrEqual(40);
    expect(image.height).toBeLessThan(60);
  });

  it('recorta tambien el fondo blanco opaco (RGB sin alfa)', () => {
    const png = makePng(300, 300, [10, 10, 40, 40], 2);
    expect(inkBoundingBox(png)).toEqual([10, 10, 40, 40]);
    expect(trimSignaturePng(png).length).toBeGreaterThan(0);
    expect(trimSignaturePng(png)).not.toEqual(png);
  });

  it('devuelve el original cuando no hay tinta, ya esta ajustado o no es PNG', () => {
    const empty = makePng(50, 50, [-1, -1, -1, -1]);
    expect(trimSignaturePng(empty)).toBe(empty);
    const tight = makePng(100, 40, [2, 2, 97, 37]);
    expect(trimSignaturePng(tight)).toBe(tight);
    const garbage = Buffer.from('no soy un png');
    expect(trimSignaturePng(garbage)).toBe(garbage);
  });
});
