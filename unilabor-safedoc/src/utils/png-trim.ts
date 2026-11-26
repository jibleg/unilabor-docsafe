import zlib from 'zlib';

// Recorte del margen vacio de un PNG de firma (sin dependencias externas).
//
// Las firmas trazadas en el SignaturePad o tomadas de un REH-REG-003 traen el
// lienzo completo: el trazo ocupa una fraccion y el resto es transparente o
// blanco. Al imprimirlas en una celda pequenia (REH-REG-027) o en una
// miniatura, el trazo queda diminuto. Aqui se decodifica el PNG, se busca la
// caja que contiene tinta y se vuelve a codificar solo esa region (RGBA 8 bits).
//
// Soporta PNG de 8 bits sin entrelazado en gris, gris+alfa, RGB y RGBA. Con
// cualquier otro formato, o si algo falla, devuelve el buffer original.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Alfa por debajo del cual el pixel cuenta como vacio. */
const INK_ALPHA = 16;
/** Luminancia (0-255) por encima de la cual el pixel cuenta como fondo blanco. */
const INK_LUMA = 240;
/** Margen alrededor de la tinta, como fraccion del lado mayor del recorte. */
const PADDING_RATIO = 0.06;

interface DecodedPng {
  width: number;
  height: number;
  /** RGBA, 4 bytes por pixel. */
  rgba: Buffer;
}

const channelsByColorType: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

const decodePng = (png: Buffer): DecodedPng | null => {
  if (png.length < 33 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat: Buffer[] = [];
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9] ?? -1;
      const interlace = data[12];
      if (bitDepth !== 8 || interlace !== 0 || !(colorType in channelsByColorType)) return null;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (!width || !height || idat.length === 0) return null;
  const channels = channelsByColorType[colorType]!;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) return null;
  const pixels = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)]!;
    const src = row * (stride + 1) + 1;
    const dst = row * stride;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[src + i]!;
      const left = i >= channels ? pixels[dst + i - channels]! : 0;
      const up = row > 0 ? pixels[dst - stride + i]! : 0;
      const upLeft = row > 0 && i >= channels ? pixels[dst - stride + i - channels]! : 0;
      let value: number;
      switch (filter) {
        case 0: value = x; break;
        case 1: value = x + left; break;
        case 2: value = x + up; break;
        case 3: value = x + Math.floor((left + up) / 2); break;
        case 4: value = x + paeth(left, up, upLeft); break;
        default: return null;
      }
      pixels[dst + i] = value & 0xff;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const s = p * channels;
    const d = p * 4;
    if (channels === 1) {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s]!;
      rgba[d + 3] = 255;
    } else if (channels === 2) {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s]!;
      rgba[d + 3] = pixels[s + 1]!;
    } else if (channels === 3) {
      rgba[d] = pixels[s]!; rgba[d + 1] = pixels[s + 1]!; rgba[d + 2] = pixels[s + 2]!;
      rgba[d + 3] = 255;
    } else {
      rgba[d] = pixels[s]!; rgba[d + 1] = pixels[s + 1]!; rgba[d + 2] = pixels[s + 2]!; rgba[d + 3] = pixels[s + 3]!;
    }
  }
  return { width, height, rgba };
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
};

const encodeRgbaPng = (width: number, height: number, rgba: Buffer): Buffer => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0; // sin filtro
    rgba.copy(raw, row * (stride + 1) + 1, row * stride, row * stride + stride);
  }
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};

const isInk = (rgba: Buffer, p: number): boolean => {
  const alpha = rgba[p + 3]!;
  if (alpha < INK_ALPHA) return false;
  const luma = 0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!;
  return luma < INK_LUMA;
};

/** Caja [x0, y0, x1, y1] inclusiva de los pixeles con tinta; null si no hay ninguno. */
export const inkBoundingBox = (png: Buffer): [number, number, number, number] | null => {
  const decoded = decodePng(png);
  if (!decoded) return null;
  const { width, height, rgba } = decoded;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isInk(rgba, (y * width + x) * 4)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
};

/**
 * Devuelve el PNG recortado a la tinta con un margen proporcional. Si el PNG
 * no se puede decodificar, no tiene tinta o ya esta ajustado, devuelve el
 * original sin tocar.
 */
export const trimSignaturePng = (png: Buffer): Buffer => {
  try {
    const decoded = decodePng(png);
    if (!decoded) return png;
    const box = inkBoundingBox(png);
    if (!box) return png;
    const [ix0, iy0, ix1, iy1] = box;
    const pad = Math.max(2, Math.round(Math.max(ix1 - ix0, iy1 - iy0) * PADDING_RATIO));
    const x0 = Math.max(0, ix0 - pad);
    const y0 = Math.max(0, iy0 - pad);
    const x1 = Math.min(decoded.width - 1, ix1 + pad);
    const y1 = Math.min(decoded.height - 1, iy1 + pad);
    const width = x1 - x0 + 1;
    const height = y1 - y0 + 1;
    // Ya ajustado (menos del 10 % de margen en ambos lados): se conserva el archivo tal cual.
    if (width >= decoded.width * 0.9 && height >= decoded.height * 0.9) return png;
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const src = ((y0 + y) * decoded.width + x0) * 4;
      decoded.rgba.copy(rgba, y * width * 4, src, src + width * 4);
    }
    return encodeRgbaPng(width, height, rgba);
  } catch {
    return png;
  }
};
