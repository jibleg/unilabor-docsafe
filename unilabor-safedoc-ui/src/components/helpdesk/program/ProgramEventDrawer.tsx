import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, CalendarClock, ClipboardCheck, ExternalLink, FileText, Loader2, PenLine, Play, ShieldCheck, Ticket, X } from 'lucide-react';
import {
  executeMaintenanceOrder,
  fetchMaintenanceOrderDetail,
  getApiErrorMessage,
  getAssetDocumentBlobUrl,
  rescheduleMaintenanceOrderById,
  startMaintenanceOrderById,
  validateMaintenanceOrderSignature,
} from '../../../api/service';
import { PdfSafeViewer } from '../../PdfSafeViewerSafe';
import type { CalendarEvent, MaintenanceOrderDetail, MaintenanceOrderEvidence, OrderExecutionPayload } from '../../../types/helpdesk-program';
import type { Employee, HelpdeskCatalogItem } from '../../../types/models';
import { CRITICALITY_STYLES, EXECUTOR_LABELS, KIND_LABELS, KIND_STYLES, STATUS_LABELS, canRescheduleEvent, formatDateLong, formatDateShort, formatDateTime } from '../../../utils/maintenanceProgram';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { useHasPermission } from '../../../utils/permissions';
import { OrderExecutionModal } from './OrderExecutionModal';
import { OrderValidationModal } from './OrderValidationModal';
import { RescheduleModal } from './RescheduleModal';

interface ProgramEventDrawerProps {
  event: CalendarEvent | null;
  employees: Employee[];
  suppliers: HelpdeskCatalogItem[];
  pendingDropDate: string | null;
  onClearDrop: () => void;
  onClose: () => void;
  onChanged: () => void;
}

const Row = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div>
    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{label}</p>
    <p className="text-sm text-[var(--unilabor-ink)]">{value || '—'}</p>
  </div>
);

const actionClass = 'inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-50';
const primaryClass = 'inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-700)] px-3 py-2 text-xs font-semibold text-white shadow transition hover:bg-[var(--color-brand-600)] disabled:opacity-60';

