import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  GraduationCap,
  RefreshCw,
  Signature,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { getApiErrorMessage } from '../api/service.parsers';
import { Pagination } from '../components/Pagination';
import { SearchableSelect, type SearchableOption } from '../components/SearchableSelect';
import { confirmAction } from '../utils/confirm';
import {
  cancelAcknowledgement,
  getAcknowledgementSignedCopyUrl,
  listAcknowledgements,
} from '../api/service.api-rh-acknowledgement';
import type {
  AcknowledgementBoardItem,
  AcknowledgementSource,
  AcknowledgementStatus,
} from '../types/models';

const STATUS_LABEL: Record<AcknowledgementStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En lectura',
  read: 'Leído · falta firmar',
  signed: 'Firmado',
  expired: 'Vencido',
  cancelled: 'Cancelado',
};

const STATUS_STYLE: Record<AcknowledgementStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-amber-100 text-amber-800',
  read: 'bg-sky-100 text-sky-800',
  signed: 'bg-emerald-100 text-emerald-800',
  expired: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-100 text-slate-500',
};

const STATUS_FILTERS: Array<{ value: AcknowledgementStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'in_progress', label: 'En lectura' },
  { value: 'read', label: 'Falta firmar' },
  { value: 'signed', label: 'Firmados' },
  { value: 'expired', label: 'Vencidos' },
];

// El tablero une dos fuentes: los acuses de documentos institucionales que RH
// carga y asigna, y las lecturas de la Sala de Lectura de Calidad (donde caen
// las del Programa de Induccion). Solo las primeras se cancelan desde aqui.
const SOURCE_FILTERS: Array<{ value: AcknowledgementSource | 'all'; label: string }> = [
  { value: 'all', label: 'Todas las fuentes' },
  { value: 'institutional', label: 'Documentos institucionales' },
  { value: 'reading_room', label: 'Sala de Lectura e Inducción' },
];

// Filtros locales por fase de Induccion y por documento. Se derivan de las
// filas ya cargadas (el tablero no pagina), asi que siempre ofrecen solo
// opciones con datos. Las filas sin fase (institucionales / Sala de Lectura
// suelta) se agrupan bajo NO_PHASE para poder aislarlas tambien.
const NO_PHASE = 'none';

const phaseKey = (item: AcknowledgementBoardItem): string =>
  item.induction_phase_number === null ? NO_PHASE : String(item.induction_phase_number);

const buildPhaseOptions = (items: AcknowledgementBoardItem[]): SearchableOption[] => {
  const byNumber = new Map<number, string>();
  let hasNoPhase = false;
  items.forEach((item) => {
    if (item.induction_phase_number === null) {
      hasNoPhase = true;
      return;
    }
    if (!byNumber.has(item.induction_phase_number)) {
      byNumber.set(item.induction_phase_number, item.induction_phase ?? '');
    }
  });
  const options = [...byNumber.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, name]) => ({
      value: String(number),
      label: name ? `Fase ${number} · ${name}` : `Fase ${number}`,
    }));
  if (hasNoPhase) {
    options.push({ value: NO_PHASE, label: 'Sin fase (institucionales / Sala de Lectura)' });
  }
  return options;
};

const buildDocumentOptions = (items: AcknowledgementBoardItem[]): SearchableOption[] =>
  [...new Set(items.map((item) => item.document_title).filter((title) => title.length > 0))]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((title) => ({ value: title, label: title }));

// El lector de la Sala puede no tener expediente ligado; en ese caso se agrupa
// por nombre de cuenta para que igual se pueda aislar.
const employeeKey = (item: AcknowledgementBoardItem): string =>
  item.employee_id !== null ? `e:${item.employee_id}` : `u:${item.employee_name}`;

const buildEmployeeOptions = (items: AcknowledgementBoardItem[]): SearchableOption[] => {
  const byKey = new Map<string, SearchableOption>();
  items.forEach((item) => {
    const key = employeeKey(item);
    if (!byKey.has(key)) {
      byKey.set(key, {
        value: key,
        label: item.employee_name || `#${item.employee_id ?? '—'}`,
        ...(item.employee_code ? { hint: item.employee_code } : {}),
      });
    }
  });
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
};

// Paginacion en cliente: el tablero ya trae todas las filas (los filtros por
// fase y documento se derivan de ellas), asi que solo se trocea lo visible.
const PAGE_SIZE_OPTIONS = [30, 50, 100] as const;
const DEFAULT_PAGE_SIZE: (typeof PAGE_SIZE_OPTIONS)[number] = 30;

const SELECT_CLASS =
  'w-full rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/92 px-3 py-2 text-sm text-[var(--color-brand-700)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]';

