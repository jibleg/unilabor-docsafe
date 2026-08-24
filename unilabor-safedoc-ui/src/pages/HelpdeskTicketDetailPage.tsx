import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Eye,
  FileSignature,
  FileUp,
  History,
  LifeBuoy,
  Loader2,
  MessageSquarePlus,
  ShieldCheck,
  UserCog,
  Wrench,
} from 'lucide-react';
import {
  addHelpdeskTicketComment,
  assignHelpdeskTicket,
  cancelHelpdeskTicket,
  changeHelpdeskTicketWorkingStatus,
  closeHelpdeskTicket,
  evaluateHelpdeskTicketIsoRisk,
  fetchHelpdeskTicketById,
  fetchTicketDocumentUrl,
  fetchTicketHistory,
  fetchTicketSignatureUrl,
  getApiErrorMessage,
  listEmployees,
  listHelpdeskCatalogs,
  listHelpdeskTicketCatalogs,
  listTicketDocuments,
  releaseHelpdeskTicketTechnically,
  solveHelpdeskTicket,
  uploadTicketDocument,
  validateHelpdeskTicketReturn,
  type HelpdeskTicketIsoRiskPayload,
  type HelpdeskTicketTechnicalReleasePayload,
} from '../api/service';
import { useAuthStore } from '../store/useAuthStore';
import type {
  Employee,
  HelpdeskCatalogItem,
  HelpdeskTicket,
  HelpdeskTicketCatalogs,
  HelpdeskTicketDocument,
  HelpdeskTicketHistoryEntry,
} from '../types/models';
import { getModuleRole } from '../utils/modules';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { hasAnyRole } from '../utils/roles';
import { SignaturePad } from '../components/helpdesk/SignaturePad';
import { SearchableSelect } from '../components/SearchableSelect';
import {
  EMPTY_CATALOGS,
  EMPTY_SOLUTION_FORM,
  EMPTY_RETURN_FORM,
  EMPTY_ISO_RISK_FORM,
  EMPTY_TECHNICAL_RELEASE_FORM,
  EMPTY_ASSIGN_FORM,
  EMPTY_CLOSE_FORM,
  EMPTY_CANCEL_FORM,
  REQUEST_CHANNEL_OPTIONS,
  SUPPORT_CHANNEL_OPTIONS,
  TICKET_WORKING_STATUS_TRANSITIONS,
  TICKET_TERMINAL_STATUS_CODES,
  numericOrNull,
  catalogName,
  statusName,
  priorityName,
  riskLabel,
  formatDateTime,
  formatDowntime,
  type SolutionFormState,
  type ReturnFormState,
  type IsoRiskFormState,
  type TechnicalReleaseFormState,
  type AssignFormState,
  type CloseFormState,
  type CancelFormState,
} from './HelpdeskTicketsPage.helpers';

const cardClass = 'rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white p-5 shadow-sm';
const fieldClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/95 px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]';
const primaryButtonClass =
  'inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50';

const employeeOptions = (employees: Employee[]) =>
  employees.map((employee) => ({ value: String(employee.id), label: employee.full_name, hint: employee.employee_code }));

interface TimelineStepProps {
  icon: typeof LifeBuoy;
  title: string;
  timestamp: string | null;
  done: boolean;
  children: React.ReactNode;
}

const TimelineStep = ({ icon: Icon, title, timestamp, done, children }: TimelineStepProps) => (
  <li className="relative pb-2">
    <span
      className={`absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full ${
        done ? 'bg-[var(--color-brand-700)] text-white' : 'border-2 border-[rgba(0,65,106,0.22)] bg-white text-[var(--unilabor-neutral)]'
      }`}
    >
      <Icon size={13} />
    </span>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className={`text-sm font-bold ${done ? 'text-[var(--color-brand-700)]' : 'text-[var(--unilabor-ink)]'}`}>{title}</h3>
      {timestamp ? <span className="text-xs text-[var(--unilabor-neutral)]">{timestamp}</span> : null}
    </div>
    <div className="mt-2 space-y-2">{children}</div>
  </li>
);

