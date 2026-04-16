import { useEffect } from 'react';
import { Globe, ShieldCheck } from 'lucide-react';
import { useAuditStore } from '../store/useAuditStore';

export const AuditPage = () => {
  const { logs, fetchLogs, loading, error } = useAuditStore();

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Auditoria de acceso</h1>
          <p className="text-sm text-[var(--unilabor-neutral)]">Trazabilidad total segun normativa ISO 15189</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(191,212,230,0.32)] px-4 py-2 text-xs font-bold text-[var(--color-brand-700)]">
          <ShieldCheck size={16} /> SISTEMA MONITOREADO
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        <table className="w-full text-left">
          <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
            <tr>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Fecha/Hora</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Usuario</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Accion</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Documento</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-[var(--unilabor-neutral)]">Consultando registros...</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-red-400">{error}</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center italic text-[var(--unilabor-neutral)]">No hay registros de actividad.</td>
              </tr>
            ) : (
              logs.map((log, i) => (
                <tr key={i} className="transition-colors hover:bg-[rgba(191,212,230,0.22)]">
                  <td className="px-6 py-4 font-mono text-xs text-[var(--unilabor-ink)]">
                    {new Date(log.accessed_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-[var(--color-brand-700)]">{log.full_name}</span>
                      <span className="text-[10px] text-[var(--unilabor-neutral)]">{log.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded-full border border-[rgba(0,65,106,0.12)] bg-[rgba(191,212,230,0.36)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--unilabor-ink)]">{log.document || '---'}</td>
                  <td className="px-6 py-4 text-xs text-[var(--unilabor-neutral)]">
                    <div className="flex items-center gap-1">
                      <Globe size={12} /> {log.ip_address}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
