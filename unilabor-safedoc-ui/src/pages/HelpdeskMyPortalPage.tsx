import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Laptop,
  LifeBuoy,
  Loader2,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Send,
} from 'lucide-react';
import {
  addMyHelpdeskTicketComment,
  confirmMyHelpdeskTicketFunctionality,
  createMyHelpdeskTicket,
  fetchMyHelpdeskTicketById,
  getApiErrorMessage,
  listHelpdeskTicketCatalogs,
  listMyHelpdeskAssets,
  listMyHelpdeskTickets,
  type HelpdeskTicketPayload,
} from '../api/service';
import type { Employee, HelpdeskAsset, HelpdeskTicket, HelpdeskTicketCatalogs } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';

interface TicketFormState {
  asset_id: string;
  request_type_id: string;
  priority_id: string;
  title: string;
  description: string;
  operational_impact: string;
  affects_results: boolean;
}

const EMPTY_CATALOGS: HelpdeskTicketCatalogs = {
  request_types: [],
  ticket_statuses: [],
  ticket_priorities: [],
};

const EMPTY_FORM: TicketFormState = {
  asset_id: '',
  request_type_id: '',
  priority_id: '',
  title: '',
  description: '',
  operational_impact: '',
  affects_results: false,
};

const numericOrNull = (value: string): number | null => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const toPayload = (form: TicketFormState): HelpdeskTicketPayload => ({
  asset_id: numericOrNull(form.asset_id),
  request_type_id: numericOrNull(form.request_type_id),
  priority_id: numericOrNull(form.priority_id),
  title: form.title.trim(),
  description: form.description.trim(),
  operational_impact: form.operational_impact.trim() || null,
  affects_results: form.affects_results,
});

