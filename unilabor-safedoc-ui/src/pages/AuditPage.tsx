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
          <h1 className="text-2xl font-bold text-slate-100">Auditoria de acceso</h1>
          <p className="text-sm text-slate-400">Trazabilidad total segun normativa ISO 15189</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300">
          <ShieldCheck size={16} /> SISTEMA MONITOREADO
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl shadow-slate-950/40 backdrop-blur-xl">
        <table className="w-full text-left">
          <thead className="border-b border-slate-800 bg-slate-900/80">
            <tr>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">Fecha/Hora</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">Usuario</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">Accion</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">Documento</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-slate-500">Consultando registros...</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-red-400">{error}</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center italic text-slate-500">No hay registros de actividad.</td>
              </tr>
            ) : (
              logs.map((log, i) => (
                <tr key={i} className="transition-colors hover:bg-slate-800/50">
                  <td className="px-6 py-4 font-mono text-xs text-slate-300">
                    {new Date(log.accessed_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-100">{log.full_name}</span>
                      <span className="text-[10px] text-slate-400">{log.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-200">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-300">{log.document || '---'}</td>
                  <td className="px-6 py-4 text-xs text-slate-400">
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
