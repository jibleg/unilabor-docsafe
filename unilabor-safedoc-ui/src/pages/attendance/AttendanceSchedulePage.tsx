import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Copy, History, RefreshCw, Search } from 'lucide-react';
import { getApiErrorMessage } from '../../api/service';
import { getScheduleWeek, type ScheduleChip, type ScheduleDay, type ScheduleEmployeeRow, type ScheduleWeek } from '../../api/service.api-attendance-schedule';
import { listAttendanceBranches, type AttendanceBranch } from '../../api/service.api-attendance-common';
import { Pagination } from '../../components/Pagination';
import { Tooltip } from '../../components/Tooltip';
import { AssignModal, type AssignTarget } from '../../components/attendance/schedule/AssignModal';
import { CopyModal } from '../../components/attendance/schedule/CopyModal';
import { EditAssignmentModal, type EditTarget } from '../../components/attendance/schedule/EditAssignmentModal';
import { ScheduleGrid } from '../../components/attendance/schedule/ScheduleGrid';
import { ScheduleLogPanel } from '../../components/attendance/schedule/ScheduleLogPanel';
import { formatHoursValue, orderedWeekdays } from '../../components/attendance/schedule/scheduleHelpers';
import { cardClass, inputClass, primaryButton, secondaryButton } from '../../components/attendance/schedule/ui';
import { addDaysIso, formatDate, todayIso } from '../../components/attendance/shared/format';
import { useHasPermission } from '../../utils/permissions';

const PAGE_SIZE = 50;

