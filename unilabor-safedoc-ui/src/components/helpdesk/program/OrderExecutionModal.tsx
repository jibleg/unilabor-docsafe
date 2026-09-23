import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, Loader2, Paperclip, Save, Upload, X, XCircle } from 'lucide-react';
import { getApiErrorMessage, uploadMaintenanceOrderEvidence } from '../../../api/service';
import { SearchableSelect } from '../../SearchableSelect';
import { SignaturePad } from '../SignaturePad';
import type { MaintenanceOrderDetail, MaintenanceOrderEvidence, OrderExecutionPayload } from '../../../types/helpdesk-program';
import type { Employee, HelpdeskCatalogItem } from '../../../types/models';
import { CRITICALITY_STYLES, EXECUTOR_LABELS, KIND_LABELS, formatDateShort } from '../../../utils/maintenanceProgram';
import { notifyError, notifySuccess, notifyWarning } from '../../../utils/notify';

interface OrderExecutionModalProps {
  open: boolean;
  order: MaintenanceOrderDetail;
  evidence: MaintenanceOrderEvidence[];
  employees: Employee[];
  suppliers: HelpdeskCatalogItem[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: OrderExecutionPayload) => void;
  onEvidenceChanged: () => void;
}

type ChecklistResult = 'OK' | 'NOT_OK' | 'NA' | 'PENDING';

interface ChecklistRow {
  plan_task_id: number | null;
  task_text: string;
  result: ChecklistResult;
  notes: string;
}

const RESULT_OPTIONS: Array<{ value: ChecklistResult; label: string; icon: typeof CheckCircle2; active: string }> = [
  { value: 'OK', label: 'Conforme', icon: CheckCircle2, active: 'bg-[rgba(34,139,84,0.15)] text-[#1c7a4a] ring-[#1c7a4a]' },
  { value: 'NOT_OK', label: 'No conforme', icon: XCircle, active: 'bg-[rgba(190,40,40,0.14)] text-[#b02a2a] ring-[#b02a2a]' },
  { value: 'NA', label: 'No aplica', icon: CircleSlash, active: 'bg-[rgba(100,116,139,0.15)] text-[#334155] ring-[#64748b]' },
];

const nowLocal = (): string => {
  const now = new Date();
  now.setSeconds(0, 0);
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 16);
};

const inputClass = 'mt-1 w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm text-[var(--unilabor-ink)] focus:border-[var(--color-brand-500)] focus:outline-none';
const labelClass = 'block text-xs font-semibold text-[var(--unilabor-ink)]';

