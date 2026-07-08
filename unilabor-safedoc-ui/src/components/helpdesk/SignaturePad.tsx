import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenLine } from 'lucide-react';

interface SignaturePadProps {
  label: string;
  hint?: string;
  // Devuelve el PNG (data URL) al terminar un trazo, o null al limpiar.
  onChange: (dataUrl: string | null) => void;
}

// Lienzo de firma trazada (dedo / Apple Pencil / mouse). Exporta PNG con
// canvas.toDataURL, mismo mecanismo que las etiquetas Code128.
export const SignaturePad = ({ label, hint, onChange }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
          <PenLine size={13} /> {label}
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
        >
          <Eraser size={12} /> Limpiar
        </button>
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
            Firme aquí
          </span>
        ) : null}
      </div>
      {hint ? <p className="text-[11px] text-[var(--unilabor-neutral)]">{hint}</p> : null}
    </div>
  );
};
