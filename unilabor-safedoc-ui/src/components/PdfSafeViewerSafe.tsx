import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  MoveHorizontal,
  ShieldAlert,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useAuthStore } from '../store/useAuthStore';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

// Opacidad de la marca de agua sobre el documento. Ajustable para encontrar el
// mejor balance entre visibilidad (trazabilidad) y legibilidad del PDF.
const WATERMARK_OPACITY = 0.2;

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Marca de agua diagonal: leyenda PROTEGIDO + nombre del usuario y fecha. */
const createWatermarkDataUrl = (name: string, date: string): string => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="520" height="360" viewBox="0 0 520 360">
      <g transform="translate(260 180) rotate(-30)">
        <text
          x="0"
          y="-28"
          text-anchor="middle"
          fill="#64748b"
          font-family="Segoe UI, Arial, sans-serif"
          font-size="34"
          font-weight="800"
          letter-spacing="6"
        >PROTEGIDO</text>
        <text
          x="0"
          y="8"
          text-anchor="middle"
          fill="#64748b"
          font-family="Segoe UI, Arial, sans-serif"
          font-size="26"
          font-weight="700"
          letter-spacing="1.5"
        >${escapeXml(name)}</text>
        <text
          x="0"
          y="38"
          text-anchor="middle"
          fill="#64748b"
          font-family="Segoe UI, Arial, sans-serif"
          font-size="20"
          font-weight="600"
          letter-spacing="1.5"
        >${escapeXml(date)}</text>
      </g>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

/**
 * Instrumentacion opcional de lectura (RH-ACK-02). Cuando se pasa `tracking`, el
 * visor late cada `intervalSeconds` mientras la pestania esta visible y con foco,
 * reportando UNICAMENTE la pagina actual: el tiempo lo mide el servidor.
 *
 * Es opcional a proposito — este visor lo comparten Calidad, Gestion de Activos
 * y RH, y sin la prop el comportamiento es exactamente el de antes.
 */
export interface PdfReadingTracking {
  onHeartbeat: (page: number) => void | Promise<void>;
  intervalSeconds?: number;
}

