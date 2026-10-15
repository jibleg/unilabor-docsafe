import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, FileSpreadsheet, Loader2, Plus, RefreshCw } from 'lucide-react';
import {
  listIncidents,
  listIncidentTypes,
  transitionIncident,
  type Incident,
  type IncidentTransition,
  type IncidentType,
} from '../../api/service.api-attendance-incidents';
import { listAttendanceBranches, type AttendanceBranch } from '../../api/service.api-attendance-common';
import { getApiErrorMessage } from '../../api/service.parsers';
import { Pagination } from '../../components/Pagination';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { ATTENDANCE_MIN_DATE } from '../../components/attendance/shared/format';
import { confirmAction } from '../../utils/confirm';
import { notifyError, notifySuccess, notifyWarning } from '../../utils/notify';
import { useHasPermission } from '../../utils/permissions';
import { addDaysIso, todayIso } from '../../components/attendance/shared/format';
import { EmployeePicker } from '../../components/attendance/employees/EmployeePicker';
import { cardClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../../components/attendance/employees/ui';
import { defaultRange, STATUS_FILTERS } from '../../components/attendance/incidents/incidentFormat';
import { IncidentDetailDrawer } from '../../components/attendance/incidents/IncidentDetailDrawer';
import { IncidentFormModal } from '../../components/attendance/incidents/IncidentFormModal';
import { IncidentImportModal } from '../../components/attendance/incidents/IncidentImportModal';
import { IncidentNotesModal } from '../../components/attendance/incidents/IncidentNotesModal';
import { IncidentsTable } from '../../components/attendance/incidents/IncidentsTable';

const PAGE_SIZE = 20;

export const AttendanceIncidentsPage = () => {
  const canAuthorize = useHasPermission('ATTENDANCE.INCIDENTS.AUTHORIZE');
  const [params, setParams] = useSearchParams();
  const range = useMemo(() => defaultRange(todayIso(), addDaysIso), []);
  const from = params.get('from') ?? range.from;
  const to = params.get('to') ?? range.to;
  const branchId = params.get('branch_id') ?? '';
  const employeeId = params.get('employee_id') ?? '';
  const employeeName = params.get('employee_name') ?? '';
  const typeId = params.get('type_id') ?? '';
  const status = params.get('status') ?? '';

  const [branches, setBranches] = useState<AttendanceBranch[]>([]);
  const [types, setTypes] = useState<IncidentType[]>([]);
  const [loadError, setLoadError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<Incident | null>(null);

  const setParam = useCallback(
    (updates: Record<string, string>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          Object.entries(updates).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    void Promise.all([listAttendanceBranches(), listIncidentTypes(true)])
      .then(([branchList, typeList]) => {
        setBranches(branchList);
        setTypes(typeList);
      })
      .catch((err) => setLoadError(getApiErrorMessage(err, 'No se pudieron cargar los catálogos.')));
  }, []);

  const filters = useMemo(
    () => ({ from, to, branch_id: branchId, employee_id: employeeId, type_id: typeId, status }),
    [from, to, branchId, employeeId, typeId, status],
  );

  const [fetchError, setFetchError] = useState('');
  const list = usePaginatedList<Incident>(
    async (query) => {
      const result = await listIncidents({ ...query.filters, page: query.page, limit: query.limit });
      setFetchError('');
      return {
        data: result.data,
        pagination: {
          page: result.pagination.page,
          limit: result.pagination.limit,
          total: result.pagination.total,
          totalPages: result.pagination.pages,
        },
      };
    },
    { pageSize: PAGE_SIZE, filters, onError: (err) => setFetchError(getApiErrorMessage(err, 'No se pudieron cargar las incidencias.')) },
  );

  const showWarnings = (warnings: string[]) => warnings.forEach((warning) => notifyWarning(warning));

  const runTransition = async (incident: Incident, action: IncidentTransition, notes?: string): Promise<string | null> => {
    try {
      const result = await transitionIncident(incident.id, action, notes);
      notifySuccess(
        action === 'authorize' ? 'Incidencia autorizada.' : action === 'reject' ? 'Incidencia rechazada.' : 'Incidencia cancelada.',
      );
      showWarnings(result.warnings);
      list.reload();
      return null;
    } catch (err) {
      return getApiErrorMessage(err, 'No se pudo completar la acción.');
    }
  };

  const handleAuthorize = async (incident: Incident) => {
    const confirmed = await confirmAction(
      'Autorizar incidencia',
      `${incident.type.name} de ${incident.employee.full_name}. Se recalcularán los días y se avisará al colaborador por correo.`,
      'Autorizar',
      'primary',
    );
    if (!confirmed) return;
    const message = await runTransition(incident, 'authorize');
    if (message) notifyError(message);
  };

  const handleCancel = async (incident: Incident) => {
    const confirmed = await confirmAction(
      'Cancelar incidencia',
      `Se cancelará ${incident.type.name} de ${incident.employee.full_name}. Los días vuelven a calcularse sin ella.`,
      'Cancelar incidencia',
    );
    if (!confirmed) return;
    const message = await runTransition(incident, 'cancel');
    if (message) notifyError(message);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-[var(--color-brand-700)]">Incidencias</h1>
        {canAuthorize ? (
          <div className="flex gap-2">
            <button type="button" className={secondaryButtonClass} onClick={() => setImportOpen(true)}>
              <FileSpreadsheet size={16} aria-hidden="true" /> Desde Excel
            </button>
            <button type="button" className={primaryButtonClass} onClick={() => setFormOpen(true)}>
              <Plus size={16} aria-hidden="true" /> Nueva incidencia
            </button>
          </div>
        ) : null}
      </div>

      <div className={`${cardClass} grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`}>
        <div>
          <label className={labelClass} htmlFor="f-from">Desde</label>
          <input id="f-from" type="date" min={ATTENDANCE_MIN_DATE} className={inputClass} value={from} onChange={(event) => setParam({ from: event.target.value })} />
        </div>
        <div>
          <label className={labelClass} htmlFor="f-to">Hasta</label>
          <input id="f-to" type="date" className={inputClass} value={to} min={from || ATTENDANCE_MIN_DATE} onChange={(event) => setParam({ to: event.target.value })} />
        </div>
        <div>
          <label className={labelClass} htmlFor="f-branch">Sucursal</label>
          <select id="f-branch" className={inputClass} value={branchId} onChange={(event) => setParam({ branch_id: event.target.value })}>
            <option value="">Todas</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="f-type">Tipo</label>
          <select id="f-type" className={inputClass} value={typeId} onChange={(event) => setParam({ type_id: event.target.value })}>
            <option value="">Todos</option>
            {types.map((type) => <option key={type.id} value={type.id}>{type.name}{type.is_active ? '' : ' (inactivo)'}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="f-status">Estado</label>
          <select id="f-status" className={inputClass} value={status} onChange={(event) => setParam({ status: event.target.value })}>
            {STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Colaborador</label>
          <EmployeePicker
            onlyEnabled={false}
            placeholder="Todos"
            value={employeeId ? { id: Number(employeeId), full_name: employeeName || `#${employeeId}`, employee_code: null } : null}
            onChange={(employee) => setParam({ employee_id: employee ? String(employee.id) : '', employee_name: employee?.full_name ?? '' })}
          />
        </div>
      </div>
      {loadError ? <p className="text-xs text-[var(--unilabor-neutral)]">{loadError}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)]">
        {list.loading && list.items.length === 0 ? (
          <p className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 size={16} className="animate-spin" /> Cargando incidencias…
          </p>
        ) : fetchError && list.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-sm">
            <p className="flex items-center gap-2 text-red-800"><AlertTriangle size={16} /> {fetchError}</p>
            <button type="button" className={secondaryButtonClass} onClick={() => list.reload()}>
              <RefreshCw size={15} aria-hidden="true" /> Reintentar
            </button>
          </div>
        ) : list.items.length === 0 ? (
          <p className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">No hay incidencias con estos filtros.</p>
        ) : (
          <div className={list.loading ? 'opacity-60 transition' : 'transition'}>
            <IncidentsTable
              incidents={list.items}
              canAuthorize={canAuthorize}
              onOpen={(incident) => setDetailId(incident.id)}
              onAuthorize={(incident) => void handleAuthorize(incident)}
              onReject={setRejecting}
              onCancel={(incident) => void handleCancel(incident)}
            />
          </div>
        )}
        <Pagination
          page={list.page}
          totalPages={list.pagination.totalPages}
          total={list.pagination.total}
          pageSize={PAGE_SIZE}
          onPageChange={list.setPage}
          loading={list.loading}
        />
      </div>

      {formOpen ? (
        <IncidentFormModal
          types={types}
          onClose={() => setFormOpen(false)}
          onCreated={() => {
            setFormOpen(false);
            list.reload();
          }}
        />
      ) : null}
      {importOpen ? <IncidentImportModal onClose={() => setImportOpen(false)} onImported={() => list.reload()} /> : null}
      {detailId !== null ? (
        <IncidentDetailDrawer incidentId={detailId} canEdit={canAuthorize} onClose={() => setDetailId(null)} onChanged={() => list.reload()} />
      ) : null}
      {rejecting ? (
        <IncidentNotesModal
          title="Rechazar incidencia"
          confirmLabel="Rechazar"
          description={`${rejecting.type.name} de ${rejecting.employee.full_name}.`}
          onClose={() => setRejecting(null)}
          onSubmit={async (notes) => {
            const message = await runTransition(rejecting, 'reject', notes || undefined);
            if (!message) setRejecting(null);
            return message;
          }}
        />
      ) : null}
    </div>
  );
};
