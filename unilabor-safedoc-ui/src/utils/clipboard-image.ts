// Imagenes pegadas desde el portapapeles (Ctrl+V / Cmd+V o boton "Pegar").

const extensionOf = (type: string): string => type.split('/')[1]?.replace('x-ms-', '').replace('jpeg', 'jpg') || 'png';

const toNamedFile = (blob: Blob): File =>
  new File([blob], `portapapeles.${extensionOf(blob.type)}`, { type: blob.type });

/** Primera imagen que trae un evento de pegado (null si no trae ninguna). */
export const imageFromPaste = (data: Pick<DataTransfer, 'items'> | null): File | null => {
  for (const item of Array.from(data?.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return toNamedFile(file);
    }
  }
  return null;
};

/**
 * Lee la imagen del portapapeles a peticion del usuario (boton). Requiere HTTPS
 * o localhost y el permiso del navegador; el mensaje del error se muestra tal cual.
 */
export const readClipboardImage = async (): Promise<File> => {
  if (!navigator.clipboard?.read) {
    throw new Error('Este navegador no permite leer el portapapeles con el botón. Coloca el cursor sobre el recuadro y usa Ctrl+V (Cmd+V en Mac).');
  }
  let items: ClipboardItem[];
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new Error('No se pudo leer el portapapeles. Permite el acceso en el navegador o usa Ctrl+V (Cmd+V en Mac) sobre el recuadro.');
  }
  for (const item of items) {
    const type = item.types.find((value) => value.startsWith('image/'));
    if (type) return toNamedFile(await item.getType(type));
  }
  throw new Error('El portapapeles no contiene una imagen. Copia la imagen de la firma y vuelve a intentarlo.');
};
