import type { DeviceOrder } from '../../../api/service.api-attendance-devices';
import { Pagination } from '../../Pagination';
import { formatDateTime } from '../shared/format';
import { orderDetail, orderStatusLabel, orderTypeLabel, retriesLabel } from './deviceHelpers';

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  processing: 'bg-sky-100 text-sky-800',
  done: 'bg-emerald-100 text-emerald-800',
  error: 'bg-red-100 text-red-700',
};

interface OrdersTableProps {
  orders: DeviceOrder[];
  loading: boolean;
  error: boolean;
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}

export const OrdersTable = ({ orders, loading, error, page, total, limit, onPageChange, onRetry }: OrdersTableProps) => {
  if (error) {
    return (
      <div className="p-6 text-center text-sm text-red-700">
        No se pudieron cargar las órdenes.{' '}
        <button type="button" onClick={onRetry} className="font-semibold underline">Reintentar</button>
      </div>
    );
  }
  if (!loading && orders.length === 0) {
    return <p className="p-6 text-center text-sm text-slate-500">No hay órdenes con esos filtros.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[rgba(191,212,230,0.2)] text-xs uppercase tracking-wide text-[var(--unilabor-neutral)]">
            <tr>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Colaborador</th>
              <th className="px-3 py-2">Detalle</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Creada</th>
              <th className="px-3 py-2">Terminada</th>
            </tr>
          </thead>
          <tbody className={loading ? 'opacity-50' : ''}>
            {orders.map((order) => {
              const detail = orderDetail(order);
              const retries = retriesLabel(order);
              return (
                <tr key={order.id} className="border-t border-[rgba(0,65,106,0.08)] align-top">
                  <td className="px-3 py-2 font-medium text-[var(--color-brand-700)]">{orderTypeLabel(order.order_type)}</td>
                  <td className="px-3 py-2">{order.employee_name ?? '—'}</td>
                  <td className={`max-w-[280px] px-3 py-2 text-xs ${detail.isError ? 'font-medium text-red-700' : 'text-slate-600'}`}>{detail.text || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[order.order_status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {orderStatusLabel(order.order_status)}{order.order_status === 'error' && retries ? ` ${retries}` : ''}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDateTime(order.created_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDateTime(order.finished_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / limit))} total={total} pageSize={limit} onPageChange={onPageChange} loading={loading} />
    </>
  );
};
