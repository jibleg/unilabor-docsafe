import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit3, Eye, Plus, RefreshCw, Search } from 'lucide-react';
import {
  createHelpdeskTicket,
  getApiErrorMessage,
  getHelpdeskTicketStats,
  listEmployees,
  listHelpdeskAssets,
  listHelpdeskTicketCatalogs,
  listHelpdeskTicketsPaginated,
  updateHelpdeskTicketById,
} from '../api/service';
import { useAuthStore } from '../store/useAuthStore';
import type { Employee, HelpdeskAsset, HelpdeskTicket, HelpdeskTicketCatalogs, HelpdeskTicketStats } from '../types/models';
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
  catalogName,
  statusName,
  priorityName,
  formatDateTime,
  toFormState,
  toPayload,
  type TicketFormState,
} from './HelpdeskTicketsPage.helpers';

export const HelpdeskTicketsPage = () => {
  const navigate = useNavigate();
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
  const [assets, setAssets] = useState<HelpdeskAsset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [ticketStats, setTicketStats] = useState<HelpdeskTicketStats>(EMPTY_TICKET_STATS);
  const [saving, setSaving] = useState(false);
  const [editingTicket, setEditingTicket] = useState<HelpdeskTicket | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<TicketFormState>(EMPTY_FORM);

  const loadAuxData = useCallback(async () => {
    try {
      const [catalogData, assetData, employeeData] = await Promise.all([
        listHelpdeskTicketCatalogs(),
        listHelpdeskAssets(),
        listEmployees(),
      ]);

      setCatalogs(catalogData);
      setAssets(assetData);
      setEmployees(employeeData);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los catálogos de solicitudes.'));
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
      notifyWarning('El título de la solicitud es obligatorio.');
      return false;
    }

    if (!form.description.trim()) {
      notifyWarning('La descripción de la solicitud es obligatoria.');
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
        await updateHelpdeskTicketById(editingTicket.id, toPayload(form));
        notifySuccess('Solicitud actualizada correctamente.');
      } else {
        const created = await createHelpdeskTicket(toPayload(form));
        notifySuccess('Solicitud registrada correctamente.');
        setIsFormOpen(false);
        resetForm();
        refreshTickets();
        navigate(`/helpdesk/tickets/${created.id}`);
        return;
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
          { label: 'Críticas', value: summary.critical },
          { label: 'Impacto resultados', value: summary.affectsResults },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <p className="text-2xl font-black text-[var(--color-brand-700)]">{item.value}</p>
            <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
          <Search size={18} className="text-[var(--color-brand-700)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por folio, activo, colaborador, estado, prioridad o descripción..."
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
                          onClick={() => navigate(`/helpdesk/tickets/${ticket.id}`)}
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
