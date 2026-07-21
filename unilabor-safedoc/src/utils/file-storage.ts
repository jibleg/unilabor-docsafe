import { createHash } from 'crypto';
import fs from 'fs';

/** Borra un archivo ignorando que no exista (limpieza de rollback). */
export const safeUnlink = (filePath: string | null | undefined): void => {
  if (!filePath) {
    return;
  }
  try {
    fs.unlinkSync(filePath);
  } catch {
    // archivo inexistente: nada que hacer
  }
};

/** Huella sha256 de un buffer, en hex minusculas (64 chars). */
export const sha256Buffer = (buffer: Buffer): string =>
  createHash('sha256').update(buffer).digest('hex');

/**
 * Huella sha256 del contenido de un archivo. Sella la evidencia documental:
 * permite demostrar que el PDF acusado es exactamente el que se mostro.
 */
export const sha256File = (filePath: string): string => sha256Buffer(fs.readFileSync(filePath));
