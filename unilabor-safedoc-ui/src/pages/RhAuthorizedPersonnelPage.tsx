import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileDown, ListChecks, Loader2, RefreshCw, Search, Settings2, X } from 'lucide-react';
import { getAuthorizedPersonnel, getAuthorizedPersonnelPdfUrl } from '../api/service.api-rh-authorized-personnel';
import { getApiErrorMessage } from '../api/service.parsers';
import { AuthorizedPersonnelBoard } from '../components/rh/authorized-personnel/AuthorizedPersonnelBoard';
import { AuthorizedPersonnelTable } from '../components/rh/authorized-personnel/AuthorizedPersonnelTable';
import { PersonnelLevelsDrawer } from '../components/rh/authorized-personnel/PersonnelLevelsDrawer';
import { Pagination } from '../components/Pagination';
import type { AuthorizedPersonnelListing } from '../types/models';
import {
  EMPTY_AUTHORIZED_FILTERS,
  QUICK_FILTERS,
  filterAuthorizedPersonnel,
  uniqueValues,
  type AuthorizedPersonnelFilters,
} from '../utils/authorizedPersonnel';
import { formatDateOnly } from '../utils/competency';
import { notifyError } from '../utils/notify';
import { useHasPermission } from '../utils/permissions';

const SELECT = 'rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)]';
const PAGE_SIZE_OPTIONS = [30, 50, 70];
const BUTTON = 'inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50';

/**
 * Listado de personal autorizado (REH-REG-026). No se captura: cada fila
 * (colaborador + puesto) se llena sola cuando ese puesto cierra y autoriza su
 * REH-REG-003. Desde aquí se filtra, se corrige el nivel de autorización y se
 * genera el PDF con el formato controlado.
 */
export const RhAuthorizedPersonnelPage = () => {
  const [listing, setListing] = useState<AuthorizedPersonnelListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<AuthorizedPersonnelFilters>(EMPTY_AUTHORIZED_FILTERS);
  const [catalogsOpen, setCatalogsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]!);
  const canAuthorize = useHasPermission('RH.COMPETENCY.AUTHORIZE');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setListing(await getAuthorizedPersonnel());
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el listado de personal autorizado.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => (listing ? filterAuthorizedPersonnel(listing, filters) : []), [listing, filters]);
  const branches = useMemo(() => uniqueValues(listing?.rows.map((row) => row.branch_name) ?? []), [listing]);
  const areas = useMemo(() => uniqueValues(listing?.rows.map((row) => row.area_name) ?? []), [listing]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  // Si el filtro o una recarga dejan menos páginas, se muestra la última que exista.
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize), [rows, currentPage, pageSize]);
  const updateFilters = (change: (current: AuthorizedPersonnelFilters) => AuthorizedPersonnelFilters) => {
    setFilters(change);
    setPage(1);
  };
  const filtered = filters.search || filters.branch || filters.area || filters.focus !== 'ALL';

  const openPdf = async () => {
    setExporting(true);
    try {
      window.open(await getAuthorizedPersonnelPdfUrl(), '_blank', 'noopener');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo generar el PDF del listado.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            <ListChecks size={15} /> Recursos Humanos · REH-REG-026
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Personal autorizado</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Una fila por colaborador y puesto. Se llena sola al cerrar y autorizar la evaluación de competencia de cada puesto; los días
            son la cuenta regresiva de su vigencia.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {listing ? <span className="hidden text-[11px] text-[var(--unilabor-neutral)] md:inline">Corte al {formatDateOnly(listing.cutoff_date)}</span> : null}
          {canAuthorize ? (
            <button type="button" onClick={() => setCatalogsOpen(true)} className={BUTTON} title="Niveles de autorización y niveles organizacionales">
              <Settings2 size={15} /> Catálogos
            </button>
          ) : null}
          <button type="button" onClick={() => void openPdf()} disabled={exporting || !listing} className={BUTTON} title="Generar el PDF con el formato REH-REG-026">
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
          <AuthorizedPersonnelBoard listing={listing} focus={filters.focus} onFocus={(focus) => updateFilters((current) => ({ ...current, focus }))} />

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
              <input
                value={filters.search}
                onChange={(event) => updateFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Buscar colaborador o puesto"
                aria-label="Buscar colaborador o puesto"
                className={`${SELECT} w-full pl-9`}
              />
            </label>
            <select value={filters.branch} onChange={(event) => updateFilters((current) => ({ ...current, branch: event.target.value }))} aria-label="Sede" className={SELECT}>
              <option value="">Todas las sedes</option>
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
            <select value={filters.area} onChange={(event) => updateFilters((current) => ({ ...current, area: event.target.value }))} aria-label="Área" className={SELECT}>
              <option value="">Todas las áreas</option>
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => updateFilters(() => EMPTY_AUTHORIZED_FILTERS)}
              title="Quitar filtros"
              aria-label="Quitar filtros"
              className={`${BUTTON} ${filtered ? '' : 'invisible'}`}
            >
              <X size={15} />
            </button>
            <span className="ml-auto text-xs text-[var(--unilabor-neutral)]">
              {rows.length} de {listing.rows.length} filas
            </span>
          </div>

          <div className="inline-flex max-w-full flex-wrap overflow-hidden rounded-xl border border-[rgba(0,65,106,0.16)] shadow-sm" role="group" aria-label="Búsqueda rápida">
            {QUICK_FILTERS.map((quick) => (
              <button
                key={quick.focus}
                type="button"
                title={quick.hint}
                aria-pressed={filters.focus === quick.focus}
                onClick={() => updateFilters((current) => ({ ...current, focus: current.focus === quick.focus ? 'ALL' : quick.focus }))}
                className={`-ml-px border-l border-[rgba(0,65,106,0.16)] px-3.5 py-2 text-xs font-bold transition first:ml-0 first:border-l-0 ${
                  filters.focus === quick.focus ? `${quick.active} shadow-inner` : quick.idle
                }`}
              >
                {quick.label}
              </button>
            ))}
          </div>

          <AuthorizedPersonnelTable rows={pageRows} levels={listing.authorization_levels} canEditLevel={canAuthorize} onChanged={() => void load()} />
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
          <p className="text-[11px] text-[var(--unilabor-neutral)]">El PDF incluye siempre el listado completo, sin los filtros de pantalla.</p>
        </>
      ) : null}

      <PersonnelLevelsDrawer open={catalogsOpen} onClose={() => setCatalogsOpen(false)} onChanged={() => void load()} />
    </div>
  );
};
