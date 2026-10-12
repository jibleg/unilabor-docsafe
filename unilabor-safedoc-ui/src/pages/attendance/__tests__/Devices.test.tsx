import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AttendanceDevicesPage } from '../AttendanceDevicesPage';
import { ConfirmHost } from '../../../components/ConfirmHost';
import * as notify from '../../../utils/notify';
import { callsTo, emptyAll, emptyBodies, expectNoBrokenText, failAllReads, fx, httpError, installHarness, networkError, pending, renderPage, respond } from './harness';

vi.mock('../../../api/axios', async () => (await import('./harness')).axiosModule());
vi.mock('../../../utils/notify', async () => (await import('./harness')).notifyModule());
installHarness();

const page = () => renderPage(<><AttendanceDevicesPage /><ConfirmHost /></>, '/attendance/devices');
const ready = () => screen.findByRole('region', { name: 'Sucursal UNILABOR CENTRO' });

type Overview = { branches: Array<{ agent: Record<string, unknown> | null }> };
const activeAgent = () => {
  const o = fx<Overview>('devices-overview');
  o.branches[0].agent = { ...(o.branches[0].agent as object), is_active: true, is_online: true };
  respond('GET', '/attendance/devices/overview', () => structuredClone(o));
};
const keyResult = (key = 'sk_live_SECRETO123') => ({
  agent: { ...(fx<Overview>('devices-overview').branches[0].agent as object), branch_name: 'UNILABOR CENTRO' },
  agent_key: key,
  config: { docsafeUrl: 'https://sgc.example.com', agentKey: key },
});

