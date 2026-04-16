import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ShieldAlert, ZoomIn, ZoomOut } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useAuthStore } from '../store/useAuthStore';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const createWatermarkDataUrl = (text: string): string => {
  const safeText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="420" height="320" viewBox="0 0 420 320">
      <g transform="translate(210 160) rotate(-28)">
        <text
          x="0"
          y="0"
          text-anchor="middle"
          fill="rgba(148, 163, 184, 0.16)"
          font-family="Segoe UI, Arial, sans-serif"
          font-size="24"
          font-weight="700"
          letter-spacing="1.5"
        >${safeText}</text>
      </g>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const PdfSafeViewer = ({ fileUrl }: { fileUrl: string }) => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [loadError, setLoadError] = useState<string | null>(null);

  const watermarkText = useMemo(() => {
    const identity = user?.full_name?.trim() || user?.email?.trim() || 'Usuario autenticado';
    return `UNILABOR | ${identity} | SGC ISO 15189 | PROTEGIDO`;
  }, [user?.email, user?.full_name]);

  const watermarkDataUrl = useMemo(() => createWatermarkDataUrl(watermarkText), [watermarkText]);
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
    setNumPages(0);
    setPageNumber(1);
    setLoadError(null);
  }, [fileUrl]);

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

  const canGoBack = pageNumber > 1;
  const canGoForward = numPages > 0 && pageNumber < numPages;

  return (
    <div
      className="relative h-[80vh] overflow-hidden rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] shadow-inner shadow-[rgba(0,65,106,0.08)]"
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] bg-white/92 px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-brand-700)]">
            Visualizacion protegida
          </p>
          <p className="mt-1 inline-flex items-center gap-2 text-xs text-[var(--unilabor-neutral)]">
            <ShieldAlert size={14} className="text-[var(--color-brand-500)]" />
            Marca de agua por usuario, sin impresion ni descarga desde la interfaz
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
            title="Pagina anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-24 text-center text-xs font-semibold text-[var(--color-brand-700)]">
            {numPages > 0 ? `Pagina ${pageNumber} de ${numPages}` : 'Cargando...'}
          </span>
          <button
            type="button"
            onClick={() => setPageNumber((current) => Math.min(numPages, current + 1))}
            disabled={!canGoForward}
            className="rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/92 px-3 py-2 text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
            title="Pagina siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="relative h-[calc(80vh-73px)] overflow-auto bg-[linear-gradient(180deg,#f8fbfd_0%,#eef5fa_50%,#dbe8f2_100%)] p-6">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url("${watermarkDataUrl}")`,
            backgroundRepeat: 'repeat',
            backgroundPosition: 'center',
            opacity: 1,
          }}
        />

        <div className="relative z-10 mx-auto flex w-fit justify-center no-select">
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
              />
            </div>
          </Document>
        </div>
      </div>
    </div>
  );
};
