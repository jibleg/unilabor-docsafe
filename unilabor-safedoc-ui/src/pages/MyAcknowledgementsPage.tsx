import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, FileText } from 'lucide-react';
import { toast } from 'react-toastify';
import { PdfSafeViewer } from '../components/PdfSafeViewerSafe';
import { SignaturePad } from '../components/helpdesk/SignaturePad';
import { API_BASE_URL } from '../api/axios';
import { getApiErrorMessage } from '../api/service.parsers';
import {
  listMyAcknowledgements,
  reportReadingProgress,
  signAcknowledgement,
} from '../api/service.api-rh-acknowledgement';
import type { DocumentAcknowledgement } from '../types/models';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En lectura',
  read: 'Leído · falta firmar',
  signed: 'Firmado',
  expired: 'Vencido',
  cancelled: 'Cancelado',
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-amber-100 text-amber-800',
  read: 'bg-sky-100 text-sky-800',
  signed: 'bg-emerald-100 text-emerald-800',
  expired: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-100 text-slate-500',
};

const formatDeadline = (value: string | null): string => {
  if (!value) {
    return 'Sin plazo';
  }
  const deadline = new Date(value);
  const hours = (deadline.getTime() - Date.now()) / 3_600_000;
  const stamp = deadline.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (hours < 0) {
    return `Vencido el ${stamp}`;
  }
  if (hours < 24) {
    return `Vence en ${Math.max(1, Math.round(hours))} h · ${stamp}`;
  }
  return `Vence en ${Math.round(hours / 24)} d · ${stamp}`;
};