export const HelpdeskTicketDetailPage = () => {
  const { id } = useParams();
  const ticketId = Number(id);
  const navigate = useNavigate();

  const availableModules = useAuthStore((state) => state.availableModules);
  const moduleRole = getModuleRole(availableModules, 'HELPDESK') ?? 'VIEWER';
  const canManage = hasAnyRole(moduleRole, ['ADMIN', 'EDITOR']);

  const [ticket, setTicket] = useState<HelpdeskTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogs, setCatalogs] = useState<HelpdeskTicketCatalogs>(EMPTY_CATALOGS);
  const [operationalStatuses, setOperationalStatuses] = useState<HelpdeskCatalogItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [assignForm, setAssignForm] = useState<AssignFormState>(EMPTY_ASSIGN_FORM);
  const [solutionForm, setSolutionForm] = useState<SolutionFormState>(EMPTY_SOLUTION_FORM);
  const [returnForm, setReturnForm] = useState<ReturnFormState>(EMPTY_RETURN_FORM);
  const [isoRiskForm, setIsoRiskForm] = useState<IsoRiskFormState>(EMPTY_ISO_RISK_FORM);
  const [technicalReleaseForm, setTechnicalReleaseForm] = useState<TechnicalReleaseFormState>(EMPTY_TECHNICAL_RELEASE_FORM);
  const [closeForm, setCloseForm] = useState<CloseFormState>(EMPTY_CLOSE_FORM);
  const [cancelForm, setCancelForm] = useState<CancelFormState>(EMPTY_CANCEL_FORM);
  const [showCancelForm, setShowCancelForm] = useState(false);

  const [savingAssign, setSavingAssign] = useState(false);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [savingSolution, setSavingSolution] = useState(false);
  const [savingIsoRisk, setSavingIsoRisk] = useState(false);
  const [savingTechnicalRelease, setSavingTechnicalRelease] = useState(false);
  const [savingReturn, setSavingReturn] = useState(false);
  const [savingClose, setSavingClose] = useState(false);
  const [savingCancel, setSavingCancel] = useState(false);

  const [comment, setComment] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const [savingComment, setSavingComment] = useState(false);

  const [signatureUrls, setSignatureUrls] = useState<{ requester: string | null; closer: string | null }>({
    requester: null,
    closer: null,
  });
  const [ticketDocuments, setTicketDocuments] = useState<HelpdeskTicketDocument[]>([]);
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [savingDocument, setSavingDocument] = useState(false);

  const [ticketHistory, setTicketHistory] = useState<HelpdeskTicketHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadTicket = useCallback(async () => {
    if (!ticketId) {
      return;
    }
    setLoading(true);
    try {
      setTicket(await fetchHelpdeskTicketById(ticketId));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la solicitud.'));
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void loadTicket();
  }, [loadTicket]);

  useEffect(() => {
    void (async () => {
      try {
        const [ticketCatalogData, assetCatalogData, employeeData] = await Promise.all([
          listHelpdeskTicketCatalogs(),
          listHelpdeskCatalogs(),
          listEmployees(),
        ]);
        setCatalogs(ticketCatalogData);
        setOperationalStatuses(assetCatalogData.operational_statuses);
        setEmployees(employeeData);
      } catch (error) {
        notifyError(getApiErrorMessage(error, 'No se pudieron cargar los catálogos de solicitudes.'));
      }
    })();
  }, []);

  useEffect(() => {
    if (!ticket) {
      setIsoRiskForm(EMPTY_ISO_RISK_FORM);
      setAssignForm(EMPTY_ASSIGN_FORM);
      setCloseForm(EMPTY_CLOSE_FORM);
      setCancelForm(EMPTY_CANCEL_FORM);
      return;
    }

    setAssignForm({ assigned_employee_id: ticket.assigned_employee_id ? String(ticket.assigned_employee_id) : '' });
    setCloseForm(EMPTY_CLOSE_FORM);
    setCancelForm(EMPTY_CANCEL_FORM);
    setIsoRiskForm({
      risk_level: ticket.risk_level && ticket.risk_level !== 'NOT_EVALUATED' ? ticket.risk_level : 'LOW',
      impact_evaluation: ticket.impact_evaluation ?? '',
      recent_analysis_usage: ticket.recent_analysis_usage ?? '',
      alternate_equipment_used: Boolean(ticket.alternate_equipment_used),
      alternate_equipment_notes: ticket.alternate_equipment_notes ?? '',
      corrective_action_required: Boolean(ticket.corrective_action_required),
      corrective_action_notes: ticket.corrective_action_notes ?? '',
      technical_release_required: Boolean(ticket.technical_release_required),
      operational_lock: Boolean(ticket.operational_lock),
    });
  }, [ticket]);

  const loadTicketSignatures = useCallback(async (id2: number) => {
    let requesterUrl: string | null = null;
    try {
      requesterUrl = await fetchTicketSignatureUrl(id2, 'requester');
    } catch {
      // Sin firma del solicitante todavia.
    }
    let closerUrl: string | null = null;
    try {
      closerUrl = await fetchTicketSignatureUrl(id2, 'closer');
    } catch {
      // Sin firma de cierre todavia.
    }
    setSignatureUrls((current) => {
      if (current.requester) URL.revokeObjectURL(current.requester);
      if (current.closer) URL.revokeObjectURL(current.closer);
      return { requester: requesterUrl, closer: closerUrl };
    });
  }, []);

  useEffect(() => {
    if (!ticketId) {
      return;
    }
    void loadTicketSignatures(ticketId);
  }, [ticketId, loadTicketSignatures]);

  const loadTicketDocuments = useCallback(async (id2: number) => {
    try {
      setTicketDocuments(await listTicketDocuments(id2));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar las evidencias de la solicitud.'));
    }
  }, []);

  useEffect(() => {
    if (!ticketId) {
      return;
    }
    void loadTicketDocuments(ticketId);
  }, [ticketId, loadTicketDocuments]);

  const handleToggleHistory = async () => {
    if (!ticket) {
      return;
    }
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    try {
      setTicketHistory(await fetchTicketHistory(ticket.id));
      setShowHistory(true);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el historial de la solicitud.'));
    }
  };

  const handleUploadDocument = async () => {
    if (!ticket) return;
    if (!documentFile) {
      notifyWarning('Selecciona el archivo de evidencia (PDF o imagen).');
      return;
    }
    if (!documentTitle.trim()) {
      notifyWarning('Captura un título para la evidencia.');
      return;
    }
    setSavingDocument(true);
    try {
      await uploadTicketDocument(ticket.id, documentFile, { title: documentTitle.trim() });
      setDocumentTitle('');
      setDocumentFile(null);
      notifySuccess('Evidencia cargada correctamente.');
      await loadTicketDocuments(ticket.id);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la evidencia.'));
    } finally {
      setSavingDocument(false);
    }
  };

  const handleViewDocument = async (documentId: number) => {
    try {
      const url = await fetchTicketDocumentUrl(documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir la evidencia.'));
    }
  };

  const handleAddComment = async () => {
    if (!ticket || !comment.trim()) {
      notifyWarning('Escribe un comentario para agregarlo al seguimiento.');
      return;
    }
    setSavingComment(true);
    try {
      const updated = await addHelpdeskTicketComment(ticket.id, comment.trim(), commentInternal);
      setTicket(updated ?? ticket);
      setComment('');
      setCommentInternal(false);
      notifySuccess('Comentario agregado correctamente.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo agregar el comentario.'));
    } finally {
      setSavingComment(false);
    }
  };

  const handleAssignTicket = async () => {
    if (!ticket) return;
    const assignedEmployeeId = numericOrNull(assignForm.assigned_employee_id);
    if (!assignedEmployeeId) {
      notifyWarning('Selecciona el responsable a asignar.');
      return;
    }
    setSavingAssign(true);
    try {
      const updated = await assignHelpdeskTicket(ticket.id, { assigned_employee_id: assignedEmployeeId });
      setTicket(updated ?? ticket);
      notifySuccess('Responsable asignado correctamente.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo asignar el responsable.'));
    } finally {
      setSavingAssign(false);
    }
  };

  const handleChangeWorkingStatus = async (statusCode: string) => {
    if (!ticket) return;
    setSavingStatus(statusCode);
    try {
      const updated = await changeHelpdeskTicketWorkingStatus(ticket.id, { status_code: statusCode });
      setTicket(updated ?? ticket);
      notifySuccess('Estado del ticket actualizado correctamente.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo actualizar el estado del ticket.'));
    } finally {
      setSavingStatus(null);
    }
  };

  const handleSolveTicket = async () => {
    if (!ticket) return;
    if (!solutionForm.solved_at || !solutionForm.solution_summary.trim()) {
      notifyWarning('Captura la fecha de solución y el resumen técnico.');
      return;
    }
    if (solutionForm.support_channel === 'REMOTE_PHONE') {
      const hasCompleteCallLog =
        solutionForm.provider_name.trim() &&
        solutionForm.provider_contact.trim() &&
        solutionForm.onsite_responsible_employee_id &&
        solutionForm.call_at;
      if (!hasCompleteCallLog) {
        notifyWarning(
          'Si la atención fue por llamada telefónica captura proveedor, contacto, responsable técnico in situ y fecha/hora de la llamada: sustituyen la evidencia documental.',
        );
        return;
      }
    }
    setSavingSolution(true);
    try {
      const updated = await solveHelpdeskTicket(ticket.id, {
        solved_at: solutionForm.solved_at,
        solution_summary: solutionForm.solution_summary.trim(),
        equipment_status_after_solution_id: numericOrNull(solutionForm.equipment_status_after_solution_id),
        support_channel: solutionForm.support_channel || null,
        provider_name: solutionForm.support_channel === 'REMOTE_PHONE' ? solutionForm.provider_name.trim() || null : null,
        provider_contact:
          solutionForm.support_channel === 'REMOTE_PHONE' ? solutionForm.provider_contact.trim() || null : null,
        onsite_responsible_employee_id:
          solutionForm.support_channel === 'REMOTE_PHONE'
            ? numericOrNull(solutionForm.onsite_responsible_employee_id)
            : null,
        call_at: solutionForm.support_channel === 'REMOTE_PHONE' ? solutionForm.call_at || null : null,
      });
      setTicket(updated ?? ticket);
      setSolutionForm(EMPTY_SOLUTION_FORM);
      notifySuccess('Solución técnica registrada correctamente.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo registrar la solución técnica.'));
    } finally {
      setSavingSolution(false);
    }
  };

  const handleEvaluateIsoRisk = async () => {
    if (!ticket) return;
    if (!isoRiskForm.impact_evaluation.trim()) {
      notifyWarning('Captura la evaluación de impacto ISO/riesgo.');
      return;
    }
    const payload: HelpdeskTicketIsoRiskPayload = {
      risk_level: isoRiskForm.risk_level,
      impact_evaluation: isoRiskForm.impact_evaluation.trim(),
      recent_analysis_usage: isoRiskForm.recent_analysis_usage.trim() || null,
      alternate_equipment_used: isoRiskForm.alternate_equipment_used,
      alternate_equipment_notes: isoRiskForm.alternate_equipment_notes.trim() || null,
      corrective_action_required: isoRiskForm.corrective_action_required,
      corrective_action_notes: isoRiskForm.corrective_action_notes.trim() || null,
      technical_release_required: isoRiskForm.technical_release_required,
      operational_lock: isoRiskForm.operational_lock,
    };
    setSavingIsoRisk(true);
    try {
      const updated = await evaluateHelpdeskTicketIsoRisk(ticket.id, payload);
      setTicket(updated ?? ticket);
      notifySuccess('Evaluación ISO/riesgo registrada correctamente.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo registrar la evaluación ISO/riesgo.'));
    } finally {
      setSavingIsoRisk(false);
    }
  };

  const handleTechnicalRelease = async () => {
    if (!ticket) return;
    if (!technicalReleaseForm.technical_release_summary.trim()) {
      notifyWarning('Captura el resumen de liberación técnica.');
      return;
    }
    const payload: HelpdeskTicketTechnicalReleasePayload = {
      technical_release_summary: technicalReleaseForm.technical_release_summary.trim(),
      equipment_status_after_solution_id: numericOrNull(technicalReleaseForm.equipment_status_after_solution_id),
    };
    setSavingTechnicalRelease(true);
    try {
      const updated = await releaseHelpdeskTicketTechnically(ticket.id, payload);
      setTicket(updated ?? ticket);
      setTechnicalReleaseForm(EMPTY_TECHNICAL_RELEASE_FORM);
      notifySuccess('Liberación técnica documentada correctamente.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo documentar la liberación técnica.'));
    } finally {
      setSavingTechnicalRelease(false);
    }
  };

  const handleValidateReturn = async () => {
    if (!ticket) return;
    if (!returnForm.return_to_operation_at) {
      notifyWarning('Captura la fecha de retorno a operación.');
      return;
    }
    setSavingReturn(true);
    try {
      const updated = await validateHelpdeskTicketReturn(ticket.id, {
        return_to_operation_at: returnForm.return_to_operation_at,
        equipment_status_after_solution_id: numericOrNull(returnForm.equipment_status_after_solution_id),
      });
      setTicket(updated ?? ticket);
      setReturnForm(EMPTY_RETURN_FORM);
      notifySuccess('Retorno a operación validado correctamente.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo validar el retorno a operación.'));
    } finally {
      setSavingReturn(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!ticket) return;
    if (!closeForm.closure_notes.trim()) {
      notifyWarning('Captura las notas de cierre.');
      return;
    }
    if (!closeForm.closer_signature) {
      notifyWarning('Firma el cierre del ticket antes de continuar.');
      return;
    }
    setSavingClose(true);
    try {
      const updated = await closeHelpdeskTicket(ticket.id, {
        closure_notes: closeForm.closure_notes.trim(),
        closer_signature: closeForm.closer_signature,
      });
      setTicket(updated ?? ticket);
      setCloseForm(EMPTY_CLOSE_FORM);
      notifySuccess('Ticket cerrado correctamente.');
      await loadTicketDocuments(ticket.id);
      await loadTicketSignatures(ticket.id);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cerrar el ticket.'));
    } finally {
      setSavingClose(false);
    }
  };

  const handleCancelTicket = async () => {
    if (!ticket) return;
    if (!cancelForm.cancellation_reason.trim()) {
      notifyWarning('Captura el motivo de cancelación.');
      return;
    }
    setSavingCancel(true);
    try {
      const updated = await cancelHelpdeskTicket(ticket.id, { cancellation_reason: cancelForm.cancellation_reason.trim() });
      setTicket(updated ?? ticket);
      setCancelForm(EMPTY_CANCEL_FORM);
      setShowCancelForm(false);
      notifySuccess('Ticket cancelado correctamente.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cancelar el ticket.'));
    } finally {
      setSavingCancel(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-[var(--color-brand-700)]">
        <Loader2 className="animate-spin" /> <span className="ml-2">Cargando solicitud...</span>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6">
        <button onClick={() => navigate('/helpdesk/tickets')} className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-brand-700)]">
          <ArrowLeft size={16} /> Volver a solicitudes
        </button>
        <p className="text-sm text-[var(--unilabor-neutral)]">No se encontró la solicitud.</p>
      </div>
    );
  }

  const isTerminal = Boolean(ticket.status?.code && TICKET_TERMINAL_STATUS_CODES.includes(ticket.status.code));
  const isCancelled = ticket.status?.code === 'CANCELLED' || Boolean(ticket.cancelled_at);
  const constanciaDoc = ticketDocuments.find((doc) => doc.title.startsWith('Constancia de atención'));
  const workingTransitions = ticket.status?.code ? TICKET_WORKING_STATUS_TRANSITIONS[ticket.status.code] ?? [] : [];

  return (
    <div className="space-y-5 p-1">
      <button onClick={() => navigate('/helpdesk/tickets')} className="inline-flex items-center gap-1 text-sm text-[var(--color-brand-700)]">
        <ArrowLeft size={16} /> Volver a solicitudes
      </button>

      {/* Encabezado */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Línea de tiempo de atención — {ticket.ticket_code}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--color-brand-700)]">{ticket.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[rgba(191,212,230,0.4)] px-3 py-1 text-xs font-bold text-[var(--color-brand-700)]">
              {statusName(ticket.status)}
            </span>
            <span className="rounded-full bg-[rgba(0,65,106,0.08)] px-3 py-1 text-xs font-bold text-[var(--unilabor-ink)]">
              {priorityName(ticket.priority)}
            </span>
            {canManage && !isTerminal ? (
              <button
                type="button"
                onClick={() => setShowCancelForm((current) => !current)}
                className="inline-flex items-center gap-1 rounded-full border border-[rgba(217,80,80,0.3)] bg-[rgba(217,80,80,0.08)] px-3 py-1 text-xs font-bold text-[rgb(163,45,45)] transition hover:bg-[rgba(217,80,80,0.16)]"
              >
                <Ban size={12} /> Cancelar solicitud
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-[var(--unilabor-neutral)]">Activo</p>
            <p className="text-sm font-semibold text-[var(--unilabor-ink)]">
              {ticket.asset ? `${ticket.asset.asset_code} · ${ticket.asset.name}` : 'Solicitud general'}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--unilabor-neutral)]">Solicita</p>
            <p className="text-sm font-semibold text-[var(--unilabor-ink)]">{ticket.requester_employee?.full_name ?? 'Sin solicitante'}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--unilabor-neutral)]">Canal de solicitud</p>
            <p className="text-sm font-semibold text-[var(--unilabor-ink)]">
              {REQUEST_CHANNEL_OPTIONS.find((option) => option.value === ticket.request_channel)?.label ?? 'Portal de autoservicio'}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--unilabor-neutral)]">Fecha compromiso</p>
            <p className="text-sm font-semibold text-[var(--unilabor-ink)]">{ticket.due_at ? formatDateTime(ticket.due_at) : 'Sin definir'}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Descripción</p>
          <p className="mt-1 leading-6 text-[var(--unilabor-ink)]">{ticket.description}</p>
          {ticket.operational_impact ? (
            <>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Impacto operativo</p>
              <p className="mt-1 leading-6 text-[var(--unilabor-ink)]">{ticket.operational_impact}</p>
            </>
          ) : null}
        </div>

        {canManage && showCancelForm ? (
          <div className="mt-4 grid gap-2 rounded-xl border border-[rgba(217,80,80,0.25)] bg-[rgba(217,80,80,0.05)] p-3">
            <textarea
              value={cancelForm.cancellation_reason}
              onChange={(event) => setCancelForm({ cancellation_reason: event.target.value })}
              rows={2}
              placeholder="Motivo de cancelación (obligatorio)..."
              className={fieldClass}
            />
            <button
              type="button"
              onClick={() => void handleCancelTicket()}
              disabled={savingCancel}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(217,80,80,0.3)] bg-[rgba(217,80,80,0.1)] px-3 py-2 text-sm font-semibold text-[rgb(163,45,45)] transition hover:bg-[rgba(217,80,80,0.18)] disabled:opacity-50"
            >
              {savingCancel ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
              Confirmar cancelación
            </button>
          </div>
        ) : null}
      </div>

      {/* Linea de tiempo */}
      <div className={cardClass}>
        <h2 className="mb-4 text-lg font-bold text-[var(--color-brand-700)]">Línea de tiempo</h2>
        <ol className="relative space-y-6 border-l-2 border-[rgba(0,65,106,0.12)] pl-6">
          {/* 1. Creado */}
          <TimelineStep icon={LifeBuoy} title="Creado" timestamp={formatDateTime(ticket.reported_at)} done>
            <p className="text-sm text-[var(--unilabor-ink)]">
              {catalogName(ticket.request_type)} · Prioridad {priorityName(ticket.priority)}
            </p>
          </TimelineStep>

          {/* 2. Asignación y seguimiento */}
          <TimelineStep
            icon={UserCog}
            title="Asignación y seguimiento"
            timestamp={ticket.assigned_employee ? null : 'Pendiente'}
            done={Boolean(ticket.assigned_employee_id)}
          >
            <p className="text-sm text-[var(--unilabor-ink)]">
              Responsable: <span className="font-semibold">{ticket.assigned_employee?.full_name ?? 'Sin asignar'}</span>
            </p>
            {canManage && !isTerminal ? (
              <div className="grid gap-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.72)] p-3">
                <SearchableSelect
                  value={assignForm.assigned_employee_id}
                  onChange={(value) => setAssignForm({ assigned_employee_id: value })}
                  options={employeeOptions(employees)}
                  placeholder="Selecciona responsable"
                  emptyLabel="Sin responsable"
                  searchPlaceholder="Buscar responsable por nombre o código..."
                />
                <button type="button" onClick={() => void handleAssignTicket()} disabled={savingAssign} className={primaryButtonClass}>
                  {savingAssign ? <Loader2 size={14} className="animate-spin" /> : <UserCog size={14} />}
                  Asignar responsable
                </button>
                {workingTransitions.length > 0 ? (
                  <div className="flex flex-wrap gap-2 border-t border-[rgba(0,65,106,0.08)] pt-2">
                    {workingTransitions.map((targetCode) => {
                      const targetLabel = catalogs.ticket_statuses.find((status) => status.code === targetCode)?.name ?? targetCode;
                      return (
                        <button
                          key={targetCode}
                          type="button"
                          onClick={() => void handleChangeWorkingStatus(targetCode)}
                          disabled={savingStatus !== null}
                          className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-white/90 px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
                        >
                          {savingStatus === targetCode ? <Loader2 size={12} className="animate-spin" /> : null}
                          Mover a {targetLabel}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </TimelineStep>

          {/* 3. Resuelto */}
          <TimelineStep
            icon={Wrench}
            title="Resuelto"
            timestamp={ticket.solved_at ? formatDateTime(ticket.solved_at) : 'Pendiente'}
            done={Boolean(ticket.solved_at)}
          >
            {ticket.solution_summary ? <p className="text-sm leading-6 text-[var(--unilabor-ink)]">{ticket.solution_summary}</p> : null}
            {ticket.support_channel === 'REMOTE_PHONE' ? (
              <div className="rounded-xl border border-dashed border-[rgba(0,65,106,0.18)] bg-[rgba(248,251,253,0.6)] p-2.5 text-xs leading-5 text-[var(--unilabor-ink)]">
                <p className="font-semibold text-[var(--unilabor-neutral)]">Bitácora de llamada (soporte telefónico, sin evidencia documental)</p>
                <p className="mt-1">
                  Proveedor: {ticket.provider_name ?? 'Sin registrar'} · Contacto: {ticket.provider_contact ?? 'Sin registrar'}
                </p>
                <p>Responsable in situ: {ticket.onsite_responsible_employee?.full_name ?? 'Sin registrar'}</p>
                <p>Llamada: {ticket.call_at ? formatDateTime(ticket.call_at) : 'Sin registrar'}</p>
              </div>
            ) : null}

            {canManage && !ticket.solved_at ? (
              <div className="grid gap-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.72)] p-3">
                <input
                  type="datetime-local"
                  value={solutionForm.solved_at}
                  onChange={(event) => setSolutionForm((current) => ({ ...current, solved_at: event.target.value }))}
                  className={fieldClass}
                />
                <textarea
                  value={solutionForm.solution_summary}
                  onChange={(event) => setSolutionForm((current) => ({ ...current, solution_summary: event.target.value }))}
                  rows={3}
                  placeholder="Resumen técnico de la solución..."
                  className={fieldClass}
                />
                <select
                  value={solutionForm.equipment_status_after_solution_id}
                  onChange={(event) =>
                    setSolutionForm((current) => ({ ...current, equipment_status_after_solution_id: event.target.value }))
                  }
                  className={fieldClass}
                >
                  <option value="">Estado posterior del equipo</option>
                  {operationalStatuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
                <select
                  value={solutionForm.support_channel}
                  onChange={(event) => setSolutionForm((current) => ({ ...current, support_channel: event.target.value }))}
                  className={fieldClass}
                >
                  {SUPPORT_CHANNEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {solutionForm.support_channel === 'REMOTE_PHONE' ? (
                  <div className="grid gap-2 rounded-xl border border-dashed border-[rgba(0,65,106,0.18)] bg-[rgba(248,251,253,0.6)] p-2.5">
                    <p className="text-[11px] leading-5 text-[var(--unilabor-neutral)]">
                      Sin documento de evidencia posible (soporte telefónico): estos datos sustituyen la evidencia.
                    </p>
                    <input
                      value={solutionForm.provider_name}
                      onChange={(event) => setSolutionForm((current) => ({ ...current, provider_name: event.target.value }))}
                      placeholder="Proveedor que brindó asistencia"
                      className={fieldClass}
                    />
                    <input
                      value={solutionForm.provider_contact}
                      onChange={(event) => setSolutionForm((current) => ({ ...current, provider_contact: event.target.value }))}
                      placeholder="Contacto del proveedor (nombre/teléfono)"
                      className={fieldClass}
                    />
                    <SearchableSelect
                      value={solutionForm.onsite_responsible_employee_id}
                      onChange={(value) => setSolutionForm((current) => ({ ...current, onsite_responsible_employee_id: value }))}
                      options={employeeOptions(employees)}
                      placeholder="Responsable técnico in situ"
                      emptyLabel="Sin seleccionar"
                      searchPlaceholder="Buscar responsable por nombre o código..."
                    />
                    <input
                      type="datetime-local"
                      value={solutionForm.call_at}
                      onChange={(event) => setSolutionForm((current) => ({ ...current, call_at: event.target.value }))}
                      className={fieldClass}
                    />
                  </div>
                ) : null}
                <button type="button" onClick={() => void handleSolveTicket()} disabled={savingSolution} className={primaryButtonClass}>
                  {savingSolution ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
                  Registrar solución
                </button>
              </div>
            ) : null}

            {/* Evidencia de la intervencion */}
            <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Evidencia de la intervención</p>
              {ticketDocuments.length === 0 ? (
                <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">Sin evidencia documental adjunta.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {ticketDocuments.map((document) => (
                    <li key={document.id} className="flex items-center justify-between gap-2 rounded-lg border border-[rgba(0,65,106,0.08)] bg-white/80 px-2.5 py-1.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-[var(--color-brand-700)]">{document.title}</p>
                        <p className="text-[10px] text-[var(--unilabor-neutral)]">
                          {formatDateTime(document.created_at)} · {document.uploaded_by_name ?? 'Usuario'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleViewDocument(document.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                      >
                        <Eye size={12} /> Ver
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {canManage && !isTerminal ? (
                <div className="mt-3 grid gap-2 border-t border-[rgba(0,65,106,0.08)] pt-2">
                  <input
                    value={documentTitle}
                    onChange={(event) => setDocumentTitle(event.target.value)}
                    placeholder="Título de la evidencia (ej. foto de la falla, reporte del proveedor)"
                    className={fieldClass}
                  />
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                    className="w-full text-xs text-[var(--unilabor-neutral)] file:mr-2 file:rounded-lg file:border-0 file:bg-[rgba(191,212,230,0.4)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--color-brand-700)]"
                  />
                  <button type="button" onClick={() => void handleUploadDocument()} disabled={savingDocument} className={primaryButtonClass}>
                    {savingDocument ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                    Adjuntar evidencia
                  </button>
                </div>
              ) : null}
            </div>

            {/* Evaluacion ISO / liberacion tecnica */}
            {canManage ? (
              <details className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.72)] p-3 text-sm">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Evaluación ISO 15189 / liberación técnica {ticket.risk_level && ticket.risk_level !== 'NOT_EVALUATED' ? `(${riskLabel(ticket.risk_level)})` : ''}
                </summary>
                <div className="mt-3 grid gap-2">
                  <select
                    value={isoRiskForm.risk_level}
                    onChange={(event) => setIsoRiskForm((current) => ({ ...current, risk_level: event.target.value }))}
                    className={fieldClass}
                  >
                    <option value="LOW">Riesgo bajo</option>
                    <option value="MEDIUM">Riesgo medio</option>
                    <option value="HIGH">Riesgo alto</option>
                    <option value="CRITICAL">Riesgo crítico</option>
                  </select>
                  <textarea
                    value={isoRiskForm.impact_evaluation}
                    onChange={(event) => setIsoRiskForm((current) => ({ ...current, impact_evaluation: event.target.value }))}
                    rows={3}
                    placeholder="Evaluación de impacto sobre operación, resultados y continuidad..."
                    className={fieldClass}
                  />
                  <textarea
                    value={isoRiskForm.recent_analysis_usage}
                    onChange={(event) => setIsoRiskForm((current) => ({ ...current, recent_analysis_usage: event.target.value }))}
                    rows={2}
                    placeholder="Uso en análisis recientes o lotes potencialmente afectados..."
                    className={fieldClass}
                  />
                  <label className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-white/80 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isoRiskForm.alternate_equipment_used}
                      onChange={(event) => setIsoRiskForm((current) => ({ ...current, alternate_equipment_used: event.target.checked }))}
                      className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] text-[var(--color-brand-500)]"
                    />
                    <span className="text-sm font-semibold text-[var(--color-brand-700)]">Se usó equipo alterno</span>
                  </label>
                  {isoRiskForm.alternate_equipment_used ? (
                    <input
                      value={isoRiskForm.alternate_equipment_notes}
                      onChange={(event) => setIsoRiskForm((current) => ({ ...current, alternate_equipment_notes: event.target.value }))}
                      placeholder="Equipo alterno y condiciones de uso"
                      className={fieldClass}
                    />
                  ) : null}
                  <label className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-white/80 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isoRiskForm.corrective_action_required}
                      onChange={(event) => setIsoRiskForm((current) => ({ ...current, corrective_action_required: event.target.checked }))}
                      className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] text-[var(--color-brand-500)]"
                    />
                    <span className="text-sm font-semibold text-[var(--color-brand-700)]">Requiere acción correctiva</span>
                  </label>
                  {isoRiskForm.corrective_action_required ? (
                    <input
                      value={isoRiskForm.corrective_action_notes}
                      onChange={(event) => setIsoRiskForm((current) => ({ ...current, corrective_action_notes: event.target.value }))}
                      placeholder="Motivo o referencia de acción correctiva"
                      className={fieldClass}
                    />
                  ) : null}
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <label className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-white/80 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isoRiskForm.technical_release_required}
                        onChange={(event) => setIsoRiskForm((current) => ({ ...current, technical_release_required: event.target.checked }))}
                        className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] text-[var(--color-brand-500)]"
                      />
                      <span className="text-sm font-semibold text-[var(--color-brand-700)]">Requiere liberación</span>
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-white/80 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isoRiskForm.operational_lock}
                        onChange={(event) => setIsoRiskForm((current) => ({ ...current, operational_lock: event.target.checked }))}
                        className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] text-[var(--color-brand-500)]"
                      />
                      <span className="text-sm font-semibold text-[var(--color-brand-700)]">Bloquear uso</span>
                    </label>
                  </div>
                  <button type="button" onClick={() => void handleEvaluateIsoRisk()} disabled={savingIsoRisk} className={primaryButtonClass}>
                    {savingIsoRisk ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    Guardar evaluación ISO
                  </button>

                  {ticket.technical_release_summary ? (
                    <p className="mt-2 rounded-lg border border-[rgba(0,65,106,0.08)] bg-white/80 px-3 py-2 text-xs leading-5 text-[var(--unilabor-ink)]">
                      <span className="font-semibold text-[var(--unilabor-neutral)]">Liberación técnica registrada: </span>
                      {ticket.technical_release_summary}
                    </p>
                  ) : null}
                  <textarea
                    value={technicalReleaseForm.technical_release_summary}
                    onChange={(event) => setTechnicalReleaseForm((current) => ({ ...current, technical_release_summary: event.target.value }))}
                    rows={3}
                    placeholder="Liberación técnica: verificación, criterios cumplidos y decisión..."
                    className={fieldClass}
                  />
                  <select
                    value={technicalReleaseForm.equipment_status_after_solution_id}
                    onChange={(event) =>
                      setTechnicalReleaseForm((current) => ({ ...current, equipment_status_after_solution_id: event.target.value }))
                    }
                    className={fieldClass}
                  >
                    <option value="">Estado liberado del equipo</option>
                    {operationalStatuses.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleTechnicalRelease()}
                    disabled={savingTechnicalRelease}
                    className={primaryButtonClass}
                  >
                    {savingTechnicalRelease ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    Documentar liberación
                  </button>
                </div>
              </details>
            ) : null}
          </TimelineStep>

          {/* 4. Retorno validado */}
          <TimelineStep
            icon={CheckCircle2}
            title="Retorno a operación validado"
            timestamp={ticket.validated_at ? formatDateTime(ticket.validated_at) : 'Pendiente'}
            done={Boolean(ticket.validated_at)}
          >
            {ticket.validated_at ? (
              <p className="text-sm text-[var(--unilabor-ink)]">
                Tiempo fuera de servicio: {formatDowntime(ticket.downtime_minutes)} · Estado posterior:{' '}
                {catalogName(ticket.equipment_status_after_solution)}
              </p>
            ) : null}
            {canManage && ticket.solved_at && !ticket.validated_at ? (
              <div className="grid gap-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.72)] p-3">
                <input
                  type="datetime-local"
                  value={returnForm.return_to_operation_at}
                  onChange={(event) => setReturnForm((current) => ({ ...current, return_to_operation_at: event.target.value }))}
                  className={fieldClass}
                />
                <select
                  value={returnForm.equipment_status_after_solution_id}
                  onChange={(event) => setReturnForm((current) => ({ ...current, equipment_status_after_solution_id: event.target.value }))}
                  className={fieldClass}
                >
                  <option value="">Estado validado del equipo</option>
                  {operationalStatuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => void handleValidateReturn()} disabled={savingReturn} className={primaryButtonClass}>
                  {savingReturn ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Validar retorno
                </button>
              </div>
            ) : null}
          </TimelineStep>

          {/* 5. Confirmacion del solicitante */}
          <TimelineStep icon={FileSignature} title="Confirmación del solicitante" timestamp={signatureUrls.requester ? null : 'Pendiente'} done={Boolean(signatureUrls.requester)}>
            {signatureUrls.requester ? (
              <div className="flex h-20 w-40 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] bg-white">
                <img src={signatureUrls.requester} alt="Firma del solicitante" className="max-h-16 max-w-full" />
              </div>
            ) : (
              <p className="text-xs text-[var(--unilabor-neutral)]">
                El solicitante confirma y firma desde su portal de autoservicio una vez resuelto el ticket.
              </p>
            )}
          </TimelineStep>

          {/* 6. Cierre / Cancelacion */}
          {isCancelled ? (
            <TimelineStep icon={Ban} title="Cancelado" timestamp={ticket.cancelled_at ? formatDateTime(ticket.cancelled_at) : null} done>
              {ticket.cancellation_reason ? <p className="text-sm text-[var(--unilabor-ink)]">{ticket.cancellation_reason}</p> : null}
            </TimelineStep>
          ) : (
            <TimelineStep icon={ShieldCheck} title="Cerrado" timestamp={ticket.closed_at ? formatDateTime(ticket.closed_at) : 'Pendiente'} done={Boolean(ticket.closed_at)}>
              {ticket.closure_notes ? <p className="text-sm text-[var(--unilabor-ink)]">{ticket.closure_notes}</p> : null}
              {signatureUrls.closer ? (
                <div className="flex h-20 w-40 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] bg-white">
                  <img src={signatureUrls.closer} alt="Firma de cierre" className="max-h-16 max-w-full" />
                </div>
              ) : null}
              {constanciaDoc ? (
                <button
                  type="button"
                  onClick={() => void handleViewDocument(constanciaDoc.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-700)] hover:underline"
                >
                  <Eye size={12} /> Ver constancia de atención
                </button>
              ) : null}

              {canManage && ticket.validated_at && !ticket.closed_at ? (
                <div className="grid gap-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.72)] p-3">
                  <textarea
                    value={closeForm.closure_notes}
                    onChange={(event) => setCloseForm((current) => ({ ...current, closure_notes: event.target.value }))}
                    rows={2}
                    placeholder="Notas de cierre (obligatorias para cerrar)..."
                    className={fieldClass}
                  />
                  <SignaturePad
                    label="Firma de quien cierra"
                    hint="Firma la persona responsable que da por cerrado el ticket."
                    onChange={(signature) => setCloseForm((current) => ({ ...current, closer_signature: signature }))}
                  />
                  <button
                    type="button"
                    onClick={() => void handleCloseTicket()}
                    disabled={savingClose || !closeForm.closer_signature}
                    className={primaryButtonClass}
                  >
                    {savingClose ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    Cerrar ticket
                  </button>
                </div>
              ) : null}
            </TimelineStep>
          )}
        </ol>
      </div>

      {/* Seguimiento */}
      <div className={cardClass}>
        <h2 className="mb-3 text-lg font-bold text-[var(--color-brand-700)]">Seguimiento</h2>
        <div className="space-y-2">
          {(ticket.comments ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.8)] p-4 text-sm text-[var(--unilabor-neutral)]">
              Sin comentarios registrados.
            </div>
          ) : (
            ticket.comments?.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border px-3 py-2 ${
                  item.is_internal ? 'border-[rgba(217,164,6,0.3)] bg-[rgba(255,244,214,0.7)]' : 'border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)]'
                }`}
              >
                <p className="flex items-center gap-2 text-xs font-semibold text-[var(--color-brand-700)]">
                  {item.created_by_name ?? 'Usuario'} | {formatDateTime(item.created_at)}
                  {item.is_internal ? (
                    <span className="rounded-full bg-[rgba(217,164,6,0.18)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[rgb(146,110,0)]">
                      Interno
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--unilabor-ink)]">{item.comment}</p>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 space-y-2">
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            placeholder="Agregar comentario de seguimiento..."
            className={fieldClass}
          />
          {canManage ? (
            <label className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-white/80 px-3 py-2">
              <input
                type="checkbox"
                checked={commentInternal}
                onChange={(event) => setCommentInternal(event.target.checked)}
                className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] text-[var(--color-brand-500)]"
              />
              <span className="text-sm font-semibold text-[var(--color-brand-700)]">Comentario interno (no visible al solicitante)</span>
            </label>
          ) : null}
          <button type="button" onClick={() => void handleAddComment()} disabled={savingComment} className={primaryButtonClass}>
            {savingComment ? <Loader2 size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />}
            Agregar comentario
          </button>
        </div>

        <div className="mt-3 space-y-2 border-t border-[rgba(0,65,106,0.08)] pt-3">
          <button
            type="button"
            onClick={() => void handleToggleHistory()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <History size={14} />
            {showHistory ? 'Ocultar historial' : 'Ver historial completo'}
          </button>
          {showHistory ? (
            <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.72)] p-2">
              {ticketHistory.length === 0 ? (
                <p className="p-2 text-xs text-[var(--unilabor-neutral)]">Sin eventos registrados.</p>
              ) : (
                ticketHistory.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-[rgba(0,65,106,0.08)] bg-white/90 px-2.5 py-1.5">
                    <p className="text-[11px] font-semibold text-[var(--color-brand-700)]">
                      {entry.action} · {formatDateTime(entry.created_at)}
                    </p>
                    <p className="text-xs leading-5 text-[var(--unilabor-ink)]">{entry.summary}</p>
                    <p className="text-[10px] text-[var(--unilabor-neutral)]">{entry.created_by_name ?? 'Sistema'}</p>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
