import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AttendancePunchesPage } from '../AttendancePunchesPage';
import { ConfirmHost } from '../../../components/ConfirmHost';
import { ATTENDANCE_READONLY, callsTo, emptyAll, emptyBodies, expectNoBrokenText, failAllReads, fx, httpError, installHarness, networkError, pending, renderPage, respond, setAuth } from './harness';

vi.mock('../../../api/axios', async () => (await import('./harness')).axiosModule());
installHarness();

const page = (qs = '') => renderPage(<><AttendancePunchesPage /><ConfirmHost /></>, '/attendance/punches' + qs, '/attendance/punches');
const lastPunches = () => callsTo('GET', '/attendance/punches').at(-1)?.params;
const loaded = () => waitFor(() => expect(screen.queryByText('Cargando checadas…')).not.toBeInTheDocument());

describe('Checadas', () => {
  it('cargando', async () => {
    respond('GET', '/attendance/punches', () => pending());
    await page();
    expect(screen.getByText('Cargando checadas…')).toBeInTheDocument();
  });

  it('con datos reales', async () => {
    await page();
    expect(await screen.findByRole('heading', { name: 'Checadas' })).toBeInTheDocument();
    await loaded();
    expect(screen.getAllByRole('row').length).toBeGreaterThan(2);
    expectNoBrokenText();
  });

  it('vacio', async () => {
    emptyAll(emptyBodies);
    await page();
    expect(await screen.findByText('No hay checadas para los filtros seleccionados.')).toBeInTheDocument();
  });

  it.each([['500', () => httpError(500)], ['403', () => httpError(403)], ['red', () => networkError()]])('error %s -> Reintentar', async (_n, mk) => {
    failAllReads(mk);
    await page();
    const retry = await screen.findByRole('button', { name: /Reintentar/ });
    respond('GET', '/attendance/punches', () => fx('punches'));
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument());
  });

  it('?review=pending viaja como review_status y el select lo refleja', async () => {
    await page('?review=pending');
    await loaded();
    expect(lastPunches()).toMatchObject({ review_status: 'pending' });
    expect(screen.getByLabelText('Revisión')).toHaveValue('pending');
    fireEvent.change(screen.getByLabelText('Origen'), { target: { value: 'manual' } });
    await waitFor(() => expect(lastPunches()).toMatchObject({ review_status: 'pending', source: 'manual' }));
    expect(screen.getByTestId('location').textContent).toContain('source=manual');
  });

  it('valor de review invalido en la URL se ignora', async () => {
    await page('?review=hack');
    await loaded();
    expect(lastPunches()).not.toHaveProperty('review_status');
  });

  it('busqueda con debounce', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await page();
    await vi.waitFor(() => expect(callsTo('GET', '/attendance/punches').length).toBe(1));
    fireEvent.change(screen.getByPlaceholderText(/Buscar|nombre|código/i), { target: { value: 'Ana' } });
    expect(callsTo('GET', '/attendance/punches').length).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await vi.waitFor(() => expect(lastPunches()).toMatchObject({ search: 'Ana' }));
  });

  it('boton de foto solo si has_photo', async () => {
    await page();
    await loaded();
    const data = fx<{ data: Array<{ has_photo: boolean }> }>('punches').data;
    expect(screen.getAllByRole('button', { name: 'Ver foto de la checada' })).toHaveLength(data.filter((p) => p.has_photo).length);
    respond('GET', /punches\/\d+\/photo/, () => new Blob(['x']));
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver foto de la checada' })[0]);
    await waitFor(() => expect(window.open).toHaveBeenCalled());
  });

  it('aprobar pide confirmacion y llama review approve', async () => {
    respond('POST', /punches\/\d+\/review/, () => ({ recalculation: { employees: 1, days: 0 } }));
    await page();
    await loaded();
    fireEvent.click(screen.getAllByRole('button', { name: 'Aprobar checada' })[0]);
    const confirm = await screen.findByRole('button', { name: 'Aprobar' });
    fireEvent.click(confirm);
    await waitFor(() => expect(callsTo('POST', /review$/)).toHaveLength(1));
    expect(callsTo('POST', /review$/)[0].data).toEqual({ decision: 'approve' });
  });

  it('rechazar exige motivo >= 5', async () => {
    respond('POST', /punches\/\d+\/review/, () => ({ recalculation: { employees: 1, days: 0 } }));
    await page();
    await loaded();
    fireEvent.click(screen.getAllByRole('button', { name: 'Rechazar checada' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Rechazar checada' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rechazar' }));
    expect(within(dialog).getByRole('alert')).toBeInTheDocument();
    expect(callsTo('POST', /review$/)).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: 'Reloj desfasado' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(callsTo('POST', /review$/)).toHaveLength(1));
    expect(callsTo('POST', /review$/)[0].data).toEqual({ decision: 'reject', reason: 'Reloj desfasado' });
  });

  it('error al rechazar mantiene el modal abierto', async () => {
    respond('POST', /punches\/\d+\/review/, () => { throw httpError(409, { message: 'Ya revisada' }); });
    await page();
    await loaded();
    fireEvent.click(screen.getAllByRole('button', { name: 'Rechazar checada' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Rechazar checada' });
    fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: 'Reloj desfasado' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(callsTo('POST', /review$/)).toHaveLength(1));
    expect(screen.getByRole('dialog', { name: 'Rechazar checada' })).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Rechazar' })).toBeEnabled());
  });

  it('vincular una checada sin colaborador', async () => {
    respond('POST', /punches\/\d+\/link-employee/, () => ({ recalculation: { employees: 1, days: 1 } }));
    await page();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Vincular a colaborador' }));
    const dialog = await screen.findByRole('dialog', { name: 'Vincular a colaborador' });
    expect(within(dialog).getByRole('button', { name: 'Vincular' })).toBeDisabled();
  });

  it('solo lectura: sin aprobar/rechazar/vincular/manual', async () => {
    setAuth(ATTENDANCE_READONLY);
    await page();
    await loaded();
    for (const name of ['Aprobar checada', 'Rechazar checada', 'Vincular a colaborador']) expect(screen.queryAllByRole('button', { name })).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Checada manual/ })).not.toBeInTheDocument();
    expectNoBrokenText();
  });
});
