import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Eye,
  FileText,
  Loader2,
  MapPin,
  Move,
  PackagePlus,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import {
  fetchLifecycleEventDetail,
  getAssetDocumentBlobUrl,
  getApiErrorMessage,
  type LifecycleEventDetail,
} from '../api/service';
import { PdfSafeViewer } from '../components/PdfSafeViewerSafe';
import { notifyError } from '../utils/notify';

const EVENT_ICONS: Record<string, typeof PackagePlus> = {
  ACQUISITION: PackagePlus,
  COMMISSIONING: Boxes,
  MAINTENANCE: Wrench,
  CALIBRATION: ShieldCheck,
  INCIDENT: AlertTriangle,
  RELOCATION: MapPin,
  DECOMMISSION: Trash2,
  HANDOVER: FileText,
  MOVEMENT: Move,
};

const dash = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value));

const DetailRow = ({ label, value }: { label: string; value: unknown }) => (
  <div className="flex flex-col">
    <span className="text-xs text-[var(--unilabor-neutral)]">{label}</span>
    <span className="text-sm font-semibold text-[var(--unilabor-ink)]">{dash(value)}</span>
  </div>
);

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
};

export const HelpdeskLifecycleEventPage = () => {
  const { id, eventId } = useParams();
  const assetId = Number(id);
  const navigate = useNavigate();

  const [detail, setDetail] = useState<LifecycleEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await fetchLifecycleEventDetail(Number(eventId)));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el detalle del evento.'));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleView = async (documentId: number) => {
    try {
      setPdfUrl(await getAssetDocumentBlobUrl(documentId));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir la evidencia.'));
    }
  };

  const backToExpedient = () => navigate(`/helpdesk/assets/${assetId}/expedient`);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-[var(--color-brand-700)]">
        <Loader2 className="animate-spin" /> <span className="ml-2">Cargando evento...</span>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6">
        <button onClick={backToExpedient} className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-brand-700)]">
          <ArrowLeft size={16} /> Volver al expediente
        </button>
        <p className="text-sm text-[var(--unilabor-neutral)]">No se encontró el evento.</p>
      </div>
    );
  }

  const { event, documents } = detail;
  const Icon = EVENT_ICONS[event.event_type?.code ?? ''] ?? PackagePlus;

  return (
    <div className="space-y-5 p-1">
      <button onClick={backToExpedient} className="inline-flex items-center gap-1 text-sm text-[var(--color-brand-700)]">
        <ArrowLeft size={16} /> Volver al expediente
      </button>

      {/* Encabezado del evento */}
      <div className="rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-brand-700)] text-white">
            <Icon size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              {event.event_type?.name ?? 'Evento'} · {event.event_code}
            </p>
            <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">{event.title}</h1>
            <p className="text-sm text-[var(--unilabor-neutral)]">{formatDateTime(event.event_date)}</p>
          </div>
        </div>

        {event.description ? (
          <p className="mt-4 rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.96)] p-3 text-sm text-[var(--unilabor-ink)]">
            {event.description}
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
          <DetailRow label="Tipo de evento" value={event.event_type?.name} />
          <DetailRow label="Folio del evento" value={event.event_code} />
          <DetailRow label="Fecha" value={event.event_date} />
          {event.performed_by_employee ? (
            <DetailRow label="Realizado por" value={event.performed_by_employee.full_name} />
          ) : null}
          {event.performed_by_provider ? <DetailRow label="Proveedor ejecutor" value={event.performed_by_provider} /> : null}
          {event.supplier ? <DetailRow label="Proveedor" value={event.supplier.name} /> : null}
          {event.cost !== null && event.cost !== undefined ? (
            <DetailRow label="Costo" value={`${event.cost} ${event.currency ?? 'MXN'}`} />
          ) : null}
          {event.calibration_certificate_no ? (
            <DetailRow label="Certificado de calibración" value={event.calibration_certificate_no} />
          ) : null}
          {event.calibration_due_on ? <DetailRow label="Próxima calibración" value={event.calibration_due_on} /> : null}
          {event.from_location ? <DetailRow label="Ubicación origen" value={event.from_location.name} /> : null}
          {event.to_location ? <DetailRow label="Ubicación destino" value={event.to_location.name} /> : null}
          {event.disposal_reason ? <DetailRow label="Motivo de baja" value={event.disposal_reason.name} /> : null}
          {event.ticket_id ? (
            <div className="flex flex-col">
              <span className="text-xs text-[var(--unilabor-neutral)]">Ticket relacionado</span>
              <button
                type="button"
                onClick={() => navigate(`/helpdesk/tickets/${event.ticket_id}`)}
                className="text-left text-sm font-semibold text-[var(--color-brand-700)] hover:underline"
              >
                Ver solicitud #{event.ticket_id}
              </button>
            </div>
          ) : null}
          {event.maintenance_order_id ? (
            <DetailRow label="Orden de mantenimiento" value={`#${event.maintenance_order_id}`} />
          ) : null}
        </div>

        {event.notes ? (
          <div className="mt-4">
            <p className="text-xs text-[var(--unilabor-neutral)]">Observaciones</p>
            <p className="text-sm text-[var(--unilabor-ink)]">{event.notes}</p>
          </div>
        ) : null}
      </div>

      {/* Evidencias asociadas */}
      <div className="rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-[var(--color-brand-700)]">Evidencias asociadas</h2>

        {event.generated_act_document_id ? (
          <button
            type="button"
            onClick={() => handleView(event.generated_act_document_id as number)}
            className="mb-3 inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)]"
          >
            <FileText size={16} /> Ver acta/reporte generado
          </button>
        ) : null}

        {documents.length === 0 && !event.generated_act_document_id ? (
          <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
            Este evento no tiene evidencias documentales asociadas.
          </p>
        ) : (
          <ul className="divide-y divide-[rgba(0,65,106,0.08)] rounded-xl border border-[rgba(0,65,106,0.1)]">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--unilabor-ink)]">{doc.title}</p>
                  <p className="text-xs text-[var(--unilabor-neutral)]">
                    {doc.document_kind_name ?? 'Documento'}
                    {doc.issued_on ? ` · Emitido ${doc.issued_on}` : ''}
                    {typeof doc.version === 'number' ? ` · v${doc.version}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleView(doc.id)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                >
                  <Eye size={14} /> Ver
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pdfUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/95 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
                <Eye size={16} /> VISOR SEGURO — EVIDENCIA
              </div>
              <button
                type="button"
                onClick={() => setPdfUrl(null)}
                className="rounded-full px-3 py-1.5 text-sm text-[var(--unilabor-neutral)] transition hover:bg-[rgba(191,212,230,0.28)]"
              >
                Cerrar
              </button>
            </div>
            <PdfSafeViewer key={pdfUrl} fileUrl={pdfUrl} />
          </div>
        </div>
      ) : null}
    </div>
  );
};
