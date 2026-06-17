import { useCallback, useEffect, useState } from 'react';
import { Bell, Loader2, Mail, MessageSquare } from 'lucide-react';
import { getApiErrorMessage, listNotificationLog } from '../api/service';
import type { NotificationLogEntry } from '../types/models';
import { notifyError } from '../utils/notify';

const STATUS_META: Record<NotificationLogEntry['status'], { label: string; className: string }> = {
  sent: { label: 'Enviado', className: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'Fallido', className: 'bg-red-100 text-red-700' },
  skipped: { label: 'Omitido', className: 'bg-slate-200 text-slate-600' },
};

const TEMPLATE_LABELS: Record<string, string> = {
  evaluation_available: 'Evaluacion disponible',
  not_accredited_rh: 'No acreditado (RH)',
};

export const RhNotificationsPage = () => {
  const [items, setItems] = useState<NotificationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listNotificationLog(200));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la bitacora de notificaciones.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
          Capacitacion
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
          <Bell size={24} /> Bitacora de notificaciones
        </h1>
        <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
          Trazabilidad de los avisos por correo y SMS de las evaluaciones de capacitacion.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-[var(--unilabor-neutral)]">
          <Loader2 className="mr-2 animate-spin" size={18} /> Cargando bitacora...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.18)] bg-[rgba(248,251,253,0.7)] py-16 text-center text-sm text-[var(--unilabor-neutral)]">
          Aun no hay notificaciones registradas.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90">
          <table className="w-full text-left text-sm">
            <thead className="bg-[rgba(248,251,253,0.9)] text-xs uppercase tracking-wide text-[var(--unilabor-neutral)]">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Destino</th>
                <th className="px-4 py-3">Colaborador</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id} className="border-t border-[rgba(0,65,106,0.06)]">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-[var(--unilabor-neutral)]">
                    {new Date(entry.sent_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-brand-700)]">
                      {entry.channel === 'sms' ? <MessageSquare size={13} /> : <Mail size={13} />}
                      {entry.channel.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[var(--unilabor-ink)]">{entry.recipient}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--unilabor-ink)]">
                    {entry.employee_name ?? '-'}
                    {entry.course_title ? <span className="block text-[var(--unilabor-neutral)]">{entry.course_title}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[var(--unilabor-ink)]">
                    {TEMPLATE_LABELS[entry.template] ?? entry.template}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_META[entry.status].className}`}>
                      {STATUS_META[entry.status].label}
                    </span>
                    {entry.error ? (
                      <span className="ml-2 text-[10px] text-[var(--unilabor-neutral)]" title={entry.error}>
                        ({entry.error.slice(0, 40)})
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