const SourceBadge = ({ item }: { item: AcknowledgementBoardItem }) => {
  const Icon = item.induction_phase
    ? GraduationCap
    : item.source === 'reading_room'
      ? BookOpenCheck
      : FileText;
  const tone = item.induction_phase
    ? 'bg-violet-50 text-violet-700'
    : item.source === 'reading_room'
      ? 'bg-indigo-50 text-indigo-700'
      : 'bg-slate-100 text-slate-700';
  return (
    <span
      className={`inline-flex max-w-[200px] items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
      title={item.induction_phase ? `${item.source_label} · ${item.induction_phase}` : item.source_label}
    >
      <Icon size={12} className="shrink-0" />
      <span className="truncate">{item.source_label}</span>
    </span>
  );
};

const formatStamp = (value: string | null): string =>
  value
    ? new Date(value).toLocaleString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '—';

export const RhAcknowledgementsPage = () => {
  const [items, setItems] = useState<AcknowledgementBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<AcknowledgementStatus | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<AcknowledgementSource | 'all'>('all');
  // '' = sin filtro (convencion de SearchableSelect).
  const [employeeFilter, setEmployeeFilter] = useState<string>('');
  const [phaseFilter, setPhaseFilter] = useState<string>('');
  const [documentFilter, setDocumentFilter] = useState<string>('');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(
        await listAcknowledgements({
          status: statusFilter === 'all' ? null : statusFilter,
          source: sourceFilter === 'all' ? null : sourceFilter,
        }),
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron cargar los acuses.'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sourceFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCancel = async (item: AcknowledgementBoardItem) => {
    const confirmed = await confirmAction(
      'Cancelar acuse',
      `¿Cancelar el acuse de "${item.document_title || 'este documento'}" para ${
        item.employee_name || 'el colaborador'
      }? Dejará de verlo entre sus pendientes.`,
      'Cancelar acuse',
    );
    if (!confirmed) {
      return;
    }
    try {
      await cancelAcknowledgement(item.id);
      toast.success('Acuse cancelado.');
      void load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cancelar el acuse.'));
    }
  };

  const handleOpenSignedCopy = async (item: AcknowledgementBoardItem) => {
    const key = `${item.source}-${item.id}`;
    setOpeningId(key);
    try {
      const url = await getAcknowledgementSignedCopyUrl(item.source, item.id);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo abrir el acuse firmado.'));
    } finally {
      setOpeningId(null);
    }
  };

  const employeeOptions = useMemo(() => buildEmployeeOptions(items), [items]);
  const phaseOptions = useMemo(() => buildPhaseOptions(items), [items]);
  const documentOptions = useMemo(() => buildDocumentOptions(items), [items]);

  // Si el filtro apunta a una opcion que ya no existe (cambio de estado u
  // origen en el servidor), se vuelve a "todas" para no dejar la tabla vacia
  // sin explicacion.
  useEffect(() => {
    if (employeeFilter && !employeeOptions.some((option) => option.value === employeeFilter)) {
      setEmployeeFilter('');
    }
  }, [employeeFilter, employeeOptions]);

  useEffect(() => {
    if (phaseFilter && !phaseOptions.some((option) => option.value === phaseFilter)) {
      setPhaseFilter('');
    }
  }, [phaseFilter, phaseOptions]);

  useEffect(() => {
    if (documentFilter && !documentOptions.some((option) => option.value === documentFilter)) {
      setDocumentFilter('');
    }
  }, [documentFilter, documentOptions]);

  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          (!employeeFilter || employeeKey(item) === employeeFilter) &&
          (!phaseFilter || phaseKey(item) === phaseFilter) &&
          (!documentFilter || item.document_title === documentFilter),
      ),
    [items, employeeFilter, phaseFilter, documentFilter],
  );

  // Cualquier cambio en lo que se ve (filtros, recarga, tamano) vuelve a la
  // primera pagina; asi nunca queda una pagina fuera de rango.
  useEffect(() => {
    setPage(1);
  }, [visibleItems, pageSize]);

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = useMemo(
    () => visibleItems.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [visibleItems, currentPage, pageSize],
  );

  // Resumen de cumplimiento: lo primero que quiere ver RH. Responde a todos
  // los filtros, incluidos fase y documento.
  const summary = useMemo(() => {
    const signed = visibleItems.filter((item) => item.status === 'signed').length;
    const expired = visibleItems.filter((item) => item.status === 'expired').length;
    const open = visibleItems.filter((item) =>
      ['pending', 'in_progress', 'read'].includes(item.status),
    ).length;
    return { signed, expired, open, total: visibleItems.length };
  }, [visibleItems]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
            <Signature size={22} />
            Acuses de lectura
          </h1>
          <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
            Seguimiento de los documentos enviados a leer y firmar: documentos institucionales de
            RH y lecturas de la Sala de Lectura, incluidas las del Programa de Inducción.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/92 px-3 py-2 text-sm text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
        >
          <RefreshCw size={15} />
          Actualizar
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', value: summary.total, tone: 'text-[var(--color-brand-700)]' },
          { label: 'Firmados', value: summary.signed, tone: 'text-emerald-600' },
          { label: 'En curso', value: summary.open, tone: 'text-amber-600' },
          { label: 'Vencidos', value: summary.expired, tone: 'text-rose-600' },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 px-4 py-3 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              {card.label}
            </p>
            <p className={`mt-1 text-2xl font-bold ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatusFilter(option.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === option.value
                  ? 'bg-[var(--color-brand-700)] text-white'
                  : 'border border-[rgba(0,65,106,0.12)] bg-white/92 text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.28)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {SOURCE_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSourceFilter(option.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                sourceFilter === option.value
                  ? 'bg-[var(--color-brand-500)] text-white'
                  : 'border border-dashed border-[rgba(0,65,106,0.18)] bg-white/92 text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.28)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 pt-1 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr_auto]">
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Colaborador
            </span>
            <SearchableSelect
              value={employeeFilter}
              onChange={setEmployeeFilter}
              options={employeeOptions}
              placeholder="Todos los colaboradores"
              emptyLabel="Todos los colaboradores"
              searchPlaceholder="Buscar por nombre o clave..."
              disabled={loading}
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Fase de Inducción
            </span>
            <SearchableSelect
              value={phaseFilter}
              onChange={setPhaseFilter}
              options={phaseOptions}
              placeholder="Todas las fases"
              emptyLabel="Todas las fases"
              searchPlaceholder="Buscar fase..."
              disabled={loading}
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Documento
            </span>
            <SearchableSelect
              value={documentFilter}
              onChange={setDocumentFilter}
              options={documentOptions}
              placeholder="Todos los documentos"
              emptyLabel="Todos los documentos"
              searchPlaceholder="Buscar por código o título..."
              disabled={loading}
            />
          </div>
          <label className="block xl:w-32">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Filas por página
            </span>
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className={SELECT_CLASS}
              disabled={loading}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading && <p className="text-sm text-[var(--unilabor-neutral)]">Cargando…</p>}

      {!loading && visibleItems.length === 0 && (
        <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 px-5 py-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500" size={26} />
          <p className="mt-2 text-sm text-[var(--unilabor-neutral)]">
            No hay acuses con este filtro.
          </p>
        </div>
      )}

      {!loading && visibleItems.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 shadow-sm">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b border-[rgba(0,65,106,0.08)] text-left text-xs uppercase tracking-wide text-[var(--unilabor-neutral)]">
                <th className="px-4 py-3 font-semibold">Colaborador</th>
                <th className="px-4 py-3 font-semibold">Documento</th>
                <th className="px-4 py-3 font-semibold">Origen</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Avance</th>
                <th className="px-4 py-3 font-semibold">Plazo</th>
                <th className="px-4 py-3 font-semibold">Firmado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((item) => {
                const rowKey = `${item.source}-${item.id}`;
                const coverage =
                  item.pages_total > 0
                    ? Math.round((item.pages_seen_count / item.pages_total) * 100)
                    : 0;
                return (
                  <tr
                    key={rowKey}
                    className="border-b border-[rgba(0,65,106,0.05)] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[var(--color-brand-700)]">
                        {item.employee_name || `#${item.employee_id ?? '—'}`}
                      </p>
                      {item.employee_code && (
                        <p className="text-xs text-[var(--unilabor-neutral)]">
                          {item.employee_code}
                        </p>
                      )}
                    </td>
                    <td
                      className="max-w-[200px] truncate px-4 py-3 text-[var(--unilabor-neutral)]"
                      title={item.document_title}
                    >
                      {item.document_title || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge item={item} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          STATUS_STYLE[item.status]
                        }`}
                      >
                        {STATUS_LABEL[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-[var(--color-brand-500)]"
                            style={{ width: `${coverage}%` }}
                          />
                        </div>
                        <span className="text-xs text-[var(--unilabor-neutral)]">
                          {item.pages_seen_count}/{item.pages_total}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
                      <span className="inline-flex items-center gap-1">
                        {item.status === 'expired' ? (
                          <AlertTriangle size={12} className="text-rose-500" />
                        ) : (
                          <Clock size={12} />
                        )}
                        {formatStamp(item.deadline_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
                      {formatStamp(item.signed_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {item.status === 'signed' && item.signed_copy_available && (
                          <button
                            type="button"
                            disabled={openingId === rowKey}
                            onClick={() => void handleOpenSignedCopy(item)}
                            title="Abrir el acuse firmado (documento + hoja de firma)"
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
                          >
                            <FileCheck2 size={13} />
                            {openingId === rowKey ? 'Abriendo…' : 'Ver acuse firmado'}
                          </button>
                        )}
                        {item.source === 'institutional' &&
                          item.status !== 'signed' &&
                          item.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => void handleCancel(item)}
                              title="Cancelar acuse"
                              className="rounded-lg p-1.5 text-[var(--unilabor-neutral)] transition hover:bg-rose-50 hover:text-rose-600"
                            >
                              <X size={15} />
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-[rgba(0,65,106,0.08)]">
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              total={visibleItems.length}
              pageSize={pageSize}
              onPageChange={setPage}
              loading={loading}
            />
          </div>
        </div>
      )}
    </div>
  );
};
