import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2, RefreshCw, Search, Users, Cpu } from 'lucide-react';
import {
  getEmployeeSummary,
  listAttendanceEmployees,
  listEmployeesWithGap,
  patchAttendanceEmployee,
  type AttendanceEmployee,
  type EmployeeSummary,
} from '../../api/service.api-attendance-employees';
import { listAttendanceBranches, type AttendanceBranch } from '../../api/service.api-attendance-common';
import { getApiErrorMessage } from '../../api/service.parsers';
import { Pagination } from '../../components/Pagination';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { confirmAction } from '../../utils/confirm';
import { notifyError, notifySuccess } from '../../utils/notify';
import { useHasPermission } from '../../utils/permissions';
import { BulkEnableModal } from '../../components/attendance/employees/BulkEnableModal';
import { EmployeeQuickEditModal } from '../../components/attendance/employees/EmployeeQuickEditModal';
import { EmployeeSummaryChips } from '../../components/attendance/employees/EmployeeSummaryChips';
import { EmployeesTable } from '../../components/attendance/employees/EmployeesTable';
import { SyncDevicesModal } from '../../components/attendance/employees/SyncDevicesModal';
import { SUMMARY_CHIP_FILTERS, type SummaryChipKey } from '../../components/attendance/employees/readiness';
import { cardClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../../components/attendance/employees/ui';

const PAGE_SIZE = 20;
const FILTER_KEYS = ['enabled', 'sync_status', 'without_schedule', 'gap'] as const;

const activeChip = (params: URLSearchParams): SummaryChipKey | null => {
  for (const [key, filter] of Object.entries(SUMMARY_CHIP_FILTERS) as Array<[SummaryChipKey, Record<string, string>]>) {
    if (key === 'enabled') continue;
    if (Object.entries(filter).every(([name, value]) => params.get(name) === value)) return key;
  }
  return params.get('enabled') === 'true' && !params.get('sync_status') && !params.get('without_schedule') && !params.get('gap')
    ? 'enabled'
    : null;
};

export const AttendanceEmployeesPage = () => {
  const canWrite = useHasPermission('ATTENDANCE.SCHEDULES.WRITE');
  const canDevices = useHasPermission('ATTENDANCE.DEVICES.MANAGE');
  const [params, setParams] = useSearchParams();
  const branchId = params.get('branch_id') ?? '';
  const enabled = params.get('enabled') ?? '';
  const syncStatus = params.get('sync_status') ?? '';
  const withoutSchedule = params.get('without_schedule') ?? '';
  const gap = params.get('gap') ?? '';

  const [branches, setBranches] = useState<AttendanceBranch[]>([]);
  const [summary, setSummary] = useState<EmployeeSummary | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceEmployee | null>(null);

  const setParam = useCallback(
    (updates: Record<string, string>) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          Object.entries(updates).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const filters = useMemo(
    () => ({ branch_id: branchId, enabled, sync_status: syncStatus, without_schedule: withoutSchedule, gap }),
    [branchId, enabled, syncStatus, withoutSchedule, gap],
  );

  const list = usePaginatedList<AttendanceEmployee>(
    async (query) => {
      const { gap: gapFilter, ...rest } = query.filters;
      const base = { ...rest, search: query.search || undefined };
      if (gapFilter === 'branch' || gapFilter === 'number') {
        const all = await listEmployeesWithGap(gapFilter, base);
        setFetchError('');
        const start = (query.page - 1) * query.limit;
        return {
          data: all.slice(start, start + query.limit),
          pagination: { page: query.page, limit: query.limit, total: all.length, totalPages: Math.max(1, Math.ceil(all.length / query.limit)) },
        };
      }
      const result = await listAttendanceEmployees({ ...base, page: query.page, limit: query.limit });
      setFetchError('');
      return result;
    },
    {
      pageSize: PAGE_SIZE,
      filters,
      initialSearch: params.get('search') ?? '',
      onError: (err) => setFetchError(getApiErrorMessage(err, 'No se pudieron cargar los colaboradores.')),
    },
  );

  // La busqueda tambien vive en la URL.
  const { search } = list;
  useEffect(() => {
    setParam({ search: search.trim() });
  }, [search, setParam]);

  const loadSummary = useCallback(() => {
    getEmployeeSummary(branchId || undefined)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [branchId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    listAttendanceBranches().then(setBranches).catch(() => setBranches([]));
  }, []);

  const refresh = () => {
    list.reload();
    loadSummary();
  };

  const selectChip = (key: SummaryChipKey | null) => {
    const cleared = Object.fromEntries(FILTER_KEYS.map((name) => [name, '']));
    setParam({ ...cleared, ...(key ? SUMMARY_CHIP_FILTERS[key] : {}) });
  };

  const handleToggle = async (employee: AttendanceEmployee) => {
    if (!employee.is_enabled) {
      if (employee.branch_id === null || !employee.device_employee_number) {
        setEditing(employee);
        notifyError('Para habilitar completa la sucursal y el número de reloj.');
        return;
      }
    } else {
      const confirmed = await confirmAction(
        'Deshabilitar colaborador',
        `${employee.full_name} dejará de checar y se retirará del reloj en la próxima sincronización.`,
        'Deshabilitar',
      );
      if (!confirmed) return;
    }
    try {
      await patchAttendanceEmployee(employee.id, { is_enabled: !employee.is_enabled });
      notifySuccess(employee.is_enabled ? 'Colaborador deshabilitado.' : 'Colaborador habilitado.');
      refresh();
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo actualizar al colaborador.'));
    }
  };

  const hasItems = list.items.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-[var(--color-brand-700)]">Colaboradores</h1>
        <div className="flex flex-wrap gap-2">
          {canDevices ? (
            <button type="button" className={secondaryButtonClass} onClick={() => setSyncOpen(true)}>
              <Cpu size={16} aria-hidden="true" /> Sincronizar con relojes
            </button>
          ) : null}
          {canWrite ? (
            <button type="button" className={primaryButtonClass} onClick={() => setBulkOpen(true)}>
              <Users size={16} aria-hidden="true" /> Habilitar en lote
            </button>
          ) : null}
        </div>
      </div>

      <EmployeeSummaryChips summary={summary} active={activeChip(params)} onSelect={selectChip} />

      <div className={`${cardClass} grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <label className={labelClass} htmlFor="e-search">Buscar</label>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
            <input id="e-search" className={`${inputClass} pl-9`} placeholder="Nombre, código o n.º de reloj" value={list.search} onChange={(event) => list.setSearch(event.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="e-branch">Sucursal</label>
          <select id="e-branch" className={inputClass} value={branchId} onChange={(event) => setParam({ branch_id: event.target.value })}>
            <option value="">Todas</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="e-enabled">Habilitación</label>
          <select id="e-enabled" className={inputClass} value={enabled} onChange={(event) => setParam({ enabled: event.target.value })}>
            <option value="">Todos</option>
            <option value="true">Habilitados</option>
            <option value="false">No habilitados</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="e-sync">Sincronización</label>
          <select
            id="e-sync"
            className={inputClass}
            value={withoutSchedule === 'true' ? 'no_schedule' : syncStatus}
            onChange={(event) => {
              const value = event.target.value;
              setParam({ sync_status: value === 'no_schedule' ? '' : value, without_schedule: value === 'no_schedule' ? 'true' : '', gap: '' });
            }}
          >
            <option value="">Todas</option>
            <option value="synced">Sincronizado</option>
            <option value="pending">Por sincronizar</option>
            <option value="error">Con error</option>
            <option value="not_applicable">No aplica</option>
            <option value="no_schedule">Sin horario</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)]">
        {list.loading && !hasItems ? (
          <p className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 size={16} className="animate-spin" /> Cargando colaboradores…
          </p>
        ) : fetchError && !hasItems ? (
          <div className="flex flex-col items-center gap-3 p-10 text-sm">
            <p className="flex items-center gap-2 text-red-800"><AlertTriangle size={16} /> {fetchError}</p>
            <button type="button" className={secondaryButtonClass} onClick={refresh}><RefreshCw size={15} aria-hidden="true" /> Reintentar</button>
          </div>
        ) : !hasItems ? (
          <p className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">No hay colaboradores con estos filtros.</p>
        ) : (
          <div className={list.loading ? 'opacity-60 transition' : 'transition'}>
            <EmployeesTable employees={list.items} canWrite={canWrite} onToggle={(employee) => void handleToggle(employee)} onEdit={setEditing} />
          </div>
        )}
        <Pagination page={list.page} totalPages={list.pagination.totalPages} total={list.pagination.total} pageSize={PAGE_SIZE} onPageChange={list.setPage} loading={list.loading} />
      </div>

      {bulkOpen ? (
        <BulkEnableModal
          branches={branches}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            refresh();
          }}
        />
      ) : null}
      {syncOpen ? <SyncDevicesModal onClose={() => setSyncOpen(false)} onSynced={refresh} /> : null}
      {editing ? (
        <EmployeeQuickEditModal
          employee={editing}
          branches={branches}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
};
