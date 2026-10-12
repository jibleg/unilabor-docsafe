import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { getApiErrorMessage } from '../../api/service';
import {
  deleteAttendanceAgent,
  getDevicesOverview,
  listDeviceOrders,
  rotateAttendanceAgentKey,
  syncAttendanceAgent,
  testAttendanceAgent,
  updateAttendanceAgent,
  updateAttendanceTerminal,
  type AgentKeyResult,
  type DeviceOrdersPage,
  type DeviceOrderStatus,
  type DevicesBranchOverview,
  type DevicesOverview,
} from '../../api/service.api-attendance-devices';
import { AgentInstallHelp } from '../../components/attendance/devices/AgentInstallHelp';
import { AgentKeyModal } from '../../components/attendance/devices/AgentKeyModal';
import { BranchCard } from '../../components/attendance/devices/BranchCard';
import { CreateAgentModal } from '../../components/attendance/devices/CreateAgentModal';
import { syncResultMessage, ORDER_STATUS_OPTIONS } from '../../components/attendance/devices/deviceHelpers';
import { inputClass, secondaryButtonClass } from '../../components/attendance/devices/ModalShell';
import { OrdersTable } from '../../components/attendance/devices/OrdersTable';
import { confirmAction } from '../../utils/confirm';
import { notifyError, notifyInfo, notifySuccess } from '../../utils/notify';

const REFRESH_MS = 30_000;
const ORDERS_LIMIT = 15;

