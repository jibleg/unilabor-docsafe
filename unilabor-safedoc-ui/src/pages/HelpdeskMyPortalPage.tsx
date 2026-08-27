import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileUp,
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
  fetchMyTicketDocumentUrl,
  getApiErrorMessage,
  listHelpdeskTicketCatalogs,
  listMyHelpdeskAssets,
  listMyHelpdeskTicketsPaginated,
  listMyTicketDocuments,
  uploadMyTicketDocument,
  type HelpdeskTicketPayload,
  type MyHelpdeskTicketSummary,
} from '../api/service';
import type { Employee, HelpdeskAsset, HelpdeskTicket, HelpdeskTicketCatalogs, HelpdeskTicketDocument } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { SignaturePad } from '../components/helpdesk/SignaturePad';
import { Pagination } from '../components/Pagination';

const TICKETS_PAGE_SIZE = 10;

const EMPTY_TICKETS_SUMMARY: MyHelpdeskTicketSummary = { total: 0, open: 0, solved: 0 };

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
  const [confirmSignature, setConfirmSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ticketDocuments, setTicketDocuments] = useState<HelpdeskTicketDocument[]>([]);
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [savingDocument, setSavingDocument] = useState(false);
  const [ticketsPage, setTicketsPage] = useState(1);
  const [ticketsPagination, setTicketsPagination] = useState({ total: 0, totalPages: 1 });
  const [ticketsSummary, setTicketsSummary] = useState<MyHelpdeskTicketSummary>(EMPTY_TICKETS_SUMMARY);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [assetData, catalogData] = await Promise.all([
        listMyHelpdeskAssets(),
        listHelpdeskTicketCatalogs(),
      ]);

      setEmployee(assetData.employee);
      setAssets(assetData.assets);
      setCatalogs(catalogData);
      setSelectedAsset((current) => assetData.assets.find((asset) => asset.id === current?.id) ?? assetData.assets[0] ?? null);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar tu portal de mesa de ayuda.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTickets = useCallback(async (pageToLoad: number) => {
    setTicketsLoading(true);
    try {
      const result = await listMyHelpdeskTicketsPaginated({ page: pageToLoad, limit: TICKETS_PAGE_SIZE });
      setTickets(result.data);
      setTicketsPagination({ total: result.pagination.total, totalPages: result.pagination.totalPages });
      setTicketsSummary(result.summary);
      setSelectedTicket((current) => result.data.find((ticket) => ticket.id === current?.id) ?? current ?? result.data[0] ?? null);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar tus solicitudes.'));
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadTickets(ticketsPage);
  }, [ticketsPage, loadTickets]);

  const summary = useMemo(() => ({
    assets: assets.length,
    tickets: ticketsSummary.total,
    open: ticketsSummary.open,
    solved: ticketsSummary.solved,
  }), [assets, ticketsSummary]);

  const openReportFromAsset = (asset: HelpdeskAsset) => {
    setSelectedAsset(asset);
    setForm((current) => ({
      ...current,
      asset_id: String(asset.id),
      title: current.title || `Reporte de ${asset.name}`,
    }));
  };

  const loadTicketDocuments = useCallback(async (ticketId: number) => {
    try {
      setTicketDocuments(await listMyTicketDocuments(ticketId));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar las evidencias de la solicitud.'));
    }
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      void loadTicketDocuments(selectedTicket.id);
    } else {
      setTicketDocuments([]);
    }
  }, [selectedTicket?.id, loadTicketDocuments]);

  const selectTicket = async (ticket: HelpdeskTicket) => {
    setSelectedTicket(ticket);
    setConfirmSignature(null);
    setDocumentTitle('');
    setDocumentFile(null);
    try {
      const detailed = await fetchMyHelpdeskTicketById(ticket.id);
      setSelectedTicket(detailed ?? ticket);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el detalle de la solicitud.'));
    }
  };

  const handleUploadDocument = async () => {
    if (!selectedTicket) return;
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
      await uploadMyTicketDocument(selectedTicket.id, documentFile, { title: documentTitle.trim() });
      setDocumentTitle('');
      setDocumentFile(null);
      notifySuccess('Evidencia cargada correctamente.');
      await loadTicketDocuments(selectedTicket.id);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la evidencia.'));
    } finally {
      setSavingDocument(false);
    }
  };

  const handleViewDocument = async (documentId: number) => {
    try {
      const url = await fetchMyTicketDocumentUrl(documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir la evidencia.'));
    }
  };

  const handleCreateTicket = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      notifyWarning('Captura título y descripción de la solicitud.');
      return;
    }

    setSaving(true);
    try {
      const created = await createMyHelpdeskTicket(toPayload(form));
      setSelectedTicket(created);
      setForm(EMPTY_FORM);
      notifySuccess('Solicitud registrada correctamente.');
      setTicketsPage(1);
      await Promise.all([loadData(), loadTickets(1)]);
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
      await Promise.all([loadData(), loadTickets(ticketsPage)]);
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
    if (!confirmSignature) {
      notifyWarning('Firma tu confirmación de funcionamiento antes de continuar.');
      return;
    }

    setSaving(true);
    try {
      const updated = await confirmMyHelpdeskTicketFunctionality(selectedTicket.id, {
        requester_signature: confirmSignature,
      });
      setSelectedTicket(updated ?? selectedTicket);
      setConfirmSignature(null);
      notifySuccess('Funcionamiento confirmado correctamente.');
      await Promise.all([loadData(), loadTickets(ticketsPage)]);
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
          onClick={() => {
            void loadData();
            void loadTickets(ticketsPage);
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
        >
          <RefreshCw size={16} className={(loading || ticketsLoading) ? 'animate-spin' : ''} />
          Recargar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ['Equipos', summary.assets],
          ['Solicitudes', summary.tickets],
          ['Abiertas', summary.open],
          ['Con solución', summary.solved],
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
                    {asset.operational_status?.name ?? 'Sin estado'} | {asset.location?.name ?? 'Sin ubicación'}
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
                placeholder="Título"
                className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none"
              />
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                rows={3}
                placeholder="Descripción de la falla o solicitud"
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
            <Pagination
              page={ticketsPage}
              totalPages={ticketsPagination.totalPages}
              total={ticketsPagination.total}
              pageSize={TICKETS_PAGE_SIZE}
              onPageChange={setTicketsPage}
              loading={ticketsLoading}
            />
          </div>

          {selectedTicket ? (
            <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
              <h2 className="text-lg font-bold text-[var(--color-brand-700)]">{selectedTicket.ticket_code}</h2>
              <p className="mt-1 text-sm font-semibold text-[var(--unilabor-ink)]">{selectedTicket.title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--unilabor-neutral)]">{selectedTicket.description}</p>
              {selectedTicket.solution_summary ? (
                <div className="mt-3 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] p-3 text-sm">
                  <p className="font-bold text-[var(--color-brand-700)]">Solución registrada</p>
                  <p className="mt-1 leading-6 text-[var(--unilabor-ink)]">{selectedTicket.solution_summary}</p>
                </div>
              ) : null}

              <div className="mt-4 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.72)] p-3">
                <p className="text-sm font-bold text-[var(--color-brand-700)]">Evidencia</p>
                <div className="mt-2 space-y-1.5">
                  {ticketDocuments.length === 0 ? (
                    <p className="text-xs text-[var(--unilabor-neutral)]">Sin evidencia adjunta todavía.</p>
                  ) : ticketDocuments.map((document) => (
                    <button
                      type="button"
                      key={document.id}
                      onClick={() => void handleViewDocument(document.id)}
                      className="flex w-full items-center justify-between rounded-lg border border-[rgba(0,65,106,0.08)] bg-white/90 px-3 py-1.5 text-left text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.2)]"
                    >
                      {document.title}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid gap-2">
                  <input
                    value={documentTitle}
                    onChange={(event) => setDocumentTitle(event.target.value)}
                    placeholder="Título de la evidencia (ej. Foto del equipo dañado)"
                    className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/95 px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none"
                  />
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                    className="text-xs text-[var(--unilabor-neutral)]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleUploadDocument()}
                    disabled={savingDocument}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                  >
                    {savingDocument ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                    Adjuntar evidencia
                  </button>
                </div>
              </div>

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
                  <div className="space-y-2 rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.72)] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                      Confirma que el equipo quedó funcionando y firma tu conformidad
                    </p>
                    <SignaturePad
                      label="Firma de conformidad"
                      hint="Tu firma confirma que el equipo/servicio quedó funcionando correctamente."
                      onChange={setConfirmSignature}
                    />
                    <button
                      type="button"
                      onClick={() => void handleConfirmFunctionality()}
                      disabled={saving || !confirmSignature}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Confirmar funcionamiento
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
};