export const OrderExecutionModal = ({ open, order, evidence, employees, suppliers, saving, onClose, onSubmit, onEvidenceChanged }: OrderExecutionModalProps) => {
  const [completedAt, setCompletedAt] = useState(nowLocal());
  const [activities, setActivities] = useState('');
  const [result, setResult] = useState('Conforme');
  const [findings, setFindings] = useState('');
  const [executedBy, setExecutedBy] = useState('');
  const [supplierId, setSupplierId] = useState(order.supplier_id ? String(order.supplier_id) : '');
  const [downtime, setDowntime] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [technicianSignature, setTechnicianSignature] = useState<string | null>(null);
  const [responsibleSignature, setResponsibleSignature] = useState<string | null>(null);
  const [openTicket, setOpenTicket] = useState(false);
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChecklist(order.checklist.map((item) => ({ plan_task_id: item.plan_task_id, task_text: item.task_text, result: (item.result as ChecklistResult) === 'PENDING' ? 'PENDING' : (item.result as ChecklistResult), notes: item.notes ?? '' })));
    setCompletedAt(nowLocal());
    setActivities(order.performed_activities ?? '');
    setFindings(order.findings ?? '');
    setResult(order.result ?? 'Conforme');
    setOpenTicket(false);
  }, [open, order]);

  const employeeOptions = useMemo(() => employees.filter((e) => e.is_active).map((e) => ({ value: String(e.id), label: e.full_name, hint: e.position ?? e.area ?? undefined })), [employees]);
  const supplierOptions = useMemo(() => suppliers.map((s) => ({ value: String(s.id), label: s.name })), [suppliers]);
  const external = order.executor_kind === 'EXTERNAL_PROVIDER';
  const strict = order.asset?.criticality_code === 'CRITICAL' || order.asset?.criticality_code === 'HIGH';
  const hasNotOk = checklist.some((row) => row.result === 'NOT_OK');
  const pendingRequired = checklist.filter((row) => row.plan_task_id && row.result === 'PENDING').length;
  const realEvidence = evidence.filter((doc) => doc.document_kind_code !== 'MAINTENANCE_CONSTANCIA');

  if (!open) return null;

  const setRow = (index: number, patch: Partial<ChecklistRow>) => setChecklist((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadMaintenanceOrderEvidence(order.id, file, fileTitle.trim() || file.name);
      notifySuccess('Evidencia adjuntada.');
      setFile(null);
      setFileTitle('');
      onEvidenceChanged();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo adjuntar la evidencia.'));
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    if (!activities.trim()) return notifyWarning('Describe las actividades realizadas.');
    if (order.checklist_required && pendingRequired > 0) return notifyWarning(`Registra las ${pendingRequired} tarea(s) pendientes del checklist.`);
    if (external && !supplierId) return notifyWarning('Selecciona el proveedor que realizó el servicio.');
    if (order.evidence_required && realEvidence.length === 0 && (external || !evidenceNotes.trim())) {
      return notifyWarning(external ? 'Adjunta el reporte o certificado del proveedor como evidencia.' : 'Adjunta una evidencia o describe la evidencia en las notas.');
    }
    if (hasNotOk && strict && !openTicket && !order.derived_ticket_id) return notifyWarning('Hay tareas no conformes en un activo crítico/alto: activa "Abrir solicitud correctiva".');
    onSubmit({
      completed_at: new Date(completedAt).toISOString(),
      performed_activities: activities.trim(),
      result: result.trim() || 'Conforme',
      findings: findings.trim() || null,
      supplier_id: supplierId ? Number(supplierId) : null,
      executed_by_employee_id: executedBy ? Number(executedBy) : null,
      downtime_minutes: downtime ? Number(downtime) : null,
      evidence_notes: evidenceNotes.trim() || null,
      checklist: checklist.map((row) => ({ plan_task_id: row.plan_task_id, task_text: row.task_text, result: row.result, notes: row.notes.trim() || null })),
      technician_signature: technicianSignature,
      responsible_signature: responsibleSignature,
      open_corrective_ticket: openTicket,
      corrective_title: ticketTitle.trim() || null,
      corrective_description: ticketDescription.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(11,34,53,0.5)] p-3 backdrop-blur-[2px]">
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Registrar ejecución · {KIND_LABELS[order.service_kind]}</p>
            <h3 className="text-lg font-bold text-[var(--color-brand-700)]">
              {order.order_code} · {order.asset?.asset_code} <span className="font-medium text-[var(--unilabor-ink)]">{order.asset?.name}</span>
            </h3>
            <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--unilabor-neutral)]">
              Programada {formatDateShort(order.scheduled_for)} · ventana {formatDateShort(order.window_starts_on)} → {formatDateShort(order.window_ends_on)} · {EXECUTOR_LABELS[order.executor_kind]}
              {order.asset?.criticality_code ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CRITICALITY_STYLES[order.asset.criticality_code] ?? ''}`}>{order.asset.criticality_name}</span> : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-4">
              {checklist.length > 0 ? (
                <section>
                  <h4 className="mb-2 text-sm font-bold text-[var(--color-brand-700)]">
                    Checklist {order.checklist_required ? <span className="text-[11px] font-semibold text-[#b02a2a]">(obligatorio)</span> : null}
                  </h4>
                  <ul className="space-y-2">
                    {checklist.map((row, index) => (
                      <li key={`${row.plan_task_id ?? 'x'}-${index}`} className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.9)] p-2.5">
                        <p className="text-sm font-semibold text-[var(--unilabor-ink)]">{row.task_text}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {RESULT_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            const active = row.result === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setRow(index, { result: option.value })}
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${active ? `${option.active} ring-1` : 'bg-white text-[var(--unilabor-neutral)] ring-1 ring-[rgba(0,65,106,0.12)] hover:bg-[rgba(191,212,230,0.25)]'}`}
                              >
                                <Icon size={12} /> {option.label}
                              </button>
                            );
                          })}
                          <input
                            value={row.notes}
                            onChange={(event) => setRow(index, { notes: event.target.value })}
                            placeholder="Observación"
                            className="h-7 min-w-[140px] flex-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-2 text-xs"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  Fecha y hora de ejecución
                  <input type="datetime-local" value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} className={inputClass} />
                </label>
                <label className={labelClass}>
                  Tiempo fuera de servicio (min)
                  <input type="number" min={0} value={downtime} onChange={(event) => setDowntime(event.target.value)} className={inputClass} placeholder="0" />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  Actividades realizadas
                  <textarea value={activities} onChange={(event) => setActivities(event.target.value)} rows={3} className={inputClass} placeholder="Qué se hizo, con qué y en qué condiciones quedó el equipo." />
                </label>
                <label className={labelClass}>
                  Resultado
                  <select value={result} onChange={(event) => setResult(event.target.value)} className={inputClass}>
                    <option value="Conforme">Conforme</option>
                    <option value="Conforme con observaciones">Conforme con observaciones</option>
                    <option value="No conforme">No conforme</option>
                  </select>
                </label>
                <label className={labelClass}>
                  {external ? 'Proveedor que realizó el servicio' : 'Realizado por'}
                  {external ? (
                    <div className="mt-1">
                      <SearchableSelect value={supplierId} options={supplierOptions} onChange={setSupplierId} placeholder="Proveedor" emptyLabel="Selecciona proveedor" />
                    </div>
                  ) : (
                    <div className="mt-1">
                      <SearchableSelect value={executedBy} options={employeeOptions} onChange={setExecutedBy} placeholder="Colaborador" emptyLabel="Quien ejecutó" />
                    </div>
                  )}
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  Hallazgos
                  <textarea value={findings} onChange={(event) => setFindings(event.target.value)} rows={2} className={inputClass} placeholder="Desgaste, piezas por reemplazar, condiciones anómalas..." />
                </label>
              </section>

              {hasNotOk || findings.trim() ? (
                <section className={`rounded-2xl border p-3 ${hasNotOk && strict ? 'border-[rgba(190,40,40,0.35)] bg-[rgba(254,202,202,0.25)]' : 'border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.9)]'}`}>
                  <label className="flex items-start gap-2 text-sm font-semibold text-[var(--unilabor-ink)]">
                    <input type="checkbox" checked={openTicket} onChange={(event) => setOpenTicket(event.target.checked)} className="mt-1" />
                    <span>
                      Abrir solicitud correctiva ligada a esta orden
                      {hasNotOk && strict ? (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#b02a2a]">
                          <AlertTriangle size={12} /> Obligatorio: hay tareas no conformes en un activo crítico/alto.
                        </span>
                      ) : null}
                    </span>
                  </label>
                  {openTicket ? (
                    <div className="mt-2 grid gap-2">
                      <input value={ticketTitle} onChange={(event) => setTicketTitle(event.target.value)} placeholder="Título del ticket (opcional)" className="h-9 rounded-xl border border-[rgba(0,65,106,0.14)] px-3 text-sm" />
                      <textarea value={ticketDescription} onChange={(event) => setTicketDescription(event.target.value)} rows={2} placeholder="Descripción (por defecto se usan los hallazgos)" className="rounded-xl border border-[rgba(0,65,106,0.14)] px-3 py-2 text-sm" />
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>

            <div className="space-y-4">
              <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.9)] p-3">
                <h4 className="flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
                  <Paperclip size={15} /> Evidencia {order.evidence_required ? <span className="text-[11px] font-semibold text-[#b02a2a]">({external ? 'documento obligatorio' : 'documento o nota'})</span> : null}
                </h4>
                {realEvidence.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {realEvidence.map((doc) => (
                      <li key={doc.id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 text-xs text-[var(--unilabor-ink)]">
                        <CheckCircle2 size={12} className="text-[#1c7a4a]" /> <span className="truncate">{doc.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">Sin documentos adjuntos todavía.</p>
                )}
                <div className="mt-2 grid gap-2">
                  <input type="file" accept="application/pdf,image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="text-xs" />
                  <input value={fileTitle} onChange={(event) => setFileTitle(event.target.value)} placeholder="Título (ej. Reporte del proveedor)" className="h-8 rounded-lg border border-[rgba(0,65,106,0.12)] px-2 text-xs" />
                  <button type="button" onClick={() => void upload()} disabled={!file || uploading} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-white text-xs font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)] disabled:opacity-50">
                    {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Adjuntar
                  </button>
                </div>
                <label className={`${labelClass} mt-2`}>
                  Notas de evidencia
                  <textarea value={evidenceNotes} onChange={(event) => setEvidenceNotes(event.target.value)} rows={2} className={inputClass} placeholder="Dónde están las fotos, número de reporte, etc." />
                </label>
              </section>

              <section className="space-y-3">
                <SignaturePad label="Firma de quien ejecutó" hint="Técnico, operador o proveedor" onChange={setTechnicianSignature} />
                <div>
                  <SignaturePad
                    label={`Firma del responsable del activo${order.requires_responsible_signature ? ' (obligatoria para cerrar)' : ' (opcional)'}`}
                    hint={order.asset?.responsible_employee_name ?? 'Responsable del activo'}
                    onChange={setResponsibleSignature}
                  />
                  {order.requires_responsible_signature ? (
                    <p className="mt-1 text-[11px] text-[var(--unilabor-neutral)]">
                      Si no se captura ahora, la orden quedará <strong>en validación</strong> hasta que el responsable firme desde el calendario.
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[rgba(0,65,106,0.08)] px-6 py-3">
          <p className="text-[11px] text-[var(--unilabor-neutral)]">Al cerrar se genera la constancia PDF y el evento en el expediente del activo (ISO 15189 6.4.7).</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.25)]">
              Cancelar
            </button>
            <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[var(--color-brand-600)] disabled:opacity-60">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Registrar ejecución
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