export const ProgramEventDrawer = ({ event, employees, suppliers, pendingDropDate, onClearDrop, onClose, onChanged }: ProgramEventDrawerProps) => {
  const navigate = useNavigate();
  const canWrite = useHasPermission('HELPDESK.MAINTENANCE.WRITE');
  const [order, setOrder] = useState<MaintenanceOrderDetail | null>(null);
  const [evidence, setEvidence] = useState<MaintenanceOrderEvidence[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showExecute, setShowExecute] = useState(false);
  const [showValidate, setShowValidate] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const isMaintenance = event?.source === 'maintenance';

  const load = useCallback(async () => {
    if (!event || event.source !== 'maintenance') {
      setOrder(null);
      setEvidence([]);
      return;
    }
    setLoading(true);
    try {
      const detail = await fetchMaintenanceOrderDetail(event.source_id);
      setOrder(detail.order);
      setEvidence(detail.evidence);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la orden.'));
    } finally {
      setLoading(false);
    }
  }, [event]);

  useEffect(() => {
    void load();
    setPdfUrl(null);
  }, [load]);

  useEffect(() => {
    if (pendingDropDate && event && canRescheduleEvent(event)) {
      setShowReschedule(true);
    }
  }, [pendingDropDate, event]);

  if (!event) return null;

  const run = async (label: string, action: () => Promise<{ message?: string } | void>) => {
    setSaving(true);
    try {
      const result = await action();
      notifySuccess((result && 'message' in result && result.message) || label);
      await load();
      onChanged();
    } catch (error) {
      notifyError(getApiErrorMessage(error, `No se pudo completar: ${label.toLowerCase()}.`));
    } finally {
      setSaving(false);
    }
  };

  const openConstancia = async (documentId: number) => {
    try {
      setPdfUrl(await getAssetDocumentBlobUrl(documentId));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir la constancia.'));
    }
  };

  const status = order?.status ?? event.status;
  const canStart = isMaintenance && (status === 'SCHEDULED' || status === 'RESCHEDULED');
  const canExecute = isMaintenance && status !== 'CLOSED' && status !== 'PENDING_VALIDATION';
  const canValidate = isMaintenance && status === 'PENDING_VALIDATION';
  const style = KIND_STYLES[event.kind];

  return (
    <>
      <aside className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white shadow-xl">
        <div className={`border-b border-[rgba(0,65,106,0.08)] px-4 py-3 ${style.bar}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">{KIND_LABELS[event.kind]} · {event.code}</p>
              <h3 className="truncate text-base font-bold text-[var(--color-brand-700)]">
                {event.asset.asset_code} <span className="font-medium text-[var(--unilabor-ink)]">{event.asset.name}</span>
              </h3>
              <p className="text-xs text-[var(--unilabor-neutral)]">{event.title}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-white/70" aria-label="Cerrar panel">
              <X size={18} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${event.window_state === 'OVERDUE' && status !== 'CLOSED' ? 'bg-[rgba(190,40,40,0.14)] text-[#b02a2a]' : 'bg-white/80 text-[var(--color-brand-700)]'}`}>
              {STATUS_LABELS[status] ?? status}
              {event.window_state === 'OVERDUE' && status !== 'CLOSED' ? ' · VENCIDA' : ''}
            </span>
            {event.asset.criticality_code ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CRITICALITY_STYLES[event.asset.criticality_code] ?? ''}`}>{event.asset.criticality_name}</span> : null}
            {event.is_projected && status === 'SCHEDULED' ? <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-[var(--unilabor-neutral)]">Proyectada</span> : null}
            {order?.program_version ? <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-[var(--unilabor-neutral)]">Programa v{order.program_version}</span> : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.9)] p-3">
            <p className="text-sm font-bold text-[var(--color-brand-700)]">{formatDateLong(event.date)}</p>
            {event.window_starts_on || event.window_ends_on ? (
              <div className="mt-1.5">
                <div className="flex justify-between text-[10px] font-semibold text-[var(--unilabor-neutral)]">
                  <span>Desde {formatDateShort(event.window_starts_on)}</span>
                  <span className={event.window_state === 'OVERDUE' && status !== 'CLOSED' ? 'text-[#b02a2a]' : ''}>Hasta {formatDateShort(event.window_ends_on)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[rgba(191,212,230,0.4)]">
                  <div className={`h-full rounded-full ${event.window_state === 'OVERDUE' && status !== 'CLOSED' ? 'bg-[#b02a2a]' : style.dot}`} style={{ width: '100%' }} />
                </div>
              </div>
            ) : null}
            {order?.reschedule_reason ? (
              <p className="mt-2 text-[11px] text-[var(--unilabor-neutral)]">
                Reprogramada desde {formatDateShort(order.rescheduled_from)}: {order.reschedule_reason}
              </p>
            ) : null}
          </section>

          <section className="grid grid-cols-2 gap-3">
            <Row label="Unidad / Área" value={`${event.asset.unit_name ?? '—'} / ${event.asset.area_name ?? '—'}`} />
            <Row label="Categoría" value={event.asset.category_name} />
            <Row label="Responsable técnico" value={event.asset.responsible_employee_name} />
            <Row label="Operador" value={event.asset.assigned_employee_name} />
            <Row label="Estado operativo" value={event.asset.operational_status_name} />
            <Row label="Ejecutor" value={order ? EXECUTOR_LABELS[order.executor_kind] : event.executor_kind ? EXECUTOR_LABELS[event.executor_kind as keyof typeof EXECUTOR_LABELS] : null} />
            {event.plan_code ? <Row label="Rutina" value={`${event.plan_code} · ${event.plan_title ?? ''}`} /> : null}
            {event.supplier_name ? <Row label="Proveedor" value={event.supplier_name} /> : null}
          </section>

          {loading ? (
            <p className="flex items-center gap-2 text-xs text-[var(--unilabor-neutral)]">
              <Loader2 size={14} className="animate-spin" /> Cargando orden...
            </p>
          ) : null}

          {order && order.checklist.length > 0 ? (
            <section>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                <ClipboardCheck size={13} /> Checklist ({order.checklist.filter((c) => c.result !== 'PENDING').length}/{order.checklist.length})
              </h4>
              <ul className="space-y-1">
                {order.checklist.map((item) => (
                  <li key={`${item.id}-${item.task_text}`} className="flex items-start gap-2 text-xs text-[var(--unilabor-ink)]">
                    <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${item.result === 'OK' ? 'bg-[#1c7a4a]' : item.result === 'NOT_OK' ? 'bg-[#b02a2a]' : item.result === 'NA' ? 'bg-[#64748b]' : 'bg-[rgba(0,65,106,0.2)]'}`} />
                    <span>
                      {item.task_text}
                      {item.notes ? <span className="text-[var(--unilabor-neutral)]"> — {item.notes}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {order && (order.status === 'CLOSED' || order.status === 'PENDING_VALIDATION') ? (
            <section className="space-y-2 rounded-2xl border border-[rgba(0,65,106,0.08)] p-3">
              <Row label="Ejecutada" value={formatDateTime(order.completed_at)} />
              <Row label="Actividades" value={order.performed_activities} />
              <Row label="Resultado" value={order.result} />
              {order.findings ? <Row label="Hallazgos" value={order.findings} /> : null}
              <div className="grid grid-cols-2 gap-3">
                <Row label="Realizado por" value={order.executed_by_employee_name ?? order.supplier_name ?? order.provider_name} />
                <Row label="Fuera de servicio" value={order.downtime_minutes !== null ? `${order.downtime_minutes} min` : null} />
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
                <span className={`rounded-full px-2 py-0.5 ${order.has_technician_signature ? 'bg-[rgba(34,139,84,0.12)] text-[#1c7a4a]' : 'bg-[rgba(191,212,230,0.4)] text-[var(--unilabor-neutral)]'}`}>Firma ejecutor {order.has_technician_signature ? '✓' : '—'}</span>
                <span className={`rounded-full px-2 py-0.5 ${order.has_responsible_signature ? 'bg-[rgba(34,139,84,0.12)] text-[#1c7a4a]' : 'bg-[rgba(191,212,230,0.4)] text-[var(--unilabor-neutral)]'}`}>Firma responsable {order.has_responsible_signature ? '✓' : '—'}</span>
                {order.derived_ticket_code ? <span className="rounded-full bg-[rgba(190,40,40,0.12)] px-2 py-0.5 text-[#b02a2a]">Correctivo {order.derived_ticket_code}</span> : null}
              </div>
              {evidence.length > 0 ? (
                <ul className="space-y-1 text-xs">
                  {evidence.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-2">
                      <FileText size={12} className="shrink-0 text-[var(--color-brand-500)]" />
                      <button type="button" onClick={() => void openConstancia(doc.id)} className="truncate text-left text-[var(--color-brand-700)] hover:underline">
                        {doc.title}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[rgba(0,65,106,0.08)] px-4 py-3">
          {canWrite && canStart ? (
            <button type="button" className={actionClass} disabled={saving} onClick={() => void run('Orden iniciada.', () => startMaintenanceOrderById(event.source_id).then(() => undefined))}>
              <Play size={13} /> Iniciar
            </button>
          ) : null}
          {canWrite && canRescheduleEvent({ ...event, status }) ? (
            <button type="button" className={actionClass} disabled={saving} onClick={() => setShowReschedule(true)}>
              <CalendarClock size={13} /> Reprogramar
            </button>
          ) : null}
          {canWrite && canExecute && order ? (
            <button type="button" className={primaryClass} disabled={saving} onClick={() => setShowExecute(true)}>
              <ClipboardCheck size={13} /> Registrar ejecución
            </button>
          ) : null}
          {canWrite && canValidate ? (
            <button type="button" className={primaryClass} disabled={saving} onClick={() => setShowValidate(true)}>
              <PenLine size={13} /> Validar (firma)
            </button>
          ) : null}
          {order?.constancia_document_id ? (
            <button type="button" className={actionClass} onClick={() => void openConstancia(order.constancia_document_id as number)}>
              <ShieldCheck size={13} /> Constancia
            </button>
          ) : null}
          {event.source === 'ticket' || order?.ticket_id || order?.derived_ticket_id ? (
            <button type="button" className={actionClass} onClick={() => navigate(`/helpdesk/tickets/${event.source === 'ticket' ? event.source_id : order?.ticket_id ?? order?.derived_ticket_id}`)}>
              <Ticket size={13} /> Ticket
            </button>
          ) : null}
          {event.source === 'calibration' ? (
            <button type="button" className={actionClass} onClick={() => navigate('/helpdesk/calibration')}>
              <ExternalLink size={13} /> Calibración
            </button>
          ) : null}
          <button type="button" className={`${actionClass} ml-auto`} onClick={() => navigate(`/helpdesk/assets/${event.asset.id}/program`)}>
            <ArrowUpRight size={13} /> Programa del activo
          </button>
        </div>
      </aside>

      <RescheduleModal
        open={showReschedule}
        code={event.code}
        currentDate={event.date}
        initialDate={pendingDropDate}
        saving={saving}
        onClose={() => {
          setShowReschedule(false);
          onClearDrop();
        }}
        onSubmit={(date, reason) =>
          void run('Orden reprogramada.', async () => {
            await rescheduleMaintenanceOrderById(event.source_id, { scheduled_for: date, reschedule_reason: reason });
            setShowReschedule(false);
            onClearDrop();
          })
        }
      />
      {order ? (
        <OrderExecutionModal
          open={showExecute}
          order={order}
          evidence={evidence}
          employees={employees}
          suppliers={suppliers}
          saving={saving}
          onClose={() => setShowExecute(false)}
          onEvidenceChanged={() => void load()}
          onSubmit={(payload: OrderExecutionPayload) =>
            void run('Ejecución registrada.', async () => {
              const result = await executeMaintenanceOrder(order.id, payload);
              setShowExecute(false);
              return result;
            })
          }
        />
      ) : null}
      <OrderValidationModal
        open={showValidate}
        code={event.code}
        responsibleName={event.asset.responsible_employee_name}
        saving={saving}
        onClose={() => setShowValidate(false)}
        onSubmit={(signature, notes) =>
          void run('Orden validada.', async () => {
            const result = await validateMaintenanceOrderSignature(event.source_id, signature, notes);
            setShowValidate(false);
            return result;
          })
        }
      />
      {pdfUrl ? (
        <div className="fixed inset-0 z-[80] flex flex-col bg-[rgba(11,34,53,0.75)] p-3 backdrop-blur-sm">
          <div className="mb-2 flex justify-end">
            <button type="button" onClick={() => setPdfUrl(null)} className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)]">
              <X size={14} /> Cerrar documento
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-2xl bg-white p-2">
            <PdfSafeViewer key={pdfUrl} fileUrl={pdfUrl} />
          </div>
        </div>
      ) : null}
    </>
  );
};
