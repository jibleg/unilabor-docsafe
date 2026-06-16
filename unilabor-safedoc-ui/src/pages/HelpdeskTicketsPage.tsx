import { useCallback, useEffect, useState } from 'react';
import {
  Edit3,
  Eye,
  LifeBuoy,
  Loader2,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  addHelpdeskTicketComment,
  createHelpdeskTicket,
  evaluateHelpdeskTicketIsoRisk,
  getApiErrorMessage,
  getHelpdeskTicketStats,
  listEmployees,
  listHelpdeskAssets,
  listHelpdeskCatalogs,
  listHelpdeskTicketCatalogs,
  listHelpdeskTicketsPaginated,
  releaseHelpdeskTicketTechnically,
  solveHelpdeskTicket,
  type HelpdeskTicketIsoRiskPayload,
  type HelpdeskTicketTechnicalReleasePayload,
  updateHelpdeskTicketById,
  validateHelpdeskTicketReturn,
} from '../api/service';
import { useAuthStore } from '../store/useAuthStore';
import type {
  Employee,
  HelpdeskAsset,
  HelpdeskCatalogItem,
  HelpdeskTicket,
  HelpdeskTicketCatalogs,
  HelpdeskTicketStats,
} from '../types/models';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { Pagination } from '../components/Pagination';
import { getModuleRole } from '../utils/modules';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { hasAnyRole } from '../utils/roles';

import { TicketFormModal } from './HelpdeskTicketForm';
import {
  EMPTY_TICKET_STATS,
  EMPTY_CATALOGS,
  EMPTY_FORM,
  EMPTY_SOLUTION_FORM,
  EMPTY_RETURN_FORM,
  EMPTY_ISO_RISK_FORM,
  EMPTY_TECHNICAL_RELEASE_FORM,
  numericOrNull,
  catalogName,
  statusName,
  priorityName,
  riskLabel,
  formatDateTime,
  formatDowntime,
  toFormState,
  toPayload,
  type TicketFormState,
  type SolutionFormState,
  type ReturnFormState,
  type IsoRiskFormState,
  type TechnicalReleaseFormState,
} from './HelpdeskTicketsPage.helpers';

