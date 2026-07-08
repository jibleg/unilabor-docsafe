import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { getApiErrorMessage, listCalibrationOrders, listMaintenanceOrders } from '../api/service';
import {
  ServiceCalendarView,
  type ServiceCalendarEvent,
} from '../components/helpdesk/ServiceCalendarView';
import type { HelpdeskCalibrationOrder, HelpdeskMaintenanceOrder } from '../types/models';
import { notifyError } from '../utils/notify';

type KindFilter = 'ALL' | 'maintenance' | 'calibration';

const orderLabel = (
  order: HelpdeskMaintenanceOrder | HelpdeskCalibrationOrder,
): string => `${order.asset?.asset_code ?? ''} ${order.plan?.title ?? order.order_code}`.trim();

export const HelpdeskServiceCalendarPage = () => {
  const [maintenanceOrders, setMaintenanceOrders] = useState<HelpdeskMaintenanceOrder[]>([]);
  const [calibrationOrders, setCalibrationOrders] = useState<HelpdeskCalibrationOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState<Date>(new Date());
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [maintenanceResult, calibrationResult] = await Promise.allSettled([
        listMaintenanceOrders(),
        listCalibrationOrders(),
      ]);

      if (maintenanceResult.status === 'fulfilled') {
        setMaintenanceOrders(maintenanceResult.value);
      } else {
        notifyError(getApiErrorMessage(maintenanceResult.reason, 'No se pudieron cargar las órdenes de mantenimiento.'));
      }

      if (calibrationResult.status === 'fulfilled') {
        setCalibrationOrders(calibrationResult.value);
      } else {
        notifyError(getApiErrorMessage(calibrationResult.reason, 'No se pudieron cargar las órdenes de calibración.'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const events = useMemo<ServiceCalendarEvent[]>(() => {
    const maintenanceEvents: ServiceCalendarEvent[] = maintenanceOrders.map((order) => ({
      id: `maintenance-${order.id}`,
      date: order.scheduled_for,
      kind: 'maintenance',
      label: orderLabel(order),
      status: order.status,
    }));
    const calibrationEvents: ServiceCalendarEvent[] = calibrationOrders.map((order) => ({
      id: `calibration-${order.id}`,
      date: order.scheduled_for,
      kind: 'calibration',
      label: orderLabel(order),
      status: order.status,
    }));
    const all = [...maintenanceEvents, ...calibrationEvents];
    if (kindFilter === 'ALL') {
      return all;
    }
    return all.filter((event) => event.kind === kindFilter);
  }, [maintenanceOrders, calibrationOrders, kindFilter]);

  const handlePrevMonth = () => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  };

  const filterButtons: Array<{ value: KindFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'maintenance', label: 'Mantenimiento' },
    { value: 'calibration', label: 'Calibración' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Servicios ISO 15189
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Calendario de servicios</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Órdenes de mantenimiento preventivo y calibración metrológica programadas por mes.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 px-4 py-3 shadow-xl shadow-[rgba(0,65,106,0.08)]">
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-[var(--unilabor-neutral)]">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-md border border-[rgba(0,65,106,0.2)] bg-[rgba(191,212,230,0.45)]" />
            Mantenimiento
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-md border border-[rgba(180,120,20,0.35)] bg-[rgba(245,196,110,0.28)]" />
            Calibración
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {filterButtons.map((button) => (
            <button
              key={button.value}
              type="button"
              onClick={() => setKindFilter(button.value)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                kindFilter === button.value
                  ? 'border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)]'
                  : 'border-[rgba(0,65,106,0.12)] bg-white/90 text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.28)]'
              }`}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>

      <ServiceCalendarView
        events={events}
        month={month}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
      />
    </div>
  );
};
