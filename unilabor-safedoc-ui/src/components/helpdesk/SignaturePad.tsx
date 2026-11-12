import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, ImageUp, PenLine } from 'lucide-react';
import { notifyError } from '../../utils/notify';
import { SIGNATURE_IMAGE_ACCEPT, fitInside, signatureImageIssue } from './signature-image';

interface SignaturePadProps {
  label: string;
  hint?: string;
  // Devuelve el PNG (data URL) al terminar un trazo, o null al limpiar.
  onChange: (dataUrl: string | null) => void;
  /** Permite cargar la firma desde una imagen (PNG / JPG) ademas de trazarla. */
  allowUpload?: boolean;
}

// Lienzo de firma trazada (dedo / Apple Pencil / mouse). Exporta PNG con
// canvas.toDataURL, mismo mecanismo que las etiquetas Code128. Con
// `allowUpload` la firma tambien puede venir de una imagen: se dibuja en el
// mismo lienzo y sale por el mismo camino (un PNG nuevo, sin metadatos).
export const SignaturePad = ({ label, hint, onChange, allowUpload = false }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasContent, setHasContent] = useState(false);

  // Ajusta la resolucion interna del canvas a su tamaño en pantalla (nitidez en
  // pantallas retina) y fija el estilo del trazo.
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) {
      return;
    }
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0b2235';
    }
  }, []);

  useEffect(() => {
    setupCanvas();
    window.addEventListener('resize', setupCanvas);
    return () => window.removeEventListener('resize', setupCanvas);
  }, [setupCanvas]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    drawing.current = true;
    last.current = pointFromEvent(event);
    canvasRef.current?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) {
      return;
    }
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !last.current) {
      return;
    }
    const point = pointFromEvent(event);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    last.current = point;
    dirty.current = true;
  };

  const handlePointerUp = () => {
    if (!drawing.current) {
      return;
    }
    drawing.current = false;
    last.current = null;
    if (dirty.current && canvasRef.current) {
      setHasContent(true);
      onChange(canvasRef.current.toDataURL('image/png'));
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    dirty.current = false;
    setHasContent(false);
    onChange(null);
  };

  /** Dibuja la imagen elegida centrada y ajustada al lienzo, y la entrega como la firma. */
  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!file || !canvas || !ctx) {
      return;
    }
    const issue = signatureImageIssue(file);
    if (issue) {
      notifyError(issue);
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const rect = canvas.getBoundingClientRect();
      const box = fitInside(image.naturalWidth, image.naturalHeight, rect.width, rect.height, 8);
      // clearRect usa las mismas unidades (CSS px) que el trazo: el contexto ya esta escalado.
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.drawImage(image, box.x, box.y, box.width, box.height);
      dirty.current = true;
      setHasContent(true);
      onChange(canvas.toDataURL('image/png'));
    } catch {
      notifyError('No se pudo leer la imagen. Usa un archivo PNG o JPG.');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
          <PenLine size={13} /> {label}
        </span>
        <span className="flex items-center gap-1.5">
          {allowUpload ? (
            <>
              <input ref={fileRef} type="file" accept={SIGNATURE_IMAGE_ACCEPT} onChange={(e) => void handleFile(e)} className="hidden" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Cargar tu firma desde una imagen PNG o JPG (reemplaza lo trazado)"
                className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
              >
                <ImageUp size={12} /> Imagen
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <Eraser size={12} /> Limpiar
          </button>
        </span>
      </div>
      <div
        className={`relative rounded-xl border-2 ${
          hasContent ? 'border-[var(--color-brand-500)]' : 'border-dashed border-[rgba(0,65,106,0.2)]'
        } bg-white`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="h-40 w-full touch-none rounded-xl"
          style={{ touchAction: 'none' }}
        />
        {!hasContent ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[var(--unilabor-neutral)]">
            {allowUpload ? 'Firme aquí o cargue una imagen' : 'Firme aquí'}
          </span>
        ) : null}
      </div>
      {hint ? <p className="text-[11px] text-[var(--unilabor-neutral)]">{hint}</p> : null}
    </div>
  );
};
