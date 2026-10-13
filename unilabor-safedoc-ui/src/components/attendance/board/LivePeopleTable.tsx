import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import type { LiveBoard } from '../../../api/service.api-attendance-boards';
import { Pagination } from '../../Pagination';
import { formatTime } from '../shared/format';
import { LIVE_STATUS_META, sortPeopleByStatus } from './boardHelpers';
import { EmptyNote, SectionCard, StatusDot } from './BoardParts';
import { inputClass, tdClass, thClass } from './boardStyles';

const PAGE_SIZES = [10, 20, 30] as const;

const normalize = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const LivePeopleTable = ({ board }: { board: LiveBoard }) => {
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const people = useMemo(() => {
    const sorted = sortPeopleByStatus(board.people);
    const q = normalize(query.trim());
    return q ? sorted.filter((p) => normalize(`${p.full_name} ${p.code} ${p.area ?? ''}`).includes(q)) : sorted;
  }, [board.people, query]);
  const totalPages = Math.max(1, Math.ceil(people.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = people.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <SectionCard title="¿Quién está?" icon={<Users size={18} />}
      aside={
        <label className="relative block w-44 sm:w-56">
          <span className="sr-only">Buscar colaborador</span>
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Buscar…" className={`${inputClass} !py-1.5 pl-8`} />
        </label>
      }>
      {board.people.length === 0 ? (
        <EmptyNote>No hay colaboradores con control de asistencia para esta fecha y sucursal.</EmptyNote>
      ) : people.length === 0 ? (
        <EmptyNote>Ningún colaborador coincide con la búsqueda.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[rgba(0,65,106,0.08)]">
            <thead className="bg-white">
              <tr>
                <th className={thClass}>Colaborador</th>
                <th className={thClass}>Estado</th>
                <th className={thClass}>Esperado</th>
                <th className={thClass}>Entrada</th>
                <th className={thClass}>Salida</th>
                <th className={`${thClass} text-right`}>Retardo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(0,65,106,0.06)]">
              {visible.map((person) => {
                const meta = LIVE_STATUS_META[person.status] ?? LIVE_STATUS_META.no_schedule;
                return (
                  <tr key={person.employee_id}>
                    <td className={tdClass}>
                      <span className="block font-semibold text-[var(--color-brand-700)]">{person.full_name}</span>
                      <span className="block text-xs text-[var(--unilabor-neutral)]">
                        {person.code}{person.area ? ` · ${person.area}` : ''}{person.branch_name ? ` · ${person.branch_name}` : ''}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className="inline-flex items-center gap-2 whitespace-nowrap font-medium" style={{ color: meta.color }}>
                        <StatusDot color={meta.color} />
                        {meta.label}
                      </span>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {person.expected_start ? `${person.expected_start} – ${person.expected_end ?? '—'}` : '—'}
                    </td>
                    <td className={tdClass}>{formatTime(person.clock_in_at)}</td>
                    <td className={tdClass}>{formatTime(person.clock_out_at)}</td>
                    <td className={`${tdClass} text-right font-semibold`}>
                      {person.late_minutes > 0 ? `${person.late_minutes} min` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <label className="flex items-center gap-2 px-4 text-xs text-[var(--color-brand-700)]">
              Por página
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 px-2 py-1 text-xs font-semibold"
              >
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <Pagination page={currentPage} totalPages={totalPages} total={people.length} pageSize={pageSize} onPageChange={setPage} />
          </div>
        </div>
      )}
    </SectionCard>
  );
};