export const PdfSafeViewer = ({
  fileUrl,
  tracking,
}: {
  fileUrl: string;
  tracking?: PdfReadingTracking;
}) => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedFileUrl, setLoadedFileUrl] = useState(fileUrl);
  // Modo pantalla completa (overlay CSS, compatible con iOS/Android donde la
  // Fullscreen API nativa no funciona sobre divs).
  const [expanded, setExpanded] = useState(false);

  // Ajuste al ancho (fit-to-width): escala para que la pagina llene el area visible.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageWidthRef = useRef<number>(0);
  // Documento ya auto-ajustado (para NO re-ajustar en cada render y no pelear con
  // el zoom manual; sin esto el zoom y el scroll horizontal quedaban inutilizables).
  const fittedUrlRef = useRef<string | null>(null);

  const fitToWidth = useCallback(() => {
    const container = scrollRef.current;
    const pageWidth = pageWidthRef.current;
    if (!container || pageWidth <= 0) {
      return;
    }
    // Descuenta el padding del area (p-6 = 48) y el marco de la pagina (p-2 + borde).
    const available = container.clientWidth - 68;
    if (available <= 0) {
      return;
    }
    const nextScale = clamp(Number((available / pageWidth).toFixed(2)), 0.3, 3);
    setScale(nextScale);
  }, []);

  // Reinicia el estado del visor cuando cambia el documento, durante el render
  // (patron recomendado por React en lugar de un efecto que llama setState).
  if (fileUrl !== loadedFileUrl) {
    setLoadedFileUrl(fileUrl);
    setNumPages(0);
    setPageNumber(1);
    setLoadError(null);
  }

  const watermarkName = useMemo(
    () => (user?.full_name?.trim() || user?.email?.trim() || 'Usuario autenticado').toUpperCase(),
    [user?.email, user?.full_name],
  );
  const watermarkDate = useMemo(() => {
    const now = new Date();
    const date = now.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = now.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return `${date} ${time}`;
  }, []);

  const watermarkDataUrl = useMemo(
    () => createWatermarkDataUrl(watermarkName, watermarkDate),
    [watermarkName, watermarkDate],
  );
  const documentFile = useMemo(
    () => ({
      url: fileUrl,
    }),
    [fileUrl],
  );
  const documentOptions = useMemo(
    () => ({
      httpHeaders: {
        Authorization: `Bearer ${token ?? ''}`,
      },
      withCredentials: false,
    }),
    [token],
  );

  useEffect(() => {
    const handleBlockedShortcuts = (event: KeyboardEvent) => {
      const normalizedKey = event.key.toLowerCase();
      const isModifierPressed = event.ctrlKey || event.metaKey;
      const isBlockedShortcut =
        (isModifierPressed && ['p', 's', 'u', 'c'].includes(normalizedKey)) ||
        normalizedKey === 'printscreen';

      if (!isBlockedShortcut) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', handleBlockedShortcuts, true);
    return () => window.removeEventListener('keydown', handleBlockedShortcuts, true);
  }, []);

  // En modo expandido: cerrar con Escape y evitar el scroll del fondo.
  useEffect(() => {
    if (!expanded) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  // Reajusta el ancho al entrar/salir de pantalla completa y al redimensionar.
  useEffect(() => {
    const id = requestAnimationFrame(fitToWidth);
    window.addEventListener('resize', fitToWidth);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', fitToWidth);
    };
  }, [expanded, fitToWidth]);

  // Latido de lectura. Solo corre con la pestania visible Y la ventana enfocada:
  // dejar el documento abierto en segundo plano no debe contar como lectura.
  // La pagina viva va por ref para no reiniciar el intervalo en cada cambio.
  const heartbeatRef = useRef(tracking?.onHeartbeat);
  heartbeatRef.current = tracking?.onHeartbeat;
  const pageNumberRef = useRef(pageNumber);
  pageNumberRef.current = pageNumber;

  const trackingEnabled = Boolean(tracking);
  const heartbeatMs = (tracking?.intervalSeconds ?? 4) * 1000;

  useEffect(() => {
    if (!trackingEnabled || numPages === 0) {
      return;
    }

    let inFlight = false;
    const beat = async () => {
      if (inFlight || document.hidden || !document.hasFocus()) {
        return;
      }
      inFlight = true;
      try {
        await heartbeatRef.current?.(pageNumberRef.current);
      } finally {
        inFlight = false;
      }
    };

    const id = window.setInterval(beat, heartbeatMs);
    return () => window.clearInterval(id);
  }, [trackingEnabled, heartbeatMs, numPages]);

  const canGoBack = pageNumber > 1;
  const canGoForward = numPages > 0 && pageNumber < numPages;

  return (
    <div
      className={`relative overflow-hidden border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] shadow-inner shadow-[rgba(0,65,106,0.08)] ${
        expanded ? 'fixed inset-0 z-[60] h-screen w-screen rounded-none' : 'h-[80vh] rounded-xl'
      }`}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] bg-white/92 px-4 py-3">
        {!expanded && (
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-brand-700)]">
              Visualización protegida
            </p>
            <p className="mt-1 inline-flex items-center gap-2 text-xs text-[var(--unilabor-neutral)]">
              <ShieldAlert size={14} className="text-[var(--color-brand-500)]" />
              Marca de agua por usuario, sin impresión ni descarga desde la interfaz
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500 bg-amber-400 px-3 py-2 text-xs font-bold text-amber-950 shadow-sm transition hover:bg-amber-300"
            title={expanded ? 'Salir de pantalla completa' : 'Ver en pantalla completa'}
            aria-label={expanded ? 'Salir de pantalla completa' : 'Ver en pantalla completa'}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            type="button"
            onClick={fitToWidth}
            className="rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/92 px-3 py-2 text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            title="Ajustar al ancho"
            aria-label="Ajustar al ancho"
          >
            <MoveHorizontal size={16} />
          </button>
          <button
            type="button"
            onClick={() => setScale((current) => clamp(Number((current - 0.1).toFixed(2)), 0.8, 2))}
            className="rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/92 px-3 py-2 text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            title="Reducir zoom"
          >
            <ZoomOut size={16} />
          </button>
          <span className="min-w-16 text-center text-xs font-semibold text-[var(--color-brand-700)]">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((current) => clamp(Number((current + 0.1).toFixed(2)), 0.8, 2))}
            className="rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/92 px-3 py-2 text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            title="Aumentar zoom"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
            disabled={!canGoBack}
            className="rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/92 px-3 py-2 text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
            title="Página anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-24 text-center text-xs font-semibold text-[var(--color-brand-700)]">
            {numPages > 0 ? `Página ${pageNumber} de ${numPages}` : 'Cargando...'}
          </span>
          <button
            type="button"
            onClick={() => setPageNumber((current) => Math.min(numPages, current + 1))}
            disabled={!canGoForward}
            className="rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/92 px-3 py-2 text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
            title="Página siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`relative overflow-auto bg-[linear-gradient(180deg,#f8fbfd_0%,#eef5fa_50%,#dbe8f2_100%)] p-6 ${expanded ? 'h-[calc(100vh-73px)]' : 'h-[calc(80vh-73px)]'}`}
        style={{ touchAction: 'pan-x pan-y', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
      >
        <div className="relative z-10 flex w-fit min-w-full justify-center no-select">
          <Document
            file={documentFile}
            options={documentOptions}
            loading={
              <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 px-5 py-4 text-sm text-[var(--color-brand-700)]">
                Cargando documento protegido...
              </div>
            }
            onLoadSuccess={({ numPages: totalPages }) => {
              setNumPages(totalPages);
              setPageNumber((current) => clamp(current, 1, totalPages));
              setLoadError(null);
            }}
            onLoadError={(error) => {
              console.error(error);
              setLoadError('No se pudo abrir el documento protegido.');
            }}
            error={
              <div className="rounded-2xl border border-rose-500/20 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                {loadError || 'No se pudo abrir el documento protegido.'}
              </div>
            }
            className="select-none"
          >
            <div className="relative rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/97 p-2 shadow-2xl shadow-[rgba(0,65,106,0.12)]">
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                loading=""
                onLoadSuccess={(page) => {
                  pageWidthRef.current = page.originalWidth;
                  // Auto-ajuste al ancho solo la primera vez por documento; despues
                  // respeta el zoom manual del usuario.
                  if (fittedUrlRef.current !== fileUrl) {
                    fittedUrlRef.current = fileUrl;
                    requestAnimationFrame(fitToWidth);
                  }
                }}
              />
              {/* Marca de agua (nombre + fecha) SOBRE el documento, no imprimible. */}
              <div
                className="pointer-events-none absolute inset-0 z-20"
                style={{
                  backgroundImage: `url("${watermarkDataUrl}")`,
                  backgroundRepeat: 'repeat',
                  backgroundPosition: 'center',
                  opacity: WATERMARK_OPACITY,
                }}
              />
            </div>
          </Document>
        </div>
      </div>
    </div>
  );
};
