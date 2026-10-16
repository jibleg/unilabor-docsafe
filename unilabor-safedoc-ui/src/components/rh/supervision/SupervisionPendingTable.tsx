import { useMemo } from 'react';
import { ClipboardPen, Loader2, PlayCircle } from 'lucide-react';
import type { SupervisionPendingRow } from '../../../types/models';
import { formatPct } from './supervision-ui';

interface SupervisionPendingTableProps {
  rows: SupervisionPendingRow[];
  loading: boolean;
  openingEnrollmentId: number | null;
  onOpen: (row: SupervisionPendingRow) => void;
}

/** Colaboradores con la Fase 6 en curso, agrupados por área, listos para aplicarles el ANA-REG-060. */
export const SupervisionPendingTable = ({ rows, loading, openingEnrollmentId, onOpen }: SupervisionPendingTableProps) => {
  const groups = useMemo(() => {
    const map = new Map<string, SupervisionPendingRow[]>();
    for (const row of rows) {
      const key = row.area?.trim() || 'Sin área registrada';
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()];
  }, [rows]);

  if (loading) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
        <Loader2 size={14} className="animate-spin" /> Cargando pendientes…
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-6 text-center text-sm text-[var(--unilabor-neutral)]">
        Nadie tiene la Fase 6 en curso sin lista final. Los colaboradores entran a la Fase 6 al acreditar la Fase 5 de todos sus puestos.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map(([area, items]) => (
        <section key={area} className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)]">
          <header className="flex items-center justify-between bg-[rgba(238,245,250,0.9)] px-4 py-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-brand-700)]">{area}</p>
            <span className="text-[11px] font-semibold text-[var(--unilabor-neutral)]">{items.length} pendiente(s)</span>
          </header>
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase text-[var(--unilabor-neutral)]">
              <tr>
                <th className="px-4 py-2">Colaborador</th>
                <th className="px-3 py-2">Puesto</th>
                <th className="px-3 py-2">Sucursal</th>
                <th className="px-3 py-2">En fase</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
              {items.map((row) => {
                const opening = openingEnrollmentId === row.enrollment_id;
                return (
                  <tr key={row.enrollment_id} className="hover:bg-[rgba(248,251,253,0.9)]">
                    <td className="px-4 py-2">
                      <p className="font-semibold text-[var(--unilabor-ink)]">{row.employee_name}</p>
                      <p className="text-[11px] text-[var(--unilabor-neutral)]">{row.employee_code}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-[var(--color-brand-700)]">{row.position_code}</p>
                      <p className="text-[11px] text-[var(--unilabor-neutral)]">{row.position_name}</p>
                    </td>
                    <td className="px-3 py-2 text-xs">{row.branch_name ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">{row.days_in_phase !== null ? `${row.days_in_phase} d` : '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.draft_checklist_id ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">Borrador abierto</span>
                      ) : row.evaluation_status === 'passed' ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                          Acreditada {formatPct(row.evaluation_percentage)}
                        </span>
                      ) : row.evaluation_status === 'failed' ? (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
                          No acreditó {formatPct(row.last_closed_pct ?? row.evaluation_percentage)}
                        </span>
                      ) : row.closed_count > 0 ? (
                        <span className="text-[var(--unilabor-neutral)]">{row.closed_count} supervisión(es) intermedia(s)</span>
                      ) : (
                        <span className="text-[var(--unilabor-neutral)]">Sin lista</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onOpen(row)}
                        disabled={opening}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-brand-700)] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60"
                        title={row.draft_checklist_id ? 'Continuar el borrador' : 'Abrir lista ANA-REG-060'}
                      >
                        {opening ? <Loader2 size={13} className="animate-spin" /> : row.draft_checklist_id ? <PlayCircle size={13} /> : <ClipboardPen size={13} />}
                        {row.draft_checklist_id ? 'Continuar' : 'Aplicar lista'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
};
