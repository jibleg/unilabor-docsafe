import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Download, FileText } from 'lucide-react';
import { toast } from 'react-toastify';
import { PdfSafeViewer } from '../components/PdfSafeViewerSafe';
import { SignaturePad } from '../components/helpdesk/SignaturePad';
import { API_BASE_URL } from '../api/axios';
import { getApiErrorMessage } from '../api/service.parsers';
import {
  getMySignedReadingUrl,
  listMyReadings,
  reportReadingProgress,
  signMyReading,
} from '../api/service.api-quality-reading';
import type { MyReading } from '../types/models';
import { READER_STATUS_LABEL, READER_STATUS_STYLE, formatStamp } from './QualityReadingRoomPage.helpers';

const formatDeadline = (value: string | null): string => {
  if (!value) {
    return 'Sin plazo';
  }
  const deadline = new Date(value);
  const hours = (deadline.getTime() - Date.now()) / 3_600_000;
  if (hours < 0) {
    return `Vencido el ${formatStamp(value)}`;
  }
  if (hours < 24) {
    return `Vence en ${Math.max(1, Math.round(hours))} h · ${formatStamp(value)}`;
  }
  return `Vence en ${Math.round(hours / 24)} d · ${formatStamp(value)}`;
};

export const QualityMyReadingsPage = () => {
  const [items, setItems] = useState<MyReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<MyReading | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  // Firma exprés desde la lista: documento ya leído por completo, solo falta la
  // firma — modal directo sin reabrir el visor.
  const [signTarget, setSignTarget] = useState<MyReading | null>(null);
  const [modalSignature, setModalSignature] = useState<string | null>(null);

  // Evita repetir el aviso de "ya puedes firmar" en cada latido.
  const announcedReadRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listMyReadings());
      setLoadError(null);
    } catch (error) {
      const message = getApiErrorMessage(error, 'No se pudieron cargar tus lecturas.');
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

  const openReader = (reading: MyReading) => {
    announcedReadRef.current = reading.status === 'read';
    setSignature(null);
    setActive(reading);
  };

  const closeReader = () => {
    setActive(null);
    setSignature(null);
    void load();
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
        // Un latido perdido no es critico: el siguiente reintenta.
      }
    },
    [active],
  );

  const handleSign = async () => {
    if (!active || !signature) {
      return;
    }
    setSigning(true);
    try {
      await signMyReading(active.id, signature);
      toast.success('Documento firmado. La constancia queda en el expediente de Calidad.');
      closeReader();
    } catch (error) {
      // El servidor decide si la lectura basta; su mensaje es el bueno.
      toast.error(getApiErrorMessage(error, 'No se pudo firmar el documento.'));
    } finally {
      setSigning(false);
    }
  };

  const handleSignFromModal = async () => {
    if (!signTarget || !modalSignature) {
      return;
    }
    setSigning(true);
    try {
      await signMyReading(signTarget.id, modalSignature);
      toast.success('Documento firmado. La constancia queda en el expediente de Calidad.');
      setSignTarget(null);
      setModalSignature(null);
      void load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo firmar el documento.'));
    } finally {
      setSigning(false);
    }
  };

  const openSignedCopy = async (readingId: number) => {
    try {
      const url = await getMySignedReadingUrl(readingId);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo abrir la constancia de lectura.'));
    }
  };

  const readComplete = active?.status === 'read' || active?.status === 'signed';

  const coveragePercent = useMemo(() => {
    if (!active || active.pages_total <= 0) {
      return 0;
    }
    return Math.round((active.pages_seen_count / active.pages_total) * 100);
  }, [active]);

  // Paginas que aun no acumulan la permanencia minima: sin esto, al lector le
  // toca adivinar cual le falta en un documento largo.
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
        <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Sala de lectura</h1>
        <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
          Documentos del SGC que debes leer y firmar. Hay que recorrer el documento completo antes
          de poder firmarlo.
          {pendingCount > 0 ? ` Tienes ${pendingCount} pendiente(s).` : ''}
        </p>
      </header>

      {loading && <p className="text-sm text-[var(--unilabor-neutral)]">Cargando…</p>}

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
            No tienes documentos pendientes de leer.
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
                    {item.document_title}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      READER_STATUS_STYLE[item.status]
                    }`}
                  >
                    {READER_STATUS_LABEL[item.status]}
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--unilabor-neutral)]">
                  {overdue ? (
                    <AlertTriangle size={13} className="text-rose-500" />
                  ) : (
                    <Clock size={13} />
                  )}
                  {formatDeadline(item.deadline_at)} · {item.pages_seen_count}/{item.pages_total} pág.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {item.status === 'signed' && item.has_signed_copy && (
                  <button
                    type="button"
                    onClick={() => void openSignedCopy(item.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,65,106,0.15)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(0,65,106,0.05)]"
                  >
                    <Download size={14} /> Constancia
                  </button>
                )}
                {item.status !== 'signed' && item.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (item.status === 'read') {
                        setModalSignature(null);
                        setSignTarget(item);
                      } else {
                        openReader(item);
                      }
                    }}
                    className="rounded-full bg-[var(--color-brand-700)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                  >
                    {item.status === 'read' ? 'Firmar' : 'Leer'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="my-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] bg-white/96 px-4 py-3">
              <div className="min-w-0 truncate text-sm font-bold text-[var(--color-brand-700)]">
                {active.document_title}
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
              fileUrl={`${API_BASE_URL}/quality/me/readings/${active.id}/view`}
              tracking={{ onHeartbeat: handleHeartbeat }}
            />

            {active.status === 'read' && (
              <div className="max-h-[38vh] overflow-y-auto border-t border-[rgba(0,65,106,0.08)] bg-white/96 px-4 py-4">
                <p className="text-sm font-semibold text-[var(--color-brand-700)]">
                  Declaración de conformidad
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--unilabor-neutral)]">
                  Declaro que recibí, consulté en su totalidad y comprendí el documento que
                  antecede, y que manifiesto mi conformidad con su contenido. Firmo de manera
                  autógrafa para constancia.
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
                    onClick={() => void handleSign()}
                    disabled={signing || !signature}
                    className="rounded-lg bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {signing ? 'Firmando…' : 'Firmar documento'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {signTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl shadow-[rgba(0,65,106,0.18)]">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
                Firma de conformidad
              </p>
              <h2 className="mt-1 text-base font-bold text-[var(--color-brand-700)]">
                {signTarget.document_title}
              </h2>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              <p className="text-xs leading-relaxed text-[var(--unilabor-neutral)]">
                Declaro que recibí, consulté en su totalidad y comprendí el documento que antecede,
                y que manifiesto mi conformidad con su contenido. Firmo de manera autógrafa para
                constancia.
              </p>
              <div className="mt-3">
                <SignaturePad
                  label="Firma autógrafa"
                  hint="Firma con el dedo, el Apple Pencil o el mouse."
                  onChange={setModalSignature}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setSignTarget(null);
                  setModalSignature(null);
                }}
                disabled={signing}
                className="rounded-lg border border-[rgba(0,65,106,0.12)] px-4 py-2 text-sm text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSignFromModal()}
                disabled={signing || !modalSignature}
                className="rounded-lg bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {signing ? 'Firmando…' : 'Firmar documento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
