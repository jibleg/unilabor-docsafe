// Reglas puras para cargar la firma desde una imagen (sin DOM, testeables).

export const SIGNATURE_IMAGE_ACCEPT = 'image/png,image/jpeg';
export const SIGNATURE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg']);

/** Por que no se acepta el archivo como firma (null si sirve). */
export const signatureImageIssue = (file: { type: string; size: number }): string | null => {
  if (!ALLOWED_TYPES.has(file.type)) return 'La firma debe ser una imagen PNG o JPG.';
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > SIGNATURE_IMAGE_MAX_BYTES) return 'La imagen pesa más de 5 MB.';
  return null;
};

export interface FitBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Coloca una imagen dentro de una caja conservando su proporcion, centrada y
 * con margen. Nunca la agranda mas alla de su tamaño real.
 */
export const fitInside = (imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number, margin = 0): FitBox => {
  const availableWidth = Math.max(boxWidth - margin * 2, 1);
  const availableHeight = Math.max(boxHeight - margin * 2, 1);
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { x: margin, y: margin, width: availableWidth, height: availableHeight };
  }
  const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight, 1);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
};
