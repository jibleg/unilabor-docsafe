import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, RotateCcw, Save, ZoomIn, ZoomOut } from 'lucide-react';
import { uploadFacePhoto, type AttendanceEmployee } from '../../../api/service.api-attendance-employees';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { notifyError, notifyWarning } from '../../../utils/notify';
import {
  FRAME_HEIGHT, FRAME_WIDTH, MAX_ZOOM, MIN_ZOOM, clampCrop, exportFaceJpeg, imageBox, zoomTo, type CropState,
} from './faceCrop';
import { primaryButtonClass, secondaryButtonClass } from './ui';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const ZOOM_STEP = 0.25;
const NUDGE = 10;

interface Props {
  /** Archivo inicial elegido por quien abre el panel. */
  initialFile: File | null;
  employeeId: number;
  onSaved: (employee: AttendanceEmployee, queued: boolean) => void;
  onCancel: () => void;
}

/** Recorte de rostro: arrastra para encuadrar, zoom con botones, control, rueda o teclado; exporta JPEG 3:4. */
export const FacePhotoCropper = ({ initialFile, employeeId, onSaved, onCancel }: Props) => {
  const [url, setUrl] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropState>({ zoom: 1, x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(null);

  const loadFile = useCallback((file: File | null) => {
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) return notifyWarning('Elige una imagen JPG, PNG o WebP.');
    if (file.size > MAX_SOURCE_BYTES) return notifyWarning('La imagen es demasiado grande (máximo 15 MB).');
    const objectUrl = URL.createObjectURL(file);
    const element = new Image();
    element.onload = () => {
      setUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return objectUrl;
      });
      setImage(element);
      setCrop({ zoom: 1, x: 0, y: 0 });
    };
    element.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      notifyError('No se pudo leer la imagen.');
    };
    element.src = objectUrl;
  }, []);

  useEffect(() => {
    loadFile(initialFile);
  }, [initialFile, loadFile]);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const update = useCallback(
    (change: (state: CropState, img: HTMLImageElement) => CropState) => {
      if (!image) return;
      setCrop((state) => change(state, image));
    },
    [image],
  );

  // Rueda para zoom: listener nativo no pasivo para no desplazar el panel.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !image) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      update((state, img) => zoomTo(img.naturalWidth, img.naturalHeight, state, state.zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP) / 2));
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [image, update]);

  const setZoom = (zoom: number) => update((state, img) => zoomTo(img.naturalWidth, img.naturalHeight, state, zoom));
  const nudge = (dx: number, dy: number) =>
    update((state, img) => clampCrop(img.naturalWidth, img.naturalHeight, { ...state, x: state.x + dx, y: state.y + dy }));

  const handleKey = (event: React.KeyboardEvent) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0], ArrowUp: [0, -NUDGE], ArrowDown: [0, NUDGE] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      nudge(move[0], move[1]);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setZoom(crop.zoom + ZOOM_STEP);
    } else if (event.key === '-') {
      event.preventDefault();
      setZoom(crop.zoom - ZOOM_STEP);
    }
  };

  const save = async () => {
    if (!image) return;
    setSaving(true);
    try {
      const blob = await exportFaceJpeg(image, crop);
      const { employee, queued } = await uploadFacePhoto(employeeId, blob);
      onSaved(employee, queued);
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo guardar la fotografía.'));
    } finally {
      setSaving(false);
    }
  };

  const box = image ? imageBox(image.naturalWidth, image.naturalHeight, crop) : null;

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label="Elegir archivo de fotografía"
        onChange={(event) => {
          loadFile(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />

      {!image ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[rgba(0,65,106,0.2)] bg-[rgba(248,251,253,0.9)] px-4 py-10 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.25)]"
        >
          <ImagePlus size={28} aria-hidden="true" /> Elegir archivo de imagen
          <span className="text-xs font-normal text-[var(--unilabor-neutral)]">JPG, PNG o WebP · de frente y con buena luz</span>
        </button>
      ) : (
        <>
          <div className="flex justify-center">
            <div
              ref={frameRef}
              tabIndex={0}
              role="group"
              aria-label="Encuadre del rostro. Arrastra para mover; flechas para ajustar; más y menos para el zoom"
              onKeyDown={handleKey}
              onPointerDown={(event) => {
                (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                drag.current = { pointerX: event.clientX, pointerY: event.clientY, startX: crop.x, startY: crop.y };
              }}
              onPointerMove={(event) => {
                const start = drag.current;
                if (!start) return;
                update((state, img) =>
                  clampCrop(img.naturalWidth, img.naturalHeight, {
                    ...state, x: start.startX + (event.clientX - start.pointerX), y: start.startY + (event.clientY - start.pointerY),
                  }),
                );
              }}
              onPointerUp={() => { drag.current = null; }}
              onPointerCancel={() => { drag.current = null; }}
              className="relative cursor-grab touch-none select-none overflow-hidden rounded-xl bg-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-300)] active:cursor-grabbing"
              style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT }}
            >
              {url && box ? (
                <img
                  src={url}
                  alt="Fotografía a recortar"
                  draggable={false}
                  className="pointer-events-none absolute max-w-none"
                  style={{ width: box.width, height: box.height, left: box.left, top: box.top }}
                />
              ) : null}
              {/* Guia: el rostro debe quedar dentro del ovalo. */}
              <svg className="pointer-events-none absolute inset-0" width={FRAME_WIDTH} height={FRAME_HEIGHT} aria-hidden="true">
                <defs>
                  <mask id="face-guide-mask">
                    <rect width="100%" height="100%" fill="white" />
                    <ellipse cx={FRAME_WIDTH / 2} cy={FRAME_HEIGHT * 0.45} rx={FRAME_WIDTH * 0.34} ry={FRAME_HEIGHT * 0.34} fill="black" />
                  </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,0.38)" mask="url(#face-guide-mask)" />
                <ellipse cx={FRAME_WIDTH / 2} cy={FRAME_HEIGHT * 0.45} rx={FRAME_WIDTH * 0.34} ry={FRAME_HEIGHT * 0.34} fill="none" stroke="white" strokeWidth="2" strokeDasharray="6 5" />
              </svg>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className={secondaryButtonClass} aria-label="Alejar (zoom out)" title="Alejar" onClick={() => setZoom(crop.zoom - ZOOM_STEP)} disabled={crop.zoom <= MIN_ZOOM || saving}>
              <ZoomOut size={16} />
            </button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={crop.zoom}
              aria-label="Zoom"
              onChange={(event) => setZoom(Number(event.target.value))}
              disabled={saving}
              className="h-2 flex-1 cursor-pointer accent-[var(--color-brand-700)]"
            />
            <button type="button" className={secondaryButtonClass} aria-label="Acercar (zoom in)" title="Acercar" onClick={() => setZoom(crop.zoom + ZOOM_STEP)} disabled={crop.zoom >= MAX_ZOOM || saving}>
              <ZoomIn size={16} />
            </button>
            <button type="button" className={secondaryButtonClass} aria-label="Restablecer encuadre" title="Restablecer" onClick={() => setCrop({ zoom: 1, x: 0, y: 0 })} disabled={saving}>
              <RotateCcw size={16} />
            </button>
          </div>
          <p className="text-center text-xs text-[var(--unilabor-neutral)]">
            Arrastra la imagen y ajusta el zoom hasta que el rostro llene el óvalo, de frente y sin accesorios que lo cubran. Zoom {crop.zoom.toFixed(2)}×
          </p>
        </>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {image && (
          <button type="button" className={secondaryButtonClass} onClick={() => inputRef.current?.click()} disabled={saving}>
            <ImagePlus size={15} /> Cambiar imagen
          </button>
        )}
        <button type="button" className={secondaryButtonClass} onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="button" className={primaryButtonClass} onClick={() => void save()} disabled={!image || saving}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {saving ? 'Guardando…' : 'Guardar fotografía'}
        </button>
      </div>
    </div>
  );
};
