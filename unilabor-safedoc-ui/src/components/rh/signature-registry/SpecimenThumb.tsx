import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { getSpecimenImageUrl } from '../../../api/service.api-rh-signature-registry';
import type { SignatureSpecimen } from '../../../types/models';

interface SpecimenThumbProps {
  specimen: SignatureSpecimen;
  /** Alto en px; el ancho se ajusta a la imagen. */
  height?: number;
  className?: string;
}

const SOURCE_LABEL: Record<SignatureSpecimen['source'], string> = {
  UPLOAD: 'Cargada desde archivo',
  CLIPBOARD: 'Pegada del portapapeles',
  DOCUMENT_SIGNATURE: 'Tomada de su firma en SafeDoc',
};

interface LoadedImage {
  id: number;
  url: string | null;
  failed: boolean;
}

/** Miniatura del espécimen (firma o rúbrica); la imagen viaja con el token de la sesión. */
export const SpecimenThumb = ({ specimen, height = 36, className = '' }: SpecimenThumbProps) => {
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);

  useEffect(() => {
    let active = true;
    getSpecimenImageUrl(specimen.id)
      .then((url) => {
        if (active) setLoaded({ id: specimen.id, url, failed: false });
      })
      .catch(() => {
        if (active) setLoaded({ id: specimen.id, url: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, [specimen.id]);

  // Lo cargado solo vale para el especimen actual; si cambio, se vuelve a mostrar el marcador.
  const current = loaded?.id === specimen.id ? loaded : null;
  const title = `${SOURCE_LABEL[specimen.source]}${specimen.source_note ? ` · ${specimen.source_note}` : ''} · ${new Date(specimen.registered_at).toLocaleDateString('es-MX')}`;

  if (current?.failed) {
    return (
      <span title="No se pudo cargar la imagen" className={`inline-flex items-center justify-center text-slate-300 ${className}`} style={{ height }}>
        <ImageOff size={14} />
      </span>
    );
  }
  if (!current?.url) return <span className={`inline-block animate-pulse rounded bg-slate-100 ${className}`} style={{ height, width: height * 2 }} />;
  return <img src={current.url} alt={specimen.kind === 'FIRMA' ? 'Firma' : 'Rúbrica'} title={title} className={`inline-block object-contain ${className}`} style={{ height, maxWidth: height * 3.2 }} />;
};
