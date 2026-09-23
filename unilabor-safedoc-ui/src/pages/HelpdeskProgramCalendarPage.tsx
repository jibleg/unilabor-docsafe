import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { fetchProgramCalendar, getApiErrorMessage, getHelpdeskOrgStructure, listEmployees, listHelpdeskCatalogs } from '../api/service';
import { CoveragePanel } from '../components/helpdesk/program/CoveragePanel';
import { ProgramAgendaView } from '../components/helpdesk/program/ProgramAgendaView';
import { ProgramEventDrawer } from '../components/helpdesk/program/ProgramEventDrawer';
import { ProgramFilterBar } from '../components/helpdesk/program/ProgramFilterBar';
import { ProgramKpiStrip } from '../components/helpdesk/program/ProgramKpiStrip';
import { ProgramMonthGrid } from '../components/helpdesk/program/ProgramMonthGrid';
import { ProgramToolbar } from '../components/helpdesk/program/ProgramToolbar';
import { ProgramWeekView } from '../components/helpdesk/program/ProgramWeekView';
import { ProgramYearView } from '../components/helpdesk/program/ProgramYearView';
import type { CalendarEvent, CalendarFilters, CalendarResponse, CalendarViewMode } from '../types/helpdesk-program';
import type { Employee, HelpdeskCatalogs, HelpdeskOrgStructure } from '../types/models';
import { addDays, addMonths, buildIcs, downloadTextFile, formatDateShort, formatMonthTitle, parseIsoDate, startOfMonth, startOfWeek, todayIso } from '../utils/maintenanceProgram';
import { notifyError, notifyInfo } from '../utils/notify';

type KpiPick = 'overdue' | 'due_soon' | 'in_progress' | 'pending_validation' | 'closed' | 'all';

