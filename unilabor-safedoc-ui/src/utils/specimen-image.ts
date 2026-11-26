// Imagen de un especimen de firma o rubrica (archivo o portapapeles) convertida
// a PNG, que es lo unico que guarda el servidor.

export const SPECIMEN_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/bmp,.png,.jpg,.jpeg,.webp,.bmp';
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/x-ms-bmp']);
const MAX_BYTES = 5 * 1024 * 1024;
/** Ancho maximo del PNG guardado: suficiente para la tabla y el PDF, sin cargar archivos enormes. */
const MAX_WIDTH = 900;

/** Por que no se acepta el archivo (null si sirve). */
export const specimenImageIssue = (file: { type: string; size: number }): string | null => {
  if (!ALLOWED_TYPES.has(file.type)) return 'La imagen debe ser PNG, JPG, WEBP o BMP.';
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_BYTES) return 'La imagen pesa más de 5 MB.';
  return null;
};

/** Convierte la imagen a un PNG (data URL) reducido a lo sumo a MAX_WIDTH, conservando la transparencia. */
export const specimenImageToPngDataUrl = async (file: File): Promise<string> => {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, MAX_WIDTH / Math.max(image.naturalWidth, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la imagen.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
};