export const MyAcknowledgementsPage = () => {
  const [items, setItems] = useState<DocumentAcknowledgement[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<DocumentAcknowledgement | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Evita spamear el toast de "ya puedes firmar" en cada latido.
  const announcedReadRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listMyAcknowledgements());
      setLoadError(null);
    } catch (error) {
      // El servidor distingue "no tienes expediente" de "sin permiso"; tragarse
      // su mensaje dejaba al lector sin saber a quien pedirle ayuda. Ademas se
      // limpia la lista: si no, el estado vacio miente con "no tienes pendientes".
      const message = getApiErrorMessage(
        error,
        'No se pudieron cargar tus documentos por acusar.',
      );
      setItems([]);
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openReader = (acknowledgement: DocumentAcknowledgement) => {
    announcedReadRef.current = acknowledgement.status === 'read';
    setSignature(null);
    setActive(acknowledgement);
  };

  const closeReader = () => {
    setActive(null);
    setSignature(null);
    void load();
  };

  const handleSign = async () => {
    if (!active || !signature) {
      return;
    }
    setSigning(true);
    try {
      await signAcknowledgement(active.id, signature);
      toast.success('Documento firmado. Ya forma parte de tu expediente.');
      closeReader();
    } catch (error) {
      // El servidor es quien decide si la lectura basta; su mensaje es el bueno.
      toast.error(getApiErrorMessage(error, 'No se pudo firmar el documento.'));
    } finally {
      setSigning(false);
    }
  };

  // El servidor devuelve el estado recalculado en cada latido; aqui solo se
  // refleja. Nunca se calcula el avance en el cliente.
  const handleHeartbeat = useCallback(
    async (page: number) => {
      if (!active) {
        return;
      }
      try {
        const updated = await reportReadingProgress(active.id, page);
        setActive(updated);
        if (updated.status === 'read' && !announcedReadRef.current) {
          announcedReadRef.current = true;
          toast.success('Lectura completa. Ya puedes firmar el documento.');
        }
      } catch {
        // Un latido perdido no es critico: el siguiente reintenta. No molestamos
        // al usuario con un toast por cada hipo de red.
      }
    },
    [active],
  );

  // Avance mostrado al operador. Todo sale de lo que respondio el servidor en el
  // ultimo latido; aqui no se calcula nada de tiempo.
  const readComplete = active?.status === 'read' || active?.status === 'signed';
  const coveragePercent = useMemo(() => {
    if (!active || active.pages_total <= 0) {
      return 0;
    }
    return Math.round((active.pages_seen_count / active.pages_total) * 100);
  }, [active]);

  // Paginas que aun no acumulan la permanencia minima. Sin esto, al operador le
  // toca adivinar cual le falta de un documento largo.
  const missingPages = useMemo(() => {
    if (!active) {
      return [];
    }
    const seen = new Set(active.pages_seen);
    return Array.from({ length: active.pages_total }, (_, index) => index + 1).filter(
      (page) => !seen.has(page),
    );
  }, [active]);

  const pendingCount = items.filter((item) => item.status !== 'signed').length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">
          Documentos por leer y firmar
        </h1>
        <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
          Debes recorrer el documento completo antes de poder firmarlo.
          {pendingCount > 0 ? ` Tienes ${pendingCount} pendiente(s).` : ''}
        </p>
      </header>

      {loading && (
        <p className="text-sm text-[var(--unilabor-neutral)]">Cargando…</p>
      )}

      {!loading && loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-5 py-6 text-center">
          <AlertTriangle className="mx-auto text-rose-500" size={28} />
          <p className="mt-2 text-sm font-medium text-rose-800">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-full border border-rose-300 px-4 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Reintentar
          </button>
        </div>
      )}

      {!loading && !loadError && items.length === 0 && (
        <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 px-5 py-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500" size={28} />
          <p className="mt-2 text-sm text-[var(--unilabor-neutral)]">
            No tienes documentos pendientes de acuse.
          </p>
        </div>
      )}

      <div className="grid gap-3">
        {items.map((item) => {
          const overdue = item.status === 'expired';
          return (
            <article
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 px-5 py-4 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-[var(--color-brand-500)]" />
                  <h2 className="truncate font-semibold text-[var(--color-brand-700)]">
                    {item.document_title ?? `Documento #${item.institutional_document_id}`}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      STATUS_STYLE[item.status] ?? 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--unilabor-neutral)]">
                  {overdue ? <AlertTriangle size={13} className="text-rose-500" /> : <Clock size={13} />}
                  {formatDeadline(item.deadline_at)}
                  <span aria-hidden>·</span>
                  Páginas {item.pages_seen_count}/{item.pages_total}
                </p>
              </div>

              {item.status !== 'signed' && item.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => openReader(item)}
                  disabled={overdue}
                  className="rounded-lg bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-600)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {item.status === 'read' ? 'Firmar' : 'Leer documento'}
                </button>
              )}
            </article>
          );
        })}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="my-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] bg-white/96 px-4 py-3">
              <div className="min-w-0 truncate text-sm font-bold text-[var(--color-brand-700)]">
                {active.document_title ?? 'Documento'}
              </div>
              <button
                type="button"
                onClick={closeReader}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)] hover:text-[var(--color-brand-700)]"
              >
                <ArrowLeft size={15} />
                Cerrar
              </button>
            </div>

            {/* Avance de lectura: va aqui y no en la barra del visor porque ese
                componente lo comparten Calidad y Activos, y ahi el indicador
                quedaba apretado entre los controles de zoom y paginacion. */}
            <div className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] px-4 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--color-brand-700)]">
                  {readComplete
                    ? 'Lectura completa · ya puedes firmar'
                    : `Páginas leídas ${active.pages_seen_count} de ${active.pages_total}`}
                </span>
                {!readComplete && missingPages.length > 0 && missingPages.length <= 12 && (
                  <span className="text-xs text-[var(--unilabor-neutral)]">
                    {missingPages.length === 1
                      ? `Te falta la página ${missingPages[0]}`
                      : `Te faltan las páginas ${missingPages.join(', ')}`}
                  </span>
                )}
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[rgba(0,65,106,0.1)]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    readComplete ? 'bg-emerald-500' : 'bg-[var(--color-brand-500)]'
                  }`}
                  style={{ width: `${coveragePercent}%` }}
                />
              </div>
            </div>

            <PdfSafeViewer
              key={active.id}
              fileUrl={`${API_BASE_URL}/rh/institutional-documents/${active.institutional_document_id}/view`}
              tracking={{ onHeartbeat: handleHeartbeat }}
            />

            {active.status === 'read' ? (
              <div className="max-h-[38vh] overflow-y-auto border-t border-[rgba(0,65,106,0.08)] bg-white/96 px-4 py-4">
                <p className="text-sm font-semibold text-[var(--color-brand-700)]">
                  Declaración de conformidad
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--unilabor-neutral)]">
                  Declaro que recibí, consulté en su totalidad y comprendí el documento
                  que antecede, y que manifiesto mi conformidad con su contenido. Firmo de
                  manera autógrafa para constancia.
                </p>

                <div className="mt-3">
                  <SignaturePad
                    label="Firma autógrafa"
                    hint="Firma con el dedo, el Apple Pencil o el mouse."
                    onChange={setSignature}
                  />
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeReader}
                    disabled={signing}
                    className="rounded-lg border border-[rgba(0,65,106,0.12)] px-4 py-2 text-sm text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSign}
                    disabled={!signature || signing}
                    className="rounded-lg bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-600)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {signing ? 'Firmando…' : 'Firmar documento'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