describe('Relojes', () => {
  it('cargando', async () => {
    respond('GET', '/attendance/devices/overview', () => pending());
    await page();
    expect(screen.getByText('Cargando relojes…')).toBeInTheDocument();
  });

  it('una tarjeta por sucursal con agente o "Crear agente"', async () => {
    await page();
    await ready();
    const branches = fx<{ branches: Array<{ branch_name: string }> }>('devices-overview').branches;
    for (const b of branches) expect(screen.getByRole('region', { name: `Sucursal ${b.branch_name}` })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Crear agente/ }).length).toBe(branches.length - 1);
    expect(await screen.findByText('Reloj Recepcion')).toBeInTheDocument();
    expectNoBrokenText();
  });

  it('sin sucursales', async () => {
    emptyAll(emptyBodies);
    await page();
    expect(await screen.findByText('No hay sucursales activas.')).toBeInTheDocument();
    expect(await screen.findByText('No hay órdenes con esos filtros.')).toBeInTheDocument();
  });

  it.each([['500', () => httpError(500)], ['403', () => httpError(403)], ['red', () => networkError()]])('error %s -> Reintentar', async (_n, mk) => {
    failAllReads(mk);
    await page();
    const retry = await screen.findByText('Reintentar', { selector: 'button' }).catch(() => screen.getAllByRole('button', { name: 'Reintentar' })[0]);
    respond('GET', '/attendance/devices/overview', () => fx('devices-overview'));
    respond('GET', '/attendance/devices/orders', () => fx('devices-orders'));
    fireEvent.click(retry);
    await ready();
  });

  it('crear agente muestra la clave UNA vez en modal bloqueado', async () => {
    respond('POST', '/attendance/devices/agents', () => keyResult());
    await page();
    await ready();
    fireEvent.click(screen.getAllByRole('button', { name: /Crear agente/ })[0]);
    const form = await screen.findByRole('dialog', { name: 'Crear agente' });
    fireEvent.change(within(form).getByLabelText('Nombre del agente'), { target: { value: 'A' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Crear' }));
    expect(notify.notifyError).toHaveBeenCalledWith('El nombre debe tener al menos 2 caracteres.');
    expect(callsTo('POST', '/attendance/devices/agents')).toHaveLength(0);
    fireEvent.change(within(form).getByLabelText('Nombre del agente'), { target: { value: 'Agente TEST-UI' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Crear' }));
    const modal = await screen.findByRole('dialog', { name: 'Agente creado' });
    expect(callsTo('POST', '/attendance/devices/agents')[0].data).toMatchObject({ name: 'Agente TEST-UI' });
    expect(within(modal).getAllByText(/sk_live_SECRETO123/).length).toBeGreaterThan(0);
    // bloqueado: Escape y clic fuera no cierran
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.mouseDown(modal.parentElement as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'Agente creado' })).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole('button', { name: 'Ya la guardé' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // la clave ya no esta en ninguna parte del DOM
    expect(document.body.textContent).not.toContain('sk_live_SECRETO123');
  });

  it('error al crear agente deja el formulario y avisa', async () => {
    respond('POST', '/attendance/devices/agents', () => { throw httpError(409, { message: 'La sucursal ya tiene agente' }); });
    await page();
    await ready();
    fireEvent.click(screen.getAllByRole('button', { name: /Crear agente/ })[0]);
    const form = await screen.findByRole('dialog', { name: 'Crear agente' });
    fireEvent.click(within(form).getByRole('button', { name: 'Crear' }));
    await waitFor(() => expect(notify.notifyError).toHaveBeenCalledWith('La sucursal ya tiene agente'));
    expect(within(form).getByRole('button', { name: 'Crear' })).toBeEnabled();
  });

  it('rotar clave pide confirmacion y muestra la clave nueva', async () => {
    activeAgent();
    respond('POST', /agents\/3\/rotate-key/, () => keyResult('sk_NUEVA_999'));
    await page();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Rotar clave/ }));
    const confirmButtons = await screen.findAllByRole('button', { name: 'Rotar clave' });
    fireEvent.click(confirmButtons.at(-1) as HTMLElement);
    const modal = await screen.findByRole('dialog', { name: 'Clave rotada' });
    expect(within(modal).getAllByText(/sk_NUEVA_999/).length).toBeGreaterThan(0);
    expect(modal).toHaveTextContent('La clave anterior ya dejó de funcionar');
  });

  it('cancelar la confirmacion de rotar no llama a la API', async () => {
    activeAgent();
    await page();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Rotar clave/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(callsTo('POST', /rotate-key/)).toHaveLength(0);
  });

  it('eliminar agente inactivo: error 409 por checadas se muestra', async () => {
    respond('DELETE', /agents\/3$/, () => { throw httpError(409, { message: 'El reloj ya tiene checadas; no se puede eliminar.' }); });
    await page();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Eliminar/ }));
    const confirmButtons = await screen.findAllByRole('button', { name: 'Eliminar' });
    fireEvent.click(confirmButtons.at(-1) as HTMLElement);
    await waitFor(() => expect(notify.notifyError).toHaveBeenCalledWith('El reloj ya tiene checadas; no se puede eliminar.'));
    expect(screen.getByRole('region', { name: 'Sucursal UNILABOR CENTRO' })).toBeInTheDocument();
  });

  it('probar y sincronizar muestran resultado', async () => {
    activeAgent();
    respond('POST', /agents\/3\/test/, () => ({ order_id: 1 }));
    respond('POST', /agents\/3\/sync/, () => ({ queued: 0, queued_sync: 0, queued_remove: 0, skipped_without_number: 0 }));
    await page();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Probar/ }));
    await waitFor(() => expect(notify.notifySuccess).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar pendientes/ }));
    await waitFor(() => expect(callsTo('POST', /sync$/)).toHaveLength(1));
    expect(callsTo('POST', /sync$/)[0].data).toEqual({ all: false });
    await waitFor(() => expect(notify.notifyInfo).toHaveBeenCalled());
  });

  it('renombrar reloj', async () => {
    respond('PATCH', /terminals\/2/, () => ({}));
    await page();
    await ready();
    fireEvent.click(await screen.findByRole('button', { name: 'Renombrar Reloj Recepcion' }));
    fireEvent.change(screen.getByLabelText('Nombre del reloj'), { target: { value: 'Entrada principal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    await waitFor(() => expect(callsTo('PATCH', /terminals\/2/)).toHaveLength(1));
    expect(callsTo('PATCH', /terminals\/2/)[0].data).toEqual({ name: 'Entrada principal' });
  });

  it('filtros de ordenes viajan al API', async () => {
    await page();
    await ready();
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'error' } });
    await waitFor(() => expect(callsTo('GET', '/attendance/devices/orders').at(-1)?.params).toMatchObject({ status: 'error', page: 1, limit: 15 }));
    fireEvent.change(screen.getByLabelText('Filtrar por agente'), { target: { value: '3' } });
    await waitFor(() => expect(callsTo('GET', '/attendance/devices/orders').at(-1)?.params).toMatchObject({ status: 'error', agent_id: 3 }));
  });

  it('error al cargar ordenes ofrece reintentar sin tumbar el panorama', async () => {
    respond('GET', '/attendance/devices/orders', () => { throw httpError(500); });
    await page();
    await ready();
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    respond('GET', '/attendance/devices/orders', () => fx('devices-orders'));
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument());
  });

  it('refresco de 30 s: corre y se limpia al desmontar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = await page();
    await vi.waitFor(() => expect(callsTo('GET', '/attendance/devices/overview')).toHaveLength(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(callsTo('GET', '/attendance/devices/overview')).toHaveLength(2);
    expect(callsTo('GET', '/attendance/devices/orders')).toHaveLength(2);
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(callsTo('GET', '/attendance/devices/overview')).toHaveLength(2);
  });
});
