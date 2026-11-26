import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileDown, Loader2, PenLine, RefreshCw, Search, Settings2, X } from 'lucide-react';
import { getSignatureRegistry, getSignatureRegistryPdfUrl } from '../api/service.api-rh-signature-registry';
import { getApiErrorMessage } from '../api/service.parsers';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { Pagination } from '../components/Pagination';
import { DisciplinesDrawer } from '../components/rh/signature-registry/DisciplinesDrawer';
import { SignatureRegistryDrawer } from '../components/rh/signature-registry/SignatureRegistryDrawer';
import { SignatureRegistryTable } from '../components/rh/signature-registry/SignatureRegistryTable';
import type { SignatureRegistryListing, SignatureRegistryStatus } from '../types/models';
import { formatDateOnly } from '../utils/competency';
import { notifyError } from '../utils/notify';
import {
  ACTIVE_STATUSES,
  EMPTY_SIGNATURE_FILTERS,
  NO_DISCIPLINE,
  STATUS_LABEL,
  STATUS_OPTIONS,
  STATUS_TONE,
  STATUS_TONE_CLASS,
  describeFilters,
  filterSignatureRegistry,
  hasActiveFilters,
  uniqueValues,
  type SignatureRegistryFilters,
} from '../utils/signatureRegistry';

const SELECT = 'rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)]';
const BUTTON = 'inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50';
const PAGE_SIZE_OPTIONS = [30, 50, 70];
const SUMMARY_ORDER: SignatureRegistryStatus[] = ['VIGENTE', 'POR_VENCER', 'VENCIDA', 'SIN_EVALUACION', 'INCOMPLETA', 'DADA_DE_BAJA'];

/**
 * Registro de firmas autorizadas (REH-REG-027). Se deriva del Listado de
 * personal autorizado: una fila por colaborador y puesto autorizado. Aquí RH
 * captura la disciplina, el alcance de firma y los especímenes, y genera el PDF.
 */
