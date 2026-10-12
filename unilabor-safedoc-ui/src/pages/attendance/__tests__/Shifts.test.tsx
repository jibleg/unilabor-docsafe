import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AttendanceShiftsPage } from '../AttendanceShiftsPage';
import * as notify from '../../../utils/notify';
import { callsTo, emptyAll, emptyBodies, expectNoBrokenText, failAllReads, fx, httpError, installHarness, networkError, pending, renderPage, respond } from './harness';

vi.mock('../../../api/axios', async () => (await import('./harness')).axiosModule());
vi.mock('../../../utils/notify', async () => (await import('./harness')).notifyModule());
installHarness();

const page = () => renderPage(<AttendanceShiftsPage />, '/attendance/shifts');

describe('Turnos', () => {
  it('cargando', async () => {
    respond('GET', '/attendance/shifts', () => pending());
    await page();
    expect(screen.getByText('Cargando turnos…')).toBeInTheDocument();
  });

  it('con datos reales marca nocturno y horas netas', async () => {
    await page();
    expect(await screen.findByText('TEST-UI Nocturno')).toBeInTheDocument();
    expect(screen.getByText('nocturno')).toBeInTheDocument();
    expect(screen.getByText('22:00–06:00')).toBeInTheDocument();
    expect(screen.getAllByText('7.5 h')).toHaveLength(2);
    expectNoBrokenText();
  });

  it('vacio ofrece crear el primero', async () => {
    emptyAll(emptyBodies);
    await page();
    expect(await screen.findByText(/Aún no hay turnos/)).toBeInTheDocument();
  });

  it.each([['500', () => httpError(500)], ['403', () => httpError(403)], ['red', () => networkError()]])('error %s -> Reintentar', async (_n, mk) => {
    failAllReads(mk);
    await page();
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    respond('GET', '/attendance/shifts', () => fx('shifts'));
    fireEvent.click(retry);
    expect(await screen.findByText('TEST-UI Matutino')).toBeInTheDocument();
  });

  it('crear turno: valida nombre, vista previa nocturna y envia', async () => {
    respond('POST', '/attendance/shifts', () => ({ shift: { ...fx<{ shifts: object[] }>('shifts').shifts[0], id: 200 } }));
    await page();
    await screen.findByText('TEST-UI Matutino');
    fireEvent.click(screen.getAllByRole('button', { name: /Nuevo turno/ })[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar/ }));
    expect(notify.notifyWarning).toHaveBeenCalledWith('El nombre debe tener al menos 2 caracteres.');
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'TEST-UI Guardia' } });
    fireEvent.change(within(dialog).getByLabelText('Entrada'), { target: { value: '21:00' } });
    fireEvent.change(within(dialog).getByLabelText('Salida'), { target: { value: '05:00' } });
    expect(within(dialog).getByText(/Cruza medianoche/)).toBeInTheDocument();
    expect(within(dialog).getByText(/21:00-05:00 · 8 h · TEST-UI Guardia/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Descanso (min)'), { target: { value: '600' } });
    expect(within(dialog).getByText(/El descanso debe estar entre 0 y 480/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar/ }));
    expect(callsTo('POST', '/attendance/shifts')).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText('Descanso (min)'), { target: { value: '30' } });
    fireEvent.click(within(dialog).getByLabelText(/Flexible/));
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(callsTo('POST', '/attendance/shifts')).toHaveLength(1));
    expect(callsTo('POST', '/attendance/shifts')[0].data).toMatchObject({ name: 'TEST-UI Guardia', start_time: '21:00', end_time: '05:00', break_minutes: 30, shift_type: 'flexible' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(callsTo('GET', '/attendance/shifts').length).toBeGreaterThan(1));
  });

  it('editar turno precarga valores y permite desactivar', async () => {
    respond('PATCH', /shifts\/\d+/, () => ({ shift: fx<{ shifts: unknown[] }>('shifts').shifts[0] }));
    await page();
    await screen.findByText('TEST-UI Matutino');
    fireEvent.click(screen.getByRole('button', { name: 'Editar TEST-UI Matutino' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar turno' });
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('TEST-UI Matutino');
    expect(within(dialog).getByLabelText('Entrada')).toHaveValue('07:00');
    fireEvent.click(within(dialog).getByLabelText(/Turno activo/));
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(callsTo('PATCH', /shifts\/116/)).toHaveLength(1));
    expect(callsTo('PATCH', /shifts\/116/)[0].data).toMatchObject({ is_active: false });
  });

  it('error al guardar deja el modal abierto', async () => {
    respond('POST', '/attendance/shifts', () => { throw httpError(409, { message: 'Nombre duplicado' }); });
    await page();
    await screen.findByText('TEST-UI Matutino');
    fireEvent.click(screen.getAllByRole('button', { name: /Nuevo turno/ })[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Dup' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(notify.notifyError).toHaveBeenCalledWith('Nombre duplicado'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