const rangeFor = (mode: CalendarViewMode, anchor: string): { from: string; to: string } => {
  if (mode === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  if (mode === 'year') {
    const year = anchor.slice(0, 4);
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  if (mode === 'agenda') {
    return { from: anchor, to: addDays(anchor, 30) };
  }
  // Mes: incluye los días visibles de la malla (6 semanas).
  const from = startOfWeek(startOfMonth(anchor));
  return { from, to: addDays(from, 41) };
};

const titleFor = (mode: CalendarViewMode, anchor: string, range: { from: string; to: string }): string => {
  if (mode === 'year') return anchor.slice(0, 4);
  if (mode === 'month') return formatMonthTitle(anchor);
  if (mode === 'week') return `${formatDateShort(range.from)} – ${formatDateShort(range.to)}`;
  return `${formatDateShort(range.from)} – ${formatDateShort(range.to)}`;
};

export const HelpdeskProgramCalendarPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<CalendarViewMode>((searchParams.get('view') as CalendarViewMode) || 'month');
  const [anchor, setAnchor] = useState<string>(searchParams.get('date') || todayIso());
  const [filters, setFilters] = useState<CalendarFilters>(() => ({
    unit_id: searchParams.get('unit_id') ?? '',
    area_id: searchParams.get('area_id') ?? '',
    asset_id: searchParams.get('asset_id') ?? '',
    search: searchParams.get('search') ?? '',
  }));
  const [kpi, setKpi] = useState<KpiPick>('all');
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgStructure, setOrgStructure] = useState<HelpdeskOrgStructure | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [catalogs, setCatalogs] = useState<HelpdeskCatalogs | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [pendingDropDate, setPendingDropDate] = useState<string | null>(null);
  const [showCoverage, setShowCoverage] = useState(false);

  const range = useMemo(() => rangeFor(viewMode, anchor), [viewMode, anchor]);

  useEffect(() => {
    Promise.allSettled([getHelpdeskOrgStructure(), listEmployees(), listHelpdeskCatalogs()]).then(([org, emp, cat]) => {
      if (org.status === 'fulfilled') setOrgStructure(org.value);
      if (emp.status === 'fulfilled') setEmployees(emp.value);
      if (cat.status === 'fulfilled') setCatalogs(cat.value);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchProgramCalendar(range.from, range.to, filters));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el calendario del programa.'));
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set('view', viewMode);
    next.set('date', anchor);
    if (filters.unit_id) next.set('unit_id', filters.unit_id);
    if (filters.area_id) next.set('area_id', filters.area_id);
    if (filters.asset_id) next.set('asset_id', filters.asset_id);
    if (filters.search) next.set('search', filters.search);
    setSearchParams(next, { replace: true });
  }, [viewMode, anchor, filters.unit_id, filters.area_id, filters.asset_id, filters.search, setSearchParams]);

  const events = useMemo(() => {
    const all = data?.events ?? [];
    const today = todayIso();
    const soon = addDays(today, 7);
    switch (kpi) {
      case 'overdue':
        return all.filter((e) => e.status !== 'CLOSED' && e.window_state === 'OVERDUE');
      case 'due_soon':
        return all.filter((e) => e.status !== 'CLOSED' && e.window_state !== 'OVERDUE' && e.date >= today && e.date <= soon);
      case 'in_progress':
        return all.filter((e) => e.status === 'IN_PROGRESS');
      case 'pending_validation':
        return all.filter((e) => e.status === 'PENDING_VALIDATION');
      case 'closed':
        return all.filter((e) => e.status === 'CLOSED');
      default:
        return all;
    }
  }, [data, kpi]);

  useEffect(() => {
    if (selected) {
      const fresh = (data?.events ?? []).find((e) => e.id === selected.id);
      if (fresh && fresh !== selected) setSelected(fresh);
    }
  }, [data, selected]);

  const navigateBy = (direction: -1 | 1) => {
    if (viewMode === 'week') setAnchor(addDays(anchor, 7 * direction));
    else if (viewMode === 'year') setAnchor(`${Number(anchor.slice(0, 4)) + direction}-01-01`);
    else if (viewMode === 'agenda') setAnchor(addDays(anchor, 30 * direction));
    else setAnchor(addMonths(startOfMonth(anchor), direction));
  };

  const openDay = (date: string) => {
    setAnchor(date);
    setViewMode('agenda');
  };

  const handleDrop = (event: CalendarEvent, date: string) => {
    setSelected(event);
    setPendingDropDate(date);
  };

  const exportIcs = () => {
    if (events.length === 0) {
      notifyInfo('No hay servicios que exportar en el periodo.');
      return;
    }
    downloadTextFile(buildIcs(events), `programa-mantenimiento-${range.from}-${range.to}.ics`);
  };

  const title = titleFor(viewMode, anchor, range);
  const year = parseIsoDate(anchor).getFullYear();

  return (
    <div className="flex min-h-[calc(100vh-8.5rem)] flex-col gap-3 print:min-h-0">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">Help Desk · ISO 15189:2022 6.4.5</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
            <CalendarDays size={24} /> Programa de mantenimiento
          </h1>
          <p className="text-sm text-[var(--unilabor-neutral)]">Preventivos, verificaciones, seguridad eléctrica, calibraciones y correctivos de todos los activos, por unidad, área y responsable.</p>
        </div>
      </div>

      <div className="print:hidden">
        <ProgramToolbar
          title={title}
          viewMode={viewMode}
          onViewChange={setViewMode}
          onPrev={() => navigateBy(-1)}
          onNext={() => navigateBy(1)}
          onToday={() => setAnchor(todayIso())}
          mine={Boolean(filters.mine)}
          onToggleMine={() => setFilters({ ...filters, mine: !filters.mine })}
          onReload={() => void load()}
          onExportIcs={exportIcs}
          onPrint={() => window.print()}
          onOpenCoverage={() => setShowCoverage(true)}
          loading={loading}
        />
      </div>

      <div className="print:hidden">
        <ProgramFilterBar filters={filters} onChange={setFilters} orgStructure={orgStructure} employees={employees} catalogs={catalogs} />
      </div>

      <div className="print:hidden">
        <ProgramKpiStrip summary={data?.summary ?? null} loading={loading} onPick={setKpi} active={kpi} />
      </div>

      <div className="hidden print:block">
        <h1 className="text-xl font-bold">Programa de mantenimiento · {title}</h1>
        <p className="text-xs">Generado el {new Date().toLocaleString('es-MX')} · {events.length} servicios</p>
      </div>

      <div className={`grid min-h-0 flex-1 gap-3 ${selected ? 'lg:grid-cols-[1fr_400px]' : ''}`}>
        <div className="flex min-h-[560px] flex-col rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 p-3 shadow-xl shadow-[rgba(0,65,106,0.08)] print:border-0 print:shadow-none">
          {viewMode === 'month' ? (
            <ProgramMonthGrid anchorDate={anchor} events={events} selectedId={selected?.id ?? null} onSelectEvent={setSelected} onDropEvent={handleDrop} onOpenDay={openDay} />
          ) : viewMode === 'week' ? (
            <ProgramWeekView anchorDate={anchor} events={events} selectedId={selected?.id ?? null} onSelectEvent={setSelected} onDropEvent={handleDrop} />
          ) : viewMode === 'agenda' ? (
            <ProgramAgendaView events={events} selectedId={selected?.id ?? null} onSelectEvent={setSelected} />
          ) : (
            <ProgramYearView
              year={year}
              events={events}
              onOpenMonth={(date) => {
                setAnchor(date);
                setViewMode('month');
              }}
              onOpenDay={openDay}
            />
          )}
        </div>
        {selected ? (
          <div className="min-h-[560px] print:hidden">
            <ProgramEventDrawer
              event={selected}
              employees={employees}
              suppliers={catalogs?.suppliers ?? []}
              pendingDropDate={pendingDropDate}
              onClearDrop={() => setPendingDropDate(null)}
              onClose={() => {
                setSelected(null);
                setPendingDropDate(null);
              }}
              onChanged={() => void load()}
            />
          </div>
        ) : null}
      </div>

      <CoveragePanel open={showCoverage} filters={filters} onClose={() => setShowCoverage(false)} />
    </div>
  );
};
