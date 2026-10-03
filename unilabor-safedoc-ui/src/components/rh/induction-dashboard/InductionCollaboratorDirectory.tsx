import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Search } from 'lucide-react';
import { getInductionDirectory } from '../../../api/service.api-rh-induction-dashboard';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { Pagination } from '../../Pagination';
import type { InductionDirectoryPage, InductionDirectoryRow, InductionDirectoryStatus } from '../../../types/models';
import { STAGE_GROUP_META, STAGE_META } from '../../../utils/inductionDashboard';
import { notifyError } from '../../../utils/notify';

const PHASES = [1, 2, 3, 4, 5, 6, 7];
const PAGE_SIZE = 15;

const STATUS_TABS: Array<{ value: InductionDirectoryStatus; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'IN_PROGRESS', label: 'En curso' },
  { value: 'STALLED', label: 'Esperan siguiente fase' },
  { value: 'COMPLETED', label: 'Concluyeron 1-7' },
  { value: 'ATTENTION', label: 'Requieren atención' },
];

interface InductionCollaboratorDirectoryProps {
  selectedEmployeeId: number | null;
  refreshKey: number;
  onSelect: (employeeId: number) => void;
}

/** Tira de 7 segmentos con la etapa de cada fase (gris = no inscrito). */
const PhaseStrip = ({ row }: { row: InductionDirectoryRow }) => (
  <div className="mt-1.5 grid grid-cols-7 gap-0.5">
    {PHASES.map((phaseNumber) => {
      const phase = row.phases.find((item) => item.phase_number === phaseNumber);
      const color = phase ? STAGE_GROUP_META[STAGE_META[phase.stage].group].color : undefined;
      return (
        <span
          key={phaseNumber}
          title={phase ? `Fase ${phaseNumber}: ${STAGE_META[phase.stage].label}` : `Fase ${phaseNumber}: sin inscribir`}
          className="flex h-4 items-center justify-center rounded text-[9px] font-bold text-white"
          style={{ backgroundColor: color ?? 'rgba(0,65,106,0.1)', color: color ? '#fff' : 'var(--unilabor-neutral)' }}
        >
          F{phaseNumber}
        </span>
      );
    })}
  </div>
);

/**
 * Directorio de colaboradores inscritos en la Inducción (Fases 1-7): búsqueda,
 * filtro por estado global y estado de cada fase de un vistazo.
 */
export const InductionCollaboratorDirectory = ({ selectedEmployeeId, refreshKey, onSelect }: InductionCollaboratorDirectoryProps) => {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState<InductionDirectoryStatus>('ALL');
  const [page, setPage] = useState(1);
  const [directory, setDirectory] = useState<InductionDirectoryPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    getInductionDirectory({ q: debouncedQ || undefined, status, page, limit: PAGE_SIZE })
      .then((data) => {
        if (!cancelled) setDirectory(data);
      })
      .catch((error) => {
        if (!cancelled) notifyError(getApiErrorMessage(error, 'No se pudo cargar el listado de colaboradores.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, status, page, refreshKey]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
            setLoading(true);
          }}
          placeholder="Buscar por nombre, clave, puesto o sucursal…"
          className="w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white py-2 pl-9 pr-3 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-500)]"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
              setLoading(true);
            }}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              status === tab.value
                ? 'bg-[var(--color-brand-700)] text-white'
                : 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.3)]'
            }`}
          >
            {tab.label}
            {directory ? <span className="ml-1 opacity-80">{directory.status_counts[tab.value]}</span> : null}
          </button>
        ))}
      </div>

      {loading && !directory ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin text-[var(--unilabor-neutral)]" />
        </div>
      ) : directory && directory.rows.length === 0 ? (
        <p className="rounded-xl bg-[rgba(248,251,253,0.96)] px-3 py-6 text-center text-xs text-[var(--unilabor-neutral)]">
          No hay colaboradores que coincidan con la búsqueda.
        </p>
      ) : (
        <ul className={`space-y-1.5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {directory?.rows.map((row) => {
            const active = row.employee_id === selectedEmployeeId;
            return (
              <li key={row.employee_id}>
                <button
                  type="button"
                  onClick={() => onSelect(row.employee_id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    active
                      ? 'border-[var(--color-brand-500)] bg-white shadow-sm'
                      : 'border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] hover:border-[rgba(0,65,106,0.2)] hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--color-brand-700)]">{row.employee_name}</p>
                      <p className="truncate text-[11px] text-[var(--unilabor-neutral)]">
                        {row.employee_code}
                        {row.position_name ? ` · ${row.position_name}` : ''}
                        {row.branch_name ? ` · ${row.branch_name}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-[var(--color-brand-700)]">{row.approved_count}/7</p>
                      {row.attention_count > 0 ? (
                        <p className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-600">
                          <AlertTriangle size={10} /> {row.attention_count}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <PhaseStrip row={row} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {directory && directory.total_pages > 1 ? (
        <Pagination
          page={directory.page}
          totalPages={directory.total_pages}
          total={directory.total}
          pageSize={directory.limit}
          onPageChange={(next) => {
            setPage(next);
            setLoading(true);
          }}
          loading={loading}
          compact
        />
      ) : null}
    </div>
  );
};
