import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Signature, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { getApiErrorMessage } from '../api/service.parsers';
import { confirmAction } from '../utils/confirm';
import {
  cancelAcknowledgement,
  listAcknowledgements,
} from '../api/service.api-rh-acknowledgement';
import type { AcknowledgementStatus, DocumentAcknowledgement } from '../types/models';

const STATUS_LABEL: Record<AcknowledgementStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En lectura',
  read: 'Leído · falta firmar',
  signed: 'Firmado',
  expired: 'Vencido',
  cancelled: 'Cancelado',
};

const STATUS_STYLE: Record<AcknowledgementStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-amber-100 text-amber-800',
  read: 'bg-sky-100 text-sky-800',
  signed: 'bg-emerald-100 text-emerald-800',
  expired: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-100 text-slate-500',
};

const FILTERS: Array<{ value: AcknowledgementStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'in_progress', label: 'En lectura' },
  { value: 'read', label: 'Falta firmar' },
  { value: 'signed', label: 'Firmados' },
  { value: 'expired', label: 'Vencidos' },
];

const formatStamp = (value: string | null): string =>
  value
    ? new Date(value).toLocaleString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '—';

export const RhAcknowledgementsPage = () => {
  const [items, setItems] = useState<DocumentAcknowledgement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AcknowledgementStatus | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listAcknowledgements(filter === 'all' ? {} : { status: filter }));
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron cargar los acuses.'));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCancel = async (item: DocumentAcknowledgement) => {
    const confirmed = await confirmAction(
      'Cancelar acuse',
      `¿Cancelar el acuse de "${item.document_title ?? 'este documento'}" para ${
        item.employee_name ?? 'el colaborador'
      }? Dejará de verlo entre sus pendientes.`,
      'Cancelar acuse',
    );
    if (!confirmed) {
      return;
    }
    try {
      await cancelAcknowledgement(item.id);
      toast.success('Acuse cancelado.');
      void load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo cancelar el acuse.'));
    }
  };

  // Resumen de cumplimiento: lo primero que quiere ver RH.
  const summary = useMemo(() => {
    const signed = items.filter((item) => item.status === 'signed').length;
    const expired = items.filter((item) => item.status === 'expired').length;
    const open = items.filter((item) =>
      ['pending', 'in_progress', 'read'].includes(item.status),
    ).length;
    return { signed, expired, open, total: items.length };
  }, [items]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-brand-700)]">
            <Signature size={22} />
            Acuses de lectura
          </h1>
          <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
            Seguimiento de los documentos enviados a leer y firmar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/92 px-3 py-2 text-sm text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
        >
          <RefreshCw size={15} />
          Actualizar
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', value: summary.total, tone: 'text-[var(--color-brand-700)]' },
          { label: 'Firmados', value: summary.signed, tone: 'text-emerald-600' },
          { label: 'En curso', value: summary.open, tone: 'text-amber-600' },
          { label: 'Vencidos', value: summary.expired, tone: 'text-rose-600' },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 px-4 py-3 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              {card.label}
            </p>
            <p className={`mt-1 text-2xl font-bold ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filter === option.value
                ? 'bg-[var(--color-brand-700)] text-white'
                : 'border border-[rgba(0,65,106,0.12)] bg-white/92 text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.28)]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-[var(--unilabor-neutral)]">Cargando…</p>}

      {!loading && items.length === 0 && (
        <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 px-5 py-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500" size={26} />
          <p className="mt-2 text-sm text-[var(--unilabor-neutral)]">
            No hay acuses con este filtro.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/92 shadow-sm">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[rgba(0,65,106,0.08)] text-left text-xs uppercase tracking-wide text-[var(--unilabor-neutral)]">
                <th className="px-4 py-3 font-semibold">Colaborador</th>
                <th className="px-4 py-3 font-semibold">Documento</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Avance</th>
                <th className="px-4 py-3 font-semibold">Plazo</th>
                <th className="px-4 py-3 font-semibold">Firmado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const coverage =
                  item.pages_total > 0
                    ? Math.round((item.pages_seen_count / item.pages_total) * 100)
                    : 0;
                return (
                  <tr
                    key={item.id}
                    className="border-b border-[rgba(0,65,106,0.05)] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[var(--color-brand-700)]">
                        {item.employee_name ?? `#${item.employee_id}`}
                      </p>
                      {item.employee_code && (
                        <p className="text-xs text-[var(--unilabor-neutral)]">
                          {item.employee_code}
                        </p>
                      )}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-[var(--unilabor-neutral)]">
                      {item.document_title ?? `#${item.institutional_document_id}`}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          STATUS_STYLE[item.status]
                        }`}
                      >
                        {STATUS_LABEL[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-[var(--color-brand-500)]"
                            style={{ width: `${coverage}%` }}
                          />
                        </div>
                        <span className="text-xs text-[var(--unilabor-neutral)]">
                          {item.pages_seen_count}/{item.pages_total}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
                      <span className="inline-flex items-center gap-1">
                        {item.status === 'expired' ? (
                          <AlertTriangle size={12} className="text-rose-500" />
                        ) : (
                          <Clock size={12} />
                        )}
                        {formatStamp(item.deadline_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
                      {formatStamp(item.signed_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.status !== 'signed' && item.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => void handleCancel(item)}
                          title="Cancelar acuse"
                          className="rounded-lg p-1.5 text-[var(--unilabor-neutral)] transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
