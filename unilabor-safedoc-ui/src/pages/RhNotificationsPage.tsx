import { useCallback, useEffect, useState } from 'react';
import { Inbox, Loader2, Mail, MessageSquare, X } from 'lucide-react';
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
  evaluation_reminder: 'Recordatorio',
  evaluation_expired_rh: 'Vencida (RH)',
  not_accredited_rh: 'No acreditado (RH)',
  credential_welcome: 'Bienvenida',
  credential_reset: 'Reset de contrasena',
  credential_recovery: 'Recuperacion',
  generic: 'General',
};

type ChannelFilter = '' | 'email' | 'sms';
type StatusFilter = '' | 'sent' | 'failed' | 'skipped';

export const RhNotificationsPage = () => {
  const [items, setItems] = useState<NotificationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<ChannelFilter>('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [detail, setDetail] = useState<NotificationLogEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(
        await listNotificationLog({
          limit: 300,
          ...(channel ? { channel } : {}),
          ...(status ? { status } : {}),
        }),
      );
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar la bandeja de salida.'));
    } finally {
      setLoading(false);
    }
  }, [channel, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectClass =
    'rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm outline-none';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
            Capacitacion
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
            <Inbox size={24} /> Bandeja de salida
          </h1>
          <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
            Trazabilidad de todos los correos y SMS enviados por el sistema (con su contenido y estado).
          </p>
        </div>
        <div className="flex gap-2">
          <select value={channel} onChange={(e) => setChannel(e.target.value as ChannelFilter)} className={selectClass}>
            <option value="">Todos los canales</option>
            <option value="email">Correo</option>
            <option value="sms">SMS</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={selectClass}>
            <option value="">Todos los estados</option>
            <option value="sent">Enviado</option>
            <option value="failed">Fallido</option>
            <option value="skipped">Omitido</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-[var(--unilabor-neutral)]">
          <Loader2 className="mr-2 animate-spin" size={18} /> Cargando bandeja...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[rgba(0,65,106,0.18)] bg-[rgba(248,251,253,0.7)] py-16 text-center text-sm text-[var(--unilabor-neutral)]">
          No hay envios registrados.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90">
          <table className="w-full text-left text-sm">
            <thead className="bg-[rgba(248,251,253,0.9)] text-xs uppercase tracking-wide text-[var(--unilabor-neutral)]">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Destino</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Asunto / contenido</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => setDetail(entry)}
                  className="cursor-pointer border-t border-[rgba(0,65,106,0.06)] hover:bg-[rgba(191,212,230,0.18)]"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-[var(--unilabor-neutral)]">
                    {new Date(entry.sent_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-brand-700)]">
                      {entry.channel === 'sms' ? <MessageSquare size={13} /> : <Mail size={13} />}
                      {entry.channel.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[var(--unilabor-ink)]">
                    {entry.recipient}
                    {entry.employee_name ? (
                      <span className="block text-[var(--unilabor-neutral)]">{entry.employee_name}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[var(--unilabor-ink)]">
                    {TEMPLATE_LABELS[entry.template] ?? entry.template}
                  </td>
                  <td className="max-w-xs truncate px-4 py-2.5 text-xs text-[var(--unilabor-ink)]">
                    {entry.subject || entry.body || '-'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_META[entry.status].className}`}>
                      {STATUS_META[entry.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/96 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
              <h2 className="text-base font-bold text-[var(--color-brand-700)]">Detalle del envio</h2>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.1)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto px-5 py-4 text-sm">
              <p><span className="font-semibold">Canal:</span> {detail.channel.toUpperCase()}</p>
              <p><span className="font-semibold">Destino:</span> {detail.recipient}</p>
              <p><span className="font-semibold">Tipo:</span> {TEMPLATE_LABELS[detail.template] ?? detail.template}</p>
              <p><span className="font-semibold">Estado:</span> {STATUS_META[detail.status].label}</p>
              <p><span className="font-semibold">Fecha:</span> {new Date(detail.sent_at).toLocaleString('es-MX')}</p>
              {detail.subject && <p><span className="font-semibold">Asunto:</span> {detail.subject}</p>}
              {detail.body && (
                <div>
                  <p className="font-semibold">Contenido:</p>
                  <pre className="mt-1 whitespace-pre-wrap rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.7)] p-3 text-xs text-[var(--unilabor-ink)]">{detail.body}</pre>
                </div>
              )}
              {detail.error && <p className="text-red-600"><span className="font-semibold">Error:</span> {detail.error}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