export const AttendanceSchedulePage = () => {
  const canWrite = useHasPermission('ATTENDANCE.SCHEDULES.WRITE');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'log' ? 'log' : 'calendar';
  const week = params.get('week') ?? '';
  const branch = params.get('branch') ?? '';
  const urlSearch = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [searchText, setSearchText] = useState(urlSearch);
  const [data, setData] = useState<ScheduleWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<AttendanceBranch[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<Map<number, string>>(new Map());
  const [assign, setAssign] = useState<{ employees: AssignTarget[]; date: string } | null>(null);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [logKey, setLogKey] = useState(0);
  const today = useMemo(() => todayIso(), []);

  const patchParams = useCallback(
    (changes: Record<string, string | null>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          if (resetPage && !('page' in changes)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Busqueda con debounce hacia la query string.
  useEffect(() => {
    if (searchText.trim() === urlSearch) return;
    const handle = window.setTimeout(() => patchParams({ q: searchText.trim() || null }), 350);
    return () => window.clearTimeout(handle);
  }, [searchText, urlSearch, patchParams]);

  useEffect(() => {
    listAttendanceBranches().then(setBranches).catch(() => setBranches([]));
  }, []);

  const seq = useRef(0);
  useEffect(() => {
    if (tab !== 'calendar') return;
    const mine = ++seq.current;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getScheduleWeek({ week: week || undefined, branch_id: branch ? Number(branch) : undefined, search: urlSearch || undefined, page, limit: PAGE_SIZE });
        if (mine === seq.current) setData(res);
      } catch (err) {
        if (mine === seq.current) setError(getApiErrorMessage(err, 'No se pudo cargar el calendario.'));
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    };
    void run();
  }, [tab, week, branch, urlSearch, page, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const afterChange = () => {
    setAssign(null);
    setEdit(null);
    setSelected(new Map());
    setLogKey((k) => k + 1);
    reload();
  };

  const baseWeek = data?.week_start_date ?? week ?? today;
  const goWeek = (offset: number) => patchParams({ week: addDaysIso(baseWeek || today, offset * 7) });
  const dates = data?.days ?? [];
  const rows = data?.data ?? [];
  const weekdayOrder = useMemo(() => orderedWeekdays(data?.week_start_date), [data?.week_start_date]);
  const activeShifts = (data?.shifts ?? []).filter((s) => s.is_active);

  const toggleRow = (row: ScheduleEmployeeRow) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(row.employee_id)) next.delete(row.employee_id);
      else next.set(row.employee_id, row.full_name);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Map(prev);
      const all = rows.every((r) => next.has(r.employee_id));
      rows.forEach((r) => (all ? next.delete(r.employee_id) : next.set(r.employee_id, r.full_name)));
      return next;
    });

  const hasExistingOnDate = (employeeIds: number[]) => (date: string): boolean | null => {
    if (!dates.includes(date)) return null;
    return rows.some((r) => employeeIds.includes(r.employee_id) && r.days.some((d) => d.date === date && d.chips.some((c) => c.shift_id !== null)));
  };

  const openChip = (row: ScheduleEmployeeRow, day: ScheduleDay, chip: ScheduleChip) =>
    setEdit({ employeeName: row.full_name, date: day.date, chip });

  const selectedList: AssignTarget[] = [...selected.entries()].map(([id, name]) => ({ id, name }));
  const rangeLabel = dates.length ? `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}` : '—';
  const firstWeekDate = dates[0] ?? week ?? today;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-brand-700)]">Calendario de horarios</h1>
          <p className="text-sm text-[var(--unilabor-neutral)]">Programación semanal de turnos y descansos.</p>
        </div>
        <div className="inline-flex rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 p-0.5" role="tablist">
          {([['calendar', 'Calendario', CalendarClock], ['log', 'Bitácora de cambios', History]] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => patchParams({ tab: key === 'log' ? 'log' : null }, false)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === key ? 'bg-[var(--color-brand-700)] text-white' : 'text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.25)]'}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'log' ? (
        <ScheduleLogPanel refreshKey={logKey} />
      ) : (
        <>
          <div className={`${cardClass} flex flex-wrap items-center gap-2 p-3`}>
            <div className="flex items-center gap-1">
              <button type="button" className={secondaryButton} aria-label="Semana anterior" onClick={() => goWeek(-1)}><ChevronLeft size={16} /></button>
              <button type="button" className={secondaryButton} onClick={() => patchParams({ week: null })}>Hoy</button>
              <button type="button" className={secondaryButton} aria-label="Semana siguiente" onClick={() => goWeek(1)}><ChevronRight size={16} /></button>
            </div>
            <span className="min-w-40 text-sm font-bold text-[var(--color-brand-700)]">{rangeLabel}</span>
            <div className="relative min-w-44 flex-1 sm:max-w-xs">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
              <input className={`${inputClass} !pl-9`} placeholder="Nombre o número" aria-label="Buscar colaborador" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
            <select className={`${inputClass} !w-auto`} aria-label="Sucursal" value={branch} onChange={(e) => patchParams({ branch: e.target.value || null })}>
              <option value="">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button type="button" className={secondaryButton} aria-label="Actualizar" onClick={reload}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
            {canWrite && (
              <div className="ml-auto flex flex-wrap gap-2">
                <button type="button" className={secondaryButton} onClick={() => setCopyOpen(true)}><Copy size={15} /> Copiar horario</button>
                <Tooltip content={<span className="text-xs text-white">Marca colaboradores en la tabla para programarlos juntos.</span>} className={selected.size === 0 ? 'inline-block' : 'hidden'}>
                  <button type="button" className={primaryButton} disabled>
                    <CalendarPlus size={15} /> Programar a 0
                  </button>
                </Tooltip>
                {selected.size > 0 && (
                  <button type="button" className={primaryButton} onClick={() => setAssign({ employees: selectedList, date: firstWeekDate })}>
                    <CalendarPlus size={15} /> Programar a {selected.size}
                  </button>
                )}
              </div>
            )}
          </div>

          {activeShifts.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-xs text-[var(--unilabor-ink)]" aria-label="Leyenda de turnos">
              {activeShifts.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: s.color_hex }} />
                  <strong>{s.name}</strong>
                  <span className="tabular-nums text-[var(--unilabor-neutral)]">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-dashed border-slate-500" /> <strong>Descanso</strong></span>
            </div>
          )}

          {error ? (
            <div className={`${cardClass} flex flex-col items-center gap-3 p-8 text-center`}>
              <p className="text-sm text-red-700">{error}</p>
              <button type="button" className={secondaryButton} onClick={reload}>Reintentar</button>
            </div>
          ) : !data ? (
            <div className={`${cardClass} p-8 text-center text-sm text-[var(--unilabor-neutral)]`}>Cargando calendario…</div>
          ) : rows.length === 0 ? (
            <div className={`${cardClass} p-10 text-center text-sm text-[var(--unilabor-neutral)]`}>
              No hay colaboradores habilitados con esos filtros. Habilítalos en Colaboradores para programarles horario.
            </div>
          ) : (
            <div className={loading ? 'opacity-60 transition' : 'transition'}>
              <ScheduleGrid
                rows={rows}
                dates={dates}
                today={today}
                maxShiftsPerDay={data.max_shifts_per_day}
                canWrite={canWrite}
                selected={new Set(selected.keys())}
                onToggleRow={toggleRow}
                onToggleAll={toggleAll}
                onCellClick={(row, date) => setAssign({ employees: [{ id: row.employee_id, name: row.full_name }], date })}
                onChipClick={openChip}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1 text-xs text-[var(--unilabor-neutral)]">
                <span>Horas netas de la semana de los visibles: <strong>{formatHoursValue(rows.reduce((s, r) => s + r.week_hours, 0))}</strong></span>
              </div>
              <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={PAGE_SIZE} onPageChange={(p) => patchParams({ page: p > 1 ? String(p) : null }, false)} loading={loading} />
            </div>
          )}
        </>
      )}

      {assign && data && (
        <AssignModal
          employees={assign.employees}
          shifts={activeShifts}
          weekdayOrder={weekdayOrder}
          maxShiftsPerDay={data.max_shifts_per_day}
          initialDate={assign.date}
          hasExistingOnDate={hasExistingOnDate(assign.employees.map((e) => e.id))}
          onClose={() => setAssign(null)}
          onSaved={afterChange}
          onShiftCreated={(shift) => setData({ ...data, shifts: [...data.shifts, shift] })}
        />
      )}
      {edit && data && (
        <EditAssignmentModal target={edit} shifts={data.shifts} weekdayOrder={weekdayOrder} onClose={() => setEdit(null)} onChanged={afterChange} />
      )}
      {copyOpen && (
        <CopyModal
          weekDate={firstWeekDate}
          defaultSourceId={selected.size === 1 ? [...selected.keys()][0] : undefined}
          onClose={() => setCopyOpen(false)}
          onCopied={() => {
            setLogKey((k) => k + 1);
            reload();
          }}
        />
      )}
    </div>
  );
};