export const RhSignatureRegistryPage = () => {
  const [listing, setListing] = useState<SignatureRegistryListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<SignatureRegistryFilters>(EMPTY_SIGNATURE_FILTERS);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]!);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setListing(await getSignatureRegistry());
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el registro de firmas autorizadas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => (listing ? filterSignatureRegistry(listing, filters) : []), [listing, filters]);
  const branches = useMemo(() => uniqueValues(listing?.rows.map((row) => row.branch_name) ?? []), [listing]);
  // Disciplinas del filtro: las activas y las inactivas que alguna fila aún tenga.
  const disciplineOptions = useMemo(() => {
    const inUse = new Set(listing?.rows.map((row) => row.discipline_id) ?? []);
    return (listing?.disciplines ?? []).filter((discipline) => discipline.is_active || inUse.has(discipline.id));
  }, [listing]);
  // La fila en edición se toma del listado vigente: así el drawer ve los cambios tras recargar.
  const editingRow = useMemo(() => listing?.rows.find((row) => `${row.employee_id}:${row.position_id}` === editingKey) ?? null, [listing, editingKey]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize), [rows, currentPage, pageSize]);
  const filtered = hasActiveFilters(filters);
  const updateFilters = (change: (current: SignatureRegistryFilters) => SignatureRegistryFilters) => {
    setFilters(change);
    setPage(1);
  };
  // Vacío = todos marcados en el dropdown; marcar todos vuelve a dejarlo vacío (sin filtro).
  const changeStatuses = (values: string[]) =>
    updateFilters((current) => ({ ...current, statuses: values.length >= ACTIVE_STATUSES.length ? [] : (values as SignatureRegistryStatus[]) }));

  // El PDF lleva exactamente las filas de la tabla (todas sus páginas), con los filtros impresos.
  const openPdf = async () => {
    if (!listing) return;
    setExporting(true);
    try {
      window.open(await getSignatureRegistryPdfUrl(rows, describeFilters(filters, listing)), '_blank', 'noopener');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo generar el PDF del registro.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            <PenLine size={15} /> Recursos Humanos · REH-REG-027
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Firmas autorizadas</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Una fila por colaborador y puesto autorizado en el Listado de personal autorizado. La fecha de alta es la de su carta REH-REG-008; aquí se
            capturan la disciplina, qué está autorizado a firmar y los especímenes de firma y rúbrica.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {listing ? <span className="hidden text-[11px] text-[var(--unilabor-neutral)] md:inline">Corte al {formatDateOnly(listing.cutoff_date)}</span> : null}
          <button type="button" onClick={() => setCatalogOpen(true)} className={BUTTON} title="Catálogo de disciplinas o áreas">
            <Settings2 size={15} /> Disciplinas
          </button>
          <button
            type="button"
            onClick={() => void openPdf()}
            disabled={exporting || !listing || rows.length === 0}
            className={BUTTON}
            title={filtered ? `PDF REH-REG-027 con las ${rows.length} filas de la tabla (extracto)` : 'PDF REH-REG-027 con el registro completo'}
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} PDF
          </button>
          <button type="button" onClick={() => void load()} className={BUTTON} title="Actualizar" aria-label="Actualizar">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading && !listing ? (
        <div className="flex items-center justify-center rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 py-20 shadow-xl">
          <Loader2 size={22} className="animate-spin text-[var(--unilabor-neutral)]" />
        </div>
      ) : listing ? (
        <>
          <div className="flex flex-wrap gap-2">
            {SUMMARY_ORDER.map((status) => (
              <span key={status} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${STATUS_TONE_CLASS[STATUS_TONE[status]]}`}>
                {STATUS_LABEL[status]} <strong>{listing.summary.by_status[status]}</strong>
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
              <input
                value={filters.search}
                onChange={(event) => updateFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Buscar colaborador, puesto o alcance"
                aria-label="Buscar colaborador, puesto o alcance"
                className={`${SELECT} w-full pl-9`}
              />
            </label>
            <select value={filters.branch} onChange={(event) => updateFilters((current) => ({ ...current, branch: event.target.value }))} aria-label="Sucursal" className={SELECT}>
              <option value="">Todas las sucursales</option>
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
            <select value={filters.discipline} onChange={(event) => updateFilters((current) => ({ ...current, discipline: event.target.value }))} aria-label="Disciplina" className={SELECT}>
              <option value="">Todas las disciplinas</option>
              <option value={NO_DISCIPLINE}>Sin disciplina</option>
              {disciplineOptions.map((discipline) => (
                <option key={discipline.id} value={discipline.id}>
                  {discipline.name}
                </option>
              ))}
            </select>
            <div className="w-[220px]" title="Estado (uno o varios)">
              <MultiSelectFilter
                values={filters.statuses.length > 0 ? filters.statuses : ACTIVE_STATUSES}
                defaultValues={ACTIVE_STATUSES}
                options={STATUS_OPTIONS}
                onChange={changeStatuses}
                allLabel="Todos los estados"
                triggerClassName={`${SELECT} w-full`}
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--color-brand-700)]" title="Mostrar también las filas históricas (colaboradores de baja o puestos terminados)">
              <span className={`relative h-5 w-9 rounded-full transition ${filters.showRetired ? 'bg-slate-500' : 'bg-slate-300'}`}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={filters.showRetired}
                  onChange={(event) => updateFilters((current) => ({ ...current, showRetired: event.target.checked }))}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Ver dadas de baja"
                />
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${filters.showRetired ? 'left-[18px]' : 'left-0.5'}`} />
              </span>
              Ver dadas de baja
            </label>
            <button type="button" onClick={() => updateFilters(() => EMPTY_SIGNATURE_FILTERS)} title="Quitar filtros" aria-label="Quitar filtros" className={`${BUTTON} ${filtered ? '' : 'invisible'}`}>
              <X size={15} />
            </button>
            <span className="ml-auto text-xs text-[var(--unilabor-neutral)]">
              {rows.length} de {listing.rows.length} filas
            </span>
          </div>

          <SignatureRegistryTable rows={pageRows} onEdit={(row) => setEditingKey(`${row.employee_id}:${row.position_id}`)} />
          {rows.length > PAGE_SIZE_OPTIONS[0]! ? (
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              total={rows.length}
              pageSize={pageSize}
              onPageChange={setPage}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          ) : null}
          <p className="text-[11px] text-[var(--unilabor-neutral)]">
            {filtered || listing.summary.retired_rows > 0
              ? `El PDF saldrá con las ${rows.length} filas de la tabla y la leyenda de extracto con los filtros aplicados.`
              : 'El PDF incluye el registro completo; si filtras la tabla, saldrá solo lo que ves.'}
          </p>
        </>
      ) : null}

      <SignatureRegistryDrawer row={editingRow} disciplines={listing?.disciplines ?? []} onClose={() => setEditingKey(null)} onChanged={() => void load()} />
      <DisciplinesDrawer open={catalogOpen} onClose={() => setCatalogOpen(false)} onChanged={() => void load()} />
    </div>
  );
};
