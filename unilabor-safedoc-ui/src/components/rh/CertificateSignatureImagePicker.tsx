import { useRef } from 'react';
import { ClipboardPaste, Image as ImageIcon } from 'lucide-react';
import { useImagePaste } from '../../hooks/useImagePaste';
import { readClipboardImage } from '../../utils/clipboard-image';
import { notifyError } from '../../utils/notify';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

interface CertificateSignatureImagePickerProps {
  hasImage: boolean;
  onFile: (file: File) => void;
}

/** Imagen de firma de un firmante de la constancia: desde archivo o pegada del portapapeles. */
export const CertificateSignatureImagePicker = ({ hasImage, onFile }: CertificateSignatureImagePickerProps) => {
  const zoneRef = useRef<HTMLDivElement>(null);

  const acceptPasted = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      notifyError('La imagen de firma debe ser PNG, JPG o WEBP.');
      return;
    }
    onFile(file);
  };
  useImagePaste(zoneRef, true, acceptPasted);

  const handlePasteClick = async () => {
    try {
      acceptPasted(await readClipboardImage());
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'No se pudo leer el portapapeles.');
    }
  };

  const actionClass =
    'inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--color-brand-500)] transition hover:text-[var(--color-brand-700)]';

  return (
    <div ref={zoneRef} tabIndex={-1} className="flex flex-wrap items-center gap-4 outline-none">
      <label className={actionClass}>
        <ImageIcon size={13} />
        {hasImage ? 'Cambiar imagen de firma' : 'Subir imagen de firma (opcional)'}
        <input
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onFile(file);
          }}
        />
      </label>
      <button type="button" onClick={() => void handlePasteClick()} title="Pegar la imagen copiada en el portapapeles" className={actionClass}>
        <ClipboardPaste size={13} /> Pegar
      </button>
    </div>
  );
};
