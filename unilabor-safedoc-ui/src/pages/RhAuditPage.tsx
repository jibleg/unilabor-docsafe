import { useCallback, useEffect, useState } from 'react';
import { Activity, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { getApiErrorMessage, listEmployees, listRhAuditLogs } from '../api/service';
import type { AuditLog, Employee } from '../types/models';
import { notifyError } from '../utils/notify';

export const RhAuditPage = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState('');

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const [auditLogs, employeeList] = await Promise.all([
        listRhAuditLogs({
          ...(employeeId ? { employee_id: Number(employeeId) } : {}),
          limit: 100,
        }),
        listEmployees(),
      ]);

      setLogs(auditLogs);
      setEmployees(employeeList);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la auditoria RH.'));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-[linear-gradient(135deg,#ffffff_0%,#eef5fa_56%,#dbe8f2_100%)] shadow-xl shadow-[rgba(0,65,106,0.1)]">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(124,173,211,0.22),transparent_28%)] px-6 py-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
                Recursos Humanos
              </p>
              <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Auditoria RH</h1>
              <p className="mt-2 max-w-3xl text-sm text-[var(--unilabor-neutral)]">
                Consulta trazabilidad de cargas, visualizaciones y movimientos documentales del expediente RH.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadAudit()}
              className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Recargar auditoria
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,320px)_auto]">
        <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
            Filtrar por colaborador
          </label>
          <select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
          >
            <option value="">Todos los colaboradores</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Cobertura institucional
              </p>
              <p className="text-sm text-[var(--unilabor-ink)]">
                Esta vista distingue movimientos RH sobre expedientes, documentos y visualizacion segura.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)]">
        <div className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)] px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
            Registros de auditoria RH
          </p>
        </div>

        <div className="divide-y divide-[rgba(0,65,106,0.08)]">
          {loading ? (
            <div className="px-5 py-10 text-sm text-[var(--unilabor-neutral)]">Consultando auditoria RH...</div>
          ) : logs.length === 0 ? (
            <div className="px-5 py-10 text-sm text-[var(--unilabor-neutral)]">
              No hay registros para los filtros seleccionados.
            </div>
          ) : (
            logs.map((log, index) => (
              <div key={`${log.accessed_at}-${log.action}-${index}`} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.28)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                      {log.action}
                    </span>
                    <p className="text-sm font-bold text-[var(--color-brand-700)]">
                      {log.document_type_name || log.document || 'Movimiento RH'}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                    {log.employee_code || 'Sin codigo'} | {log.employee_name || 'Sin colaborador'}
                  </p>
                  <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                    {log.full_name} | {log.email}
                  </p>
                </div>

                <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.82)] px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
                  <div className="flex items-center gap-2 font-semibold text-[var(--color-brand-700)]">
                    <Clock3 size={14} />
                    {new Date(log.accessed_at).toLocaleString('es-MX')}
                  </div>
                  <p className="mt-2 inline-flex items-center gap-2">
                    <Activity size={12} />
                    {log.ip_address || 'Sin IP registrada'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
