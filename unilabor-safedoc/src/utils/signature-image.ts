import fs from 'fs';
import path from 'path';

// Un PNG valido de firma nunca es tan pequenio; por debajo de este umbral se
// asume canvas vacio o payload corrupto.
const MIN_SIGNATURE_BYTES = 100;

/**
 * Decodifica un data URL PNG (o base64 crudo) proveniente del SignaturePad.
 * Devuelve null cuando la firma esta vacia o es invalida, para que cada modulo
 * falle con su propio codigo de error.
 */
export const decodeSignaturePng = (dataUrl: string): Buffer | null => {
  const raw = dataUrl.trim();
  const match = /^data:image\/png;base64,(.+)$/i.exec(raw);
  const base64 = (match && match[1]) || raw;
  const buffer = Buffer.from(base64, 'base64');
  return buffer.length >= MIN_SIGNATURE_BYTES ? buffer : null;
};

/** Escribe la firma en el directorio de firmas y devuelve la ruta relativa. */
export const writeSignaturePng = (buffer: Buffer, prefix = 'SIGN'): string => {
  const dir = process.env.DIRECTORY_UPLOAD_SIGNATURE || 'uploads/signatures';
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
};