export const HelpdeskTicketsPage = () => {
  const availableModules = useAuthStore((state) => state.availableModules);
  const moduleRole = getModuleRole(availableModules, 'HELPDESK') ?? 'VIEWER';
  const canManage = hasAnyRole(moduleRole, ['ADMIN', 'EDITOR']);

  const {
    items: tickets,
    pagination,
    page,
    setPage,
    search: query,
    setSearch: setQuery,
    loading,
    reload: reloadTickets,
  } = usePaginatedList<HelpdeskTicket>(
    (q) => listHelpdeskTicketsPaginated({ page: q.page, limit: q.limit, search: q.search }),
    {
      pageSize: 20,
      onError: (error) =>
        notifyError(getApiErrorMessage(error, 'No se pudieron cargar las solicitudes.')),
    },
  );
  const [catalogs, setCatalogs] = useState<HelpdeskTicketCatalogs>(EMPTY_CATALOGS);
  const [operationalStatuses, setOperationalStatuses] = useState<HelpdeskCatalogItem[]>([]);
  const [assets, setAssets] = useState<HelpdeskAsset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [ticketStats, setTicketStats] = useState<HelpdeskTicketStats>(EMPTY_TICKET_STATS);
  const [saving, setSaving] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<HelpdeskTicket | null>(null);
  const [editingTicket, setEditingTicket] = useState<HelpdeskTicket | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<TicketFormState>(EMPTY_FORM);
  const [solutionForm, setSolutionForm] = useState<SolutionFormState>(EMPTY_SOLUTION_FORM);
  const [returnForm, setReturnForm] = useState<ReturnFormState>(EMPTY_RETURN_FORM);
  const [isoRiskForm, setIsoRiskForm] = useState<IsoRiskFormState>(EMPTY_ISO_RISK_FORM);
  const [technicalReleaseForm, setTechnicalReleaseForm] = useState<TechnicalReleaseFormState>(EMPTY_TECHNICAL_RELEASE_FORM);
  const [savingSolution, setSavingSolution] = useState(false);
  const [savingReturn, setSavingReturn] = useState(false);
  const [savingIsoRisk, setSavingIsoRisk] = useState(false);
  const [savingTechnicalRelease, setSavingTechnicalRelease] = useState(false);
  const [comment, setComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  const loadAuxData = useCallback(async () => {
    try {
      const [catalogData, assetCatalogData, assetData, employeeData] = await Promise.all([
        listHelpdeskTicketCatalogs(),
        listHelpdeskCatalogs(),
        listHelpdeskAssets(),
        listEmployees(),
      ]);

      setCatalogs(catalogData);
      setOperationalStatuses(assetCatalogData.operational_statuses);
      setAssets(assetData);
      setEmployees(employeeData);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los catalogos de solicitudes.'));
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      setTicketStats(await getHelpdeskTicketStats());
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el resumen de solicitudes.'));
    }
  }, []);

  useEffect(() => {
    void loadAuxData();
    void loadSummary();
  }, [loadAuxData, loadSummary]);

  const refreshTickets = useCallback(() => {
    reloadTickets();
    void loadSummary();
  }, [reloadTickets, loadSummary]);

  useEffect(() => {
    if (!selectedTicket) {
      setIsoRiskForm(EMPTY_ISO_RISK_FORM);
      return;
    }

    setIsoRiskForm({
      risk_level: selectedTicket.risk_level && selectedTicket.risk_level !== 'NOT_EVALUATED'
        ? selectedTicket.risk_level
        : 'LOW',
      impact_evaluation: selectedTicket.impact_evaluation ?? '',
      recent_analysis_usage: selectedTicket.recent_analysis_usage ?? '',
      alternate_equipment_used: Boolean(selectedTicket.alternate_equipment_used),
      alternate_equipment_notes: selectedTicket.alternate_equipment_notes ?? '',
      corrective_action_required: Boolean(selectedTicket.corrective_action_required),
      corrective_action_notes: selectedTicket.corrective_action_notes ?? '',
      technical_release_required: Boolean(selectedTicket.technical_release_required),
      operational_lock: Boolean(selectedTicket.operational_lock),
    });
  }, [selectedTicket]);

  const summary = {
    total: ticketStats.total,
    open: ticketStats.open,
    critical: ticketStats.critical,
    affectsResults: ticketStats.affects_results,
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingTicket(null);
  };

  const openCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (ticket: HelpdeskTicket) => {
    setEditingTicket(ticket);
    setForm(toFormState(ticket));
    setIsFormOpen(true);
  };

  const validateForm = () => {
    if (!form.title.trim()) {
      notifyWarning('El titulo de la solicitud es obligatorio.');
      return false;
    }

    if (!form.description.trim()) {
      notifyWarning('La descripcion de la solicitud es obligatoria.');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      if (editingTicket) {
        const updated = await updateHelpdeskTicketById(editingTicket.id, toPayload(form));
        setSelectedTicket(updated ?? editingTicket);
        notifySuccess('Solicitud actualizada correctamente.');
      } else {
        const created = await createHelpdeskTicket(toPayload(form));
        setSelectedTicket(created);
        notifySuccess('Solicitud registrada correctamente.');
      }

      setIsFormOpen(false);
      resetForm();
      refreshTickets();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar la solicitud.'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!selectedTicket || !comment.trim()) {
      notifyWarning('Escribe un comentario para agregarlo al seguimiento.');
      return;
    }

    setSavingComment(true);
    try {
      const updated = await addHelpdeskTicketComment(selectedTicket.id, comment.trim(), false);
      setSelectedTicket(updated ?? selectedTicket);
      setComment('');
      notifySuccess('Comentario agregado correctamente.');
      refreshTickets();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo agregar el comentario.'));
    } finally {
      setSavingComment(false);
    }
  };

  const handleSolveTicket = async () => {
    if (!selectedTicket) {
      return;
    }

    if (!solutionForm.solved_at || !solutionForm.solution_summary.trim()) {
      notifyWarning('Captura la fecha de solucion y el resumen tecnico.');
      return;
    }

    setSavingSolution(true);
    try {
      const updated = await solveHelpdeskTicket(selectedTicket.id, {
        solved_at: solutionForm.solved_at,
        solution_summary: solutionForm.solution_summary.trim(),
        equipment_status_after_solution_id: numericOrNull(solutionForm.equipment_status_after_solution_id),
      });
      setSelectedTicket(updated ?? selectedTicket);
      setSolutionForm(EMPTY_SOLUTION_FORM);
      notifySuccess('Solucion tecnica registrada correctamente.');
      refreshTickets();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo registrar la solucion tecnica.'));
    } finally {
      setSavingSolution(false);
    }
  };

  const handleValidateReturn = async () => {
    if (!selectedTicket) {
      return;
    }

    if (!returnForm.return_to_operation_at) {
      notifyWarning('Captura la fecha de retorno a operacion.');
      return;
    }

    setSavingReturn(true);
    try {
      const updated = await validateHelpdeskTicketReturn(selectedTicket.id, {
        return_to_operation_at: returnForm.return_to_operation_at,
        equipment_status_after_solution_id: numericOrNull(returnForm.equipment_status_after_solution_id),
      });
      setSelectedTicket(updated ?? selectedTicket);
      setReturnForm(EMPTY_RETURN_FORM);
      notifySuccess('Retorno a operacion validado correctamente.');
      refreshTickets();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo validar el retorno a operacion.'));
    } finally {
      setSavingReturn(false);
    }
  };

  const handleEvaluateIsoRisk = async () => {
    if (!selectedTicket) {
      return;
    }
    if (!isoRiskForm.impact_evaluation.trim()) {
      notifyWarning('Captura la evaluacion de impacto ISO/riesgo.');
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
      const updated = await evaluateHelpdeskTicketIsoRisk(selectedTicket.id, payload);
      setSelectedTicket(updated ?? selectedTicket);
      notifySuccess('Evaluacion ISO/riesgo registrada correctamente.');
      refreshTickets();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo registrar la evaluacion ISO/riesgo.'));
    } finally {
      setSavingIsoRisk(false);
    }
  };

  const handleTechnicalRelease = async () => {
    if (!selectedTicket) {
      return;
    }
    if (!technicalReleaseForm.technical_release_summary.trim()) {
      notifyWarning('Captura el resumen de liberacion tecnica.');
      return;
    }

    const payload: HelpdeskTicketTechnicalReleasePayload = {
      technical_release_summary: technicalReleaseForm.technical_release_summary.trim(),
      equipment_status_after_solution_id: numericOrNull(technicalReleaseForm.equipment_status_after_solution_id),
    };

    setSavingTechnicalRelease(true);
    try {
      const updated = await releaseHelpdeskTicketTechnically(selectedTicket.id, payload);
      setSelectedTicket(updated ?? selectedTicket);
      setTechnicalReleaseForm(EMPTY_TECHNICAL_RELEASE_FORM);
      notifySuccess('Liberacion tecnica documentada correctamente.');
      refreshTickets();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo documentar la liberacion tecnica.'));
    } finally {
      setSavingTechnicalRelease(false);
    }
  };

  const setField = <K extends keyof TicketFormState>(field: K, value: TicketFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Mesa de ayuda
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Solicitudes</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Registra fallas, reparaciones, soporte y mantenimiento correctivo con trazabilidad por activo, prioridad e impacto operativo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => refreshTickets()}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
          >
            <Plus size={16} />
            Nueva solicitud
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Solicitudes', value: summary.total },
          { label: 'Abiertas', value: summary.open },
          { label: 'Criticas', value: summary.critical },
          { label: 'Impacto resultados', value: summary.affectsResults },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <p className="text-2xl font-black text-[var(--color-brand-700)]">{item.value}</p>
            <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <Search size={18} className="text-[var(--color-brand-700)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por folio, activo, colaborador, estado, prioridad o descripcion..."
              className="w-full bg-transparent text-sm text-[var(--unilabor-ink)] outline-none"
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <table className="w-full text-left">
              <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
                <tr>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Solicitud</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Activo</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Estado</th>
                  <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
                      Cargando solicitudes...
                    </td>
                  </tr>
                ) : tickets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
                      No hay solicitudes registradas.
                    </td>
                  </tr>
                ) : (
                  tickets.map((ticket) => (
                    <tr key={ticket.id} className="transition-colors hover:bg-[rgba(191,212,230,0.22)]">
                      <td className="px-5 py-4">
                        <p className="text-sm font-bold text-[var(--color-brand-700)]">{ticket.ticket_code}</p>
                        <p className="text-sm font-semibold text-[var(--unilabor-ink)]">{ticket.title}</p>
                        <p className="text-xs text-[var(--unilabor-neutral)]">
                          {catalogName(ticket.request_type)} | {formatDateTime(ticket.reported_at)}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-sm text-[var(--unilabor-ink)]">
                        <p>{ticket.asset?.asset_code ?? 'Sin activo'}</p>
                        <p className="text-xs text-[var(--unilabor-neutral)]">{ticket.asset?.name ?? 'Solicitud general'}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-[var(--unilabor-ink)]">
                        <p>{statusName(ticket.status)}</p>
                        <p className="text-xs text-[var(--unilabor-neutral)]">
                          {priorityName(ticket.priority)}{ticket.affects_results ? ' | Impacto resultados' : ''}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedTicket(ticket)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                          >
                            <Eye size={14} />
                            Ver
                          </button>
                          {canManage ? (
                            <button
                              type="button"
                              onClick={() => openEdit(ticket)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                            >
                              <Edit3 size={14} />
                              Editar
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="border-t border-[rgba(0,65,106,0.08)]">
              <Pagination
                page={page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                pageSize={pagination.limit}
                onPageChange={setPage}
                loading={loading}
              />
            </div>
          </div>
        </div>

        <aside className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
          {selectedTicket ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]">
                  <LifeBuoy size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">
                    {selectedTicket.ticket_code}
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{selectedTicket.title}</h2>
                  <p className="text-xs text-[var(--unilabor-neutral)]">{formatDateTime(selectedTicket.reported_at)}</p>
                </div>
              </div>

              <div className="grid gap-3 text-sm">
                {[
                  ['Tipo', catalogName(selectedTicket.request_type)],
                  ['Estado', statusName(selectedTicket.status)],
                  ['Prioridad', priorityName(selectedTicket.priority)],
                  ['Activo', selectedTicket.asset ? `${selectedTicket.asset.asset_code} | ${selectedTicket.asset.name}` : 'Sin activo'],
                  ['Solicita', selectedTicket.requester_employee?.full_name ?? 'Sin solicitante'],
                  ['Responsable', selectedTicket.assigned_employee?.full_name ?? 'Sin responsable'],
                  ['Solucion', selectedTicket.solved_at ? formatDateTime(selectedTicket.solved_at) : 'Pendiente'],
                  ['Retorno operacion', selectedTicket.return_to_operation_at ? formatDateTime(selectedTicket.return_to_operation_at) : 'Pendiente'],
                  ['Tiempo fuera', formatDowntime(selectedTicket.downtime_minutes)],
                  ['Estado posterior', catalogName(selectedTicket.equipment_status_after_solution)],
                  ['Riesgo ISO', riskLabel(selectedTicket.risk_level)],
                  ['Bloqueo operativo', selectedTicket.operational_lock ? 'Activo' : 'No activo'],
                  ['Liberacion tecnica', selectedTicket.technical_released_at ? formatDateTime(selectedTicket.technical_released_at) : 'Pendiente'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{label}</p>
                    <p className="mt-1 font-semibold text-[var(--color-brand-700)]">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Descripcion</p>
                <p className="mt-1 leading-6 text-[var(--unilabor-ink)]">{selectedTicket.description}</p>
              </div>

              {selectedTicket.operational_impact ? (
                <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Impacto operativo</p>
                  <p className="mt-1 leading-6 text-[var(--unilabor-ink)]">{selectedTicket.operational_impact}</p>
                </div>
              ) : null}

              {selectedTicket.impact_evaluation ? (
                <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Evaluacion ISO/riesgo</p>
                  <p className="mt-1 leading-6 text-[var(--unilabor-ink)]">{selectedTicket.impact_evaluation}</p>
                  {selectedTicket.recent_analysis_usage ? (
                    <p className="mt-2 text-xs leading-5 text-[var(--unilabor-neutral)]">
                      Uso en analisis recientes: {selectedTicket.recent_analysis_usage}
                    </p>
                  ) : null}
                  {selectedTicket.alternate_equipment_used ? (
                    <p className="mt-2 text-xs leading-5 text-[var(--unilabor-neutral)]">
                      Equipo alterno: {selectedTicket.alternate_equipment_notes ?? 'Usado sin observaciones adicionales'}
                    </p>
                  ) : null}
                  {selectedTicket.corrective_action_required ? (
                    <p className="mt-2 text-xs leading-5 text-[var(--unilabor-neutral)]">
                      Accion correctiva requerida: {selectedTicket.corrective_action_notes ?? 'Pendiente de documentar'}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {selectedTicket.solution_summary ? (
                <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Solucion tecnica</p>
                  <p className="mt-1 leading-6 text-[var(--unilabor-ink)]">{selectedTicket.solution_summary}</p>
                </div>
              ) : null}

              {selectedTicket.technical_release_summary ? (
                <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Liberacion tecnica</p>
                  <p className="mt-1 leading-6 text-[var(--unilabor-ink)]">{selectedTicket.technical_release_summary}</p>
                </div>
              ) : null}

              {canManage ? (
                <div className="space-y-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.72)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Evaluacion ISO 15189
                  </p>

                  <div className="grid gap-2">
                    <select
                      value={isoRiskForm.risk_level}
                      onChange={(event) => setIsoRiskForm((current) => ({ ...current, risk_level: event.target.value }))}
                      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/95 px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    >
                      <option value="LOW">Riesgo bajo</option>
                      <option value="MEDIUM">Riesgo medio</option>
                      <option value="HIGH">Riesgo alto</option>
                      <option value="CRITICAL">Riesgo critico</option>
                    </select>
                    <textarea
                      value={isoRiskForm.impact_evaluation}
                      onChange={(event) => setIsoRiskForm((current) => ({ ...current, impact_evaluation: event.target.value }))}
                      rows={3}
                      placeholder="Evaluacion de impacto sobre operacion, resultados y continuidad..."
                      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/95 px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    />
                    <textarea
                      value={isoRiskForm.recent_analysis_usage}
                      onChange={(event) => setIsoRiskForm((current) => ({ ...current, recent_analysis_usage: event.target.value }))}
                      rows={2}
                      placeholder="Uso en analisis recientes o lotes potencialmente afectados..."
                      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/95 px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    />
                    <label className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-white/80 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isoRiskForm.alternate_equipment_used}
                        onChange={(event) => setIsoRiskForm((current) => ({ ...current, alternate_equipment_used: event.target.checked }))}
                        className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] text-[var(--color-brand-500)]"
                      />
                      <span className="text-sm font-semibold text-[var(--color-brand-700)]">Se uso equipo alterno</span>
                    </label>
                    {isoRiskForm.alternate_equipment_used ? (
                      <input
                        value={isoRiskForm.alternate_equipment_notes}
                        onChange={(event) => setIsoRiskForm((current) => ({ ...current, alternate_equipment_notes: event.target.value }))}
                        placeholder="Equipo alterno y condiciones de uso"
                        className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/95 px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                      />
                    ) : null}
                    <label className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-white/80 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isoRiskForm.corrective_action_required}
                        onChange={(event) => setIsoRiskForm((current) => ({ ...current, corrective_action_required: event.target.checked }))}
                        className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] text-[var(--color-brand-500)]"
                      />
                      <span className="text-sm font-semibold text-[var(--color-brand-700)]">Requiere accion correctiva</span>
                    </label>
                    {isoRiskForm.corrective_action_required ? (
                      <input
                        value={isoRiskForm.corrective_action_notes}
                        onChange={(event) => setIsoRiskForm((current) => ({ ...current, corrective_action_notes: event.target.value }))}
                        placeholder="Motivo o referencia de accion correctiva"
                        className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/95 px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
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
                        <span className="text-sm font-semibold text-[var(--color-brand-700)]">Requiere liberacion</span>
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
                    <button
                      type="button"
                      onClick={() => void handleEvaluateIsoRisk()}
                      disabled={savingIsoRisk}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                    >
                      {savingIsoRisk ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                      Guardar evaluacion ISO
                    </button>
                  </div>
                </div>
              ) : null}

              {canManage ? (
                <div className="space-y-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.72)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Solucion y retorno
                  </p>

                  <div className="grid gap-2">
                    <input
                      type="datetime-local"
                      value={solutionForm.solved_at}
                      onChange={(event) => setSolutionForm((current) => ({ ...current, solved_at: event.target.value }))}
                      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/95 px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    />
                    <textarea
                      value={solutionForm.solution_summary}
                      onChange={(event) => setSolutionForm((current) => ({ ...current, solution_summary: event.target.value }))}
                      rows={3}
                      placeholder="Resumen tecnico de la solucion..."
                      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/95 px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    />
                    <select
                      value={solutionForm.equipment_status_after_solution_id}
                      onChange={(event) => setSolutionForm((current) => ({ ...current, equipment_status_after_solution_id: event.target.value }))}
                      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/95 px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    >
                      <option value="">Estado posterior del equipo</option>
                      {operationalStatuses.map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleSolveTicket()}
                      disabled={savingSolution}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                    >
                      {savingSolution ? <Loader2 size={14} className="animate-spin" /> : <LifeBuoy size={14} />}
                      Registrar solucion
                    </button>
                  </div>

                  <div className="grid gap-2 border-t border-[rgba(0,65,106,0.08)] pt-3">
                    <textarea
                      value={technicalReleaseForm.technical_release_summary}
                      onChange={(event) => setTechnicalReleaseForm((current) => ({ ...current, technical_release_summary: event.target.value }))}
                      rows={3}
                      placeholder="Liberacion tecnica: verificacion, criterios cumplidos y decision..."
                      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/95 px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    />
                    <select
                      value={technicalReleaseForm.equipment_status_after_solution_id}
                      onChange={(event) => setTechnicalReleaseForm((current) => ({ ...current, equipment_status_after_solution_id: event.target.value }))}
                      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/95 px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
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
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                    >
                      {savingTechnicalRelease ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                      Documentar liberacion
                    </button>
                  </div>

                  <div className="grid gap-2 border-t border-[rgba(0,65,106,0.08)] pt-3">
                    <input
                      type="datetime-local"
                      value={returnForm.return_to_operation_at}
                      onChange={(event) => setReturnForm((current) => ({ ...current, return_to_operation_at: event.target.value }))}
                      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/95 px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    />
                    <select
                      value={returnForm.equipment_status_after_solution_id}
                      onChange={(event) => setReturnForm((current) => ({ ...current, equipment_status_after_solution_id: event.target.value }))}
                      className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/95 px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    >
                      <option value="">Estado validado del equipo</option>
                      {operationalStatuses.map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleValidateReturn()}
                      disabled={savingReturn}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                    >
                      {savingReturn ? <Loader2 size={14} className="animate-spin" /> : <LifeBuoy size={14} />}
                      Validar retorno
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Seguimiento</p>
                {(selectedTicket.comments ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.8)] p-4 text-sm text-[var(--unilabor-neutral)]">
                    Sin comentarios registrados.
                  </div>
                ) : (
                  selectedTicket.comments?.map((item) => (
                    <div key={item.id} className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2">
                      <p className="text-xs font-semibold text-[var(--color-brand-700)]">
                        {item.created_by_name ?? 'Usuario'} | {formatDateTime(item.created_at)}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--unilabor-ink)]">{item.comment}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={3}
                  placeholder="Agregar comentario de seguimiento..."
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                />
                <button
                  type="button"
                  onClick={() => void handleAddComment()}
                  disabled={savingComment}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                >
                  {savingComment ? <Loader2 size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />}
                  Agregar comentario
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.14)] bg-[rgba(248,251,253,0.8)] p-6 text-sm leading-6 text-[var(--unilabor-neutral)]">
              Selecciona una solicitud para revisar su detalle, estado, responsable e historial de seguimiento.
            </div>
          )}
        </aside>
      </div>


      <TicketFormModal
        open={isFormOpen}
        isEditing={Boolean(editingTicket)}
        form={form}
        setField={setField}
        assets={assets}
        employees={employees}
        catalogs={catalogs}
        saving={saving}
        onCancel={() => {
          setIsFormOpen(false);
          resetForm();
        }}
        onSave={() => void handleSave()}
      />
    </div>
  );
};