export const AttendanceDevicesPage = () => {
  const [overview, setOverview] = useState<DevicesOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAgentId, setBusyAgentId] = useState<number | null>(null);
  const [createFor, setCreateFor] = useState<DevicesBranchOverview | null>(null);
  const [keyResult, setKeyResult] = useState<{ result: AgentKeyResult; origin: 'created' | 'rotated' } | null>(null);

  const [orders, setOrders] = useState<DeviceOrdersPage | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const ordersFilterRef = useRef({ ordersPage, agentFilter, statusFilter });

  useEffect(() => {
    ordersFilterRef.current = { ordersPage, agentFilter, statusFilter };
  });

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await getDevicesOverview());
      setLoadError(false);
    } catch (error) {
      setLoadError(true);
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el panorama de relojes.'));
    }
  }, []);

  const loadOrders = useCallback(async () => {
    const { ordersPage: page, agentFilter: agent, statusFilter: status } = ordersFilterRef.current;
    setOrdersLoading(true);
    try {
      setOrders(
        await listDeviceOrders({
          page,
          limit: ORDERS_LIMIT,
          agent_id: agent ? Number(agent) : undefined,
          status: (status || undefined) as DeviceOrderStatus | undefined,
        }),
      );
      setOrdersError(false);
    } catch {
      setOrdersError(true);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadOverview(), loadOrders()]);
    setRefreshing(false);
  }, [loadOrders, loadOverview]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // Recarga ordenes al cambiar pagina o filtros.
  useEffect(() => {
    void loadOrders();
  }, [ordersPage, agentFilter, statusFilter, loadOrders]);

  // Refresco automatico cada 30 s mientras la pestana sea visible.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void refreshAll();
    };
    const handle = window.setInterval(tick, REFRESH_MS);
    return () => window.clearInterval(handle);
  }, [refreshAll]);

  const withBusy = async (agentId: number, task: () => Promise<void>) => {
    setBusyAgentId(agentId);
    try {
      await task();
    } finally {
      setBusyAgentId(null);
    }
  };

  const findAgentName = (agentId: number): string =>
    overview?.branches.find((branch) => branch.agent?.id === agentId)?.agent?.name ?? 'el agente';

  const handleRotate = async (agentId: number) => {
    const ok = await confirmAction(
      'Rotar clave',
      `La clave actual de "${findAgentName(agentId)}" dejará de funcionar y tendrás que actualizar el archivo de configuración del agente.`,
      'Rotar clave',
      'danger',
    );
    if (!ok) return;
    await withBusy(agentId, async () => {
      try {
        setKeyResult({ result: await rotateAttendanceAgentKey(agentId), origin: 'rotated' });
        void loadOverview();
      } catch (error) {
        notifyError(getApiErrorMessage(error, 'No se pudo rotar la clave.'));
      }
    });
  };

  const handleTest = (agentId: number) =>
    withBusy(agentId, async () => {
      try {
        await testAttendanceAgent(agentId);
        notifySuccess('Orden de prueba enviada; el agente la tomará en unos segundos.');
        void loadOrders();
      } catch (error) {
        notifyError(getApiErrorMessage(error, 'No se pudo enviar la orden de prueba.'));
      }
    });

  const handleSync = (agentId: number, all: boolean) =>
    withBusy(agentId, async () => {
      try {
        const result = await syncAttendanceAgent(agentId, all);
        (result.queued === 0 ? notifyInfo : notifySuccess)(syncResultMessage(result));
        void refreshAll();
      } catch (error) {
        notifyError(getApiErrorMessage(error, 'No se pudo sincronizar.'));
      }
    });

  const handleToggleActive = async (agentId: number, active: boolean) => {
    if (!active) {
      const ok = await confirmAction(
        'Desactivar agente',
        `"${findAgentName(agentId)}" dejará de recibir órdenes y de enviar checadas hasta que lo reactives.`,
        'Desactivar',
        'danger',
      );
      if (!ok) return;
    }
    await withBusy(agentId, async () => {
      try {
        await updateAttendanceAgent(agentId, { is_active: active });
        notifySuccess(active ? 'Agente reactivado.' : 'Agente desactivado.');
        await loadOverview();
      } catch (error) {
        notifyError(getApiErrorMessage(error, 'No se pudo cambiar el estado del agente.'));
      }
    });
  };

  const handleDelete = async (agentId: number) => {
    const ok = await confirmAction(
      'Eliminar agente',
      `Se eliminarán "${findAgentName(agentId)}", sus relojes y sus órdenes. Si algún reloj ya tiene checadas, no se podrá eliminar.`,
      'Eliminar',
      'danger',
    );
    if (!ok) return;
    await withBusy(agentId, async () => {
      try {
        await deleteAttendanceAgent(agentId);
        notifySuccess('Agente eliminado.');
        await refreshAll();
      } catch (error) {
        notifyError(getApiErrorMessage(error, 'No se pudo eliminar el agente.'));
      }
    });
  };

  const handleRenameTerminal = async (terminalId: number, name: string): Promise<boolean> => {
    try {
      await updateAttendanceTerminal(terminalId, { name });
      notifySuccess('Reloj renombrado.');
      await loadOverview();
      return true;
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo renombrar el reloj.'));
      return false;
    }
  };

  const agents = (overview?.branches ?? []).flatMap((branch) => (branch.agent ? [branch.agent] : []));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-brand-700)]">Relojes</h1>
          <p className="text-sm text-slate-500">Agentes por sucursal y relojes checadores. Se actualiza solo cada 30 s.</p>
        </div>
        <button type="button" className={secondaryButtonClass} onClick={() => void refreshAll()} disabled={refreshing}>
          {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Actualizar
        </button>
      </div>

      <AgentInstallHelp />

      {!overview && !loadError ? (
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} /> Cargando relojes…</div>
      ) : null}
      {!overview && loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          No se pudo cargar el panorama.{' '}
          <button type="button" onClick={() => void refreshAll()} className="font-semibold underline">Reintentar</button>
        </div>
      ) : null}
      {overview && overview.branches.length === 0 ? (
        <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">No hay sucursales activas.</p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {overview?.branches.map((branch) => (
          <BranchCard
            key={branch.branch_id}
            branch={branch}
            busy={branch.agent ? busyAgentId === branch.agent.id : false}
            onCreateAgent={setCreateFor}
            onRotateKey={(id) => void handleRotate(id)}
            onTest={(id) => void handleTest(id)}
            onSync={(id, all) => void handleSync(id, all)}
            onToggleActive={(id, active) => void handleToggleActive(id, active)}
            onDelete={(id) => void handleDelete(id)}
            onRenameTerminal={handleRenameTerminal}
          />
        ))}
      </div>

      <section className="rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white/90 shadow-sm" aria-label="Últimas órdenes">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <h2 className="text-base font-bold text-[var(--color-brand-700)]">Últimas órdenes</h2>
          <div className="flex flex-wrap gap-2">
            <select
              className={`${inputClass} !w-auto`}
              aria-label="Filtrar por agente"
              value={agentFilter}
              onChange={(event) => { setAgentFilter(event.target.value); setOrdersPage(1); }}
            >
              <option value="">Todos los agentes</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
            <select
              className={`${inputClass} !w-auto`}
              aria-label="Filtrar por estado"
              value={statusFilter}
              onChange={(event) => { setStatusFilter(event.target.value); setOrdersPage(1); }}
            >
              <option value="">Todos los estados</option>
              {ORDER_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
        <OrdersTable
          orders={orders?.orders ?? []}
          loading={ordersLoading}
          error={ordersError}
          page={ordersPage}
          total={orders?.total ?? 0}
          limit={ORDERS_LIMIT}
          onPageChange={setOrdersPage}
          onRetry={() => void loadOrders()}
        />
      </section>

      {createFor ? (
        <CreateAgentModal
          branch={createFor}
          onClose={() => setCreateFor(null)}
          onCreated={(result) => {
            setCreateFor(null);
            setKeyResult({ result, origin: 'created' });
            void loadOverview();
          }}
        />
      ) : null}
      {keyResult ? (
        <AgentKeyModal result={keyResult.result} origin={keyResult.origin} onClose={() => setKeyResult(null)} />
      ) : null}
    </div>
  );
};