export const HelpdeskMyPortalPage = () => {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [assets, setAssets] = useState<HelpdeskAsset[]>([]);
  const [tickets, setTickets] = useState<HelpdeskTicket[]>([]);
  const [catalogs, setCatalogs] = useState<HelpdeskTicketCatalogs>(EMPTY_CATALOGS);
  const [selectedAsset, setSelectedAsset] = useState<HelpdeskAsset | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<HelpdeskTicket | null>(null);
  const [form, setForm] = useState<TicketFormState>(EMPTY_FORM);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [assetData, ticketData, catalogData] = await Promise.all([
        listMyHelpdeskAssets(),
        listMyHelpdeskTickets(),
        listHelpdeskTicketCatalogs(),
      ]);

      setEmployee(assetData.employee);
      setAssets(assetData.assets);
      setTickets(ticketData);
      setCatalogs(catalogData);
      setSelectedAsset((current) => assetData.assets.find((asset) => asset.id === current?.id) ?? assetData.assets[0] ?? null);
      setSelectedTicket((current) => ticketData.find((ticket) => ticket.id === current?.id) ?? ticketData[0] ?? null);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar tu portal de mesa de ayuda.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => ({
    assets: assets.length,
    tickets: tickets.length,
    open: tickets.filter((ticket) => !ticket.status?.is_closed).length,
    solved: tickets.filter((ticket) => Boolean(ticket.solved_at)).length,
  }), [assets, tickets]);

  const openReportFromAsset = (asset: HelpdeskAsset) => {
    setSelectedAsset(asset);
    setForm((current) => ({
      ...current,
      asset_id: String(asset.id),
      title: current.title || `Reporte de ${asset.name}`,
    }));
  };

  const selectTicket = async (ticket: HelpdeskTicket) => {
    setSelectedTicket(ticket);
    try {
      const detailed = await fetchMyHelpdeskTicketById(ticket.id);
      setSelectedTicket(detailed ?? ticket);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el detalle de la solicitud.'));
    }
  };

  const handleCreateTicket = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      notifyWarning('Captura titulo y descripcion de la solicitud.');
      return;
    }

    setSaving(true);
    try {
      const created = await createMyHelpdeskTicket(toPayload(form));
      setSelectedTicket(created);
      setForm(EMPTY_FORM);
      notifySuccess('Solicitud registrada correctamente.');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo registrar tu solicitud.'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!selectedTicket || !comment.trim()) {
      notifyWarning('Escribe un comentario para agregar seguimiento.');
      return;
    }

    setSaving(true);
    try {
      const updated = await addMyHelpdeskTicketComment(selectedTicket.id, comment.trim());
      setSelectedTicket(updated ?? selectedTicket);
      setComment('');
      notifySuccess('Comentario agregado correctamente.');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo agregar el comentario.'));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmFunctionality = async () => {
    if (!selectedTicket) {
      return;
    }

    setSaving(true);
    try {
      const updated = await confirmMyHelpdeskTicketFunctionality(selectedTicket.id);
      setSelectedTicket(updated ?? selectedTicket);
      notifySuccess('Funcionamiento confirmado correctamente.');
      await loadData();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo confirmar el funcionamiento.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Mi portal
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Mis equipos y solicitudes</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            {employee ? `${employee.employee_code} | ${employee.full_name}` : 'Consulta tus activos asignados y da seguimiento a tus reportes.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Recargar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ['Equipos', summary.assets],
          ['Solicitudes', summary.tickets],
          ['Abiertas', summary.open],
          ['Con solucion', summary.solved],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <p className="text-2xl font-black text-[var(--color-brand-700)]">{value}</p>
            <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <div className="mb-4 flex items-center gap-3">
              <Laptop size={22} className="text-[var(--color-brand-700)]" />
              <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Mis equipos</h2>
            </div>
            <div className="grid gap-3">
              {assets.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
                  No tienes equipos asignados.
                </p>
              ) : assets.map((asset) => (
                <button
                  type="button"
                  key={asset.id}
                  onClick={() => openReportFromAsset(asset)}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    selectedAsset?.id === asset.id
                      ? 'border-[rgba(0,65,106,0.16)] bg-[rgba(191,212,230,0.34)]'
                      : 'border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] hover:bg-[rgba(191,212,230,0.2)]'
                  }`}
                >
                  <p className="font-bold text-[var(--color-brand-700)]">{asset.asset_code}</p>
                  <p className="text-sm text-[var(--unilabor-ink)]">{asset.name}</p>
                  <p className="text-xs text-[var(--unilabor-neutral)]">
                    {asset.operational_status?.name ?? 'Sin estado'} | {asset.location?.name ?? 'Sin ubicacion'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <div className="mb-4 flex items-center gap-3">
              <Plus size={22} className="text-[var(--color-brand-700)]" />
              <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Reportar falla o solicitud</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                value={form.asset_id}
                onChange={(event) => setForm((current) => ({ ...current, asset_id: event.target.value }))}
                className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none"
              >
                <option value="">Solicitud general</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.asset_code} - {asset.name}</option>
                ))}
              </select>
              <select
                value={form.request_type_id}
                onChange={(event) => setForm((current) => ({ ...current, request_type_id: event.target.value }))}
                className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none"
              >
                <option value="">Tipo de solicitud</option>
                {catalogs.request_types.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <select
                value={form.priority_id}
                onChange={(event) => setForm((current) => ({ ...current, priority_id: event.target.value }))}
                className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none"
              >
                <option value="">Prioridad</option>
                {catalogs.ticket_priorities.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Titulo"
                className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none"
              />
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                rows={3}
                placeholder="Descripcion de la falla o solicitud"
                className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none md:col-span-2"
              />
              <textarea
                value={form.operational_impact}
                onChange={(event) => setForm((current) => ({ ...current, operational_impact: event.target.value }))}
                rows={2}
                placeholder="Impacto operativo observado"
                className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none md:col-span-2"
              />
              <label className="flex items-center gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.affects_results}
                  onChange={(event) => setForm((current) => ({ ...current, affects_results: event.target.checked }))}
                  className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] text-[var(--color-brand-500)]"
                />
                <span className="text-sm font-semibold text-[var(--color-brand-700)]">Puede afectar resultados</span>
              </label>
              <button
                type="button"
                onClick={() => void handleCreateTicket()}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Enviar solicitud
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <div className="mb-4 flex items-center gap-3">
              <LifeBuoy size={22} className="text-[var(--color-brand-700)]" />
              <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Mis solicitudes</h2>
            </div>
            <div className="space-y-3">
              {tickets.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
                  No tienes solicitudes registradas.
                </p>
              ) : tickets.map((ticket) => (
                <button
                  type="button"
                  key={ticket.id}
                  onClick={() => void selectTicket(ticket)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    selectedTicket?.id === ticket.id
                      ? 'border-[rgba(0,65,106,0.16)] bg-[rgba(191,212,230,0.34)]'
                      : 'border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] hover:bg-[rgba(191,212,230,0.2)]'
                  }`}
                >
                  <p className="font-bold text-[var(--color-brand-700)]">{ticket.ticket_code}</p>
                  <p className="text-sm text-[var(--unilabor-ink)]">{ticket.title}</p>
                  <p className="text-xs text-[var(--unilabor-neutral)]">
                    {ticket.status?.name ?? 'Sin estado'} | {formatDateTime(ticket.reported_at)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {selectedTicket ? (
            <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
              <h2 className="text-lg font-bold text-[var(--color-brand-700)]">{selectedTicket.ticket_code}</h2>
              <p className="mt-1 text-sm font-semibold text-[var(--unilabor-ink)]">{selectedTicket.title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--unilabor-neutral)]">{selectedTicket.description}</p>
              {selectedTicket.solution_summary ? (
                <div className="mt-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] p-3 text-sm">
                  <p className="font-bold text-[var(--color-brand-700)]">Solucion registrada</p>
                  <p className="mt-1 leading-6 text-[var(--unilabor-ink)]">{selectedTicket.solution_summary}</p>
                </div>
              ) : null}
              <div className="mt-4 space-y-2">
                {(selectedTicket.comments ?? []).map((item) => (
                  <div key={item.id} className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-sm">
                    <p className="text-xs font-semibold text-[var(--color-brand-700)]">{formatDateTime(item.created_at)}</p>
                    <p className="mt-1 leading-6 text-[var(--unilabor-ink)]">{item.comment}</p>
                  </div>
                ))}
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={3}
                  placeholder="Agregar comentario"
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleAddComment()}
                  disabled={saving}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />}
                  Agregar comentario
                </button>
                {selectedTicket.solved_at && !selectedTicket.return_to_operation_at ? (
                  <button
                    type="button"
                    onClick={() => void handleConfirmFunctionality()}
                    disabled={saving}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Confirmar funcionamiento
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
};
