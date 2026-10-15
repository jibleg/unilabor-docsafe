import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AttendanceDaysPage } from '../AttendanceDaysPage';
import { ATTENDANCE_READONLY, callsTo, emptyAll, emptyBodies, expectNoBrokenText, failAllReads, fx, httpError, installHarness, networkError, pending, renderPage, respond, setAuth } from './harness';
import { ConfirmHost } from '../../../components/ConfirmHost';

vi.mock('../../../api/axios', async () => (await import('./harness')).axiosModule());
installHarness();

const page = (qs = '') => renderPage(<><AttendanceDaysPage /><ConfirmHost /></>, '/attendance/days' + qs, '/attendance/days');
const lastDays = () => callsTo('GET', '/attendance/days').at(-1)?.params;

const withProblemDays = () => {
  const base = fx<{ data: Array<Record<string, unknown>> }>('days');
  const [a, b, c] = base.data;
  base.data = [
    { ...a, id: 9001, day_result: 'absent', reason: 'no_punches', expected_start_time: '07:00', expected_end_time: '15:00' },
    { ...b, id: 9002, day_result: 'late', reason: 'late_entry', clock_in_at: '2026-10-10T13:20:00.000Z', late_minutes: 20, expected_start_time: '07:00', expected_end_time: '15:00' },
    { ...c, id: 9003, day_result: 'on_time', clock_in_at: '2026-10-09T13:00:00.000Z', clock_out_at: '2026-10-09T21:00:00.000Z', worked_hours: 8, overtime_hours: 1.5 },
  ];
  respond('GET', '/attendance/days', () => structuredClone(base));
};

describe('Dias', () => {
  it('cargando', async () => {
    respond('GET', '/attendance/days', () => pending());
    await page();
    expect(screen.getByText('Cargando días…')).toBeInTheDocument();
  });

  it('con datos reales', async () => {
    await page();
    expect(await screen.findByRole('heading', { name: /Días/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Cargando días…')).not.toBeInTheDocument());
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
    expectNoBrokenText();
  });

  it('vacio con rango pasado', async () => {
    emptyAll(emptyBodies);
    await page('?from=2026-10-01&to=2026-10-05');
    expect(await screen.findByText('No hay días para los filtros seleccionados.')).toBeInTheDocument();
    expectNoBrokenText();
  });

  it('vacio con el rango por defecto (hoy): avisa que el dia aun no se calcula', async () => {
    emptyAll(emptyBodies);
    await page();
    expect(await screen.findByText(/aún no está calculado/)).toBeInTheDocument();
    expectNoBrokenText();
  });

  it.each([['500', () => httpError(500, { message: 'Falla' })], ['403', () => httpError(403)], ['red', () => networkError()]])('error %s -> Reintentar', async (_n, mk) => {
    failAllReads(mk);
    await page();
    const retry = await screen.findByRole('button', { name: /Reintentar/ });
    respond('GET', '/attendance/days', () => fx('days'));
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument());
  });

  it('filtros viven en la URL y viajan al API', async () => {
    await page('?from=2026-10-01&to=2026-10-12&branch=1&result=problems');
    await waitFor(() => expect(callsTo('GET', '/attendance/days').length).toBeGreaterThan(0));
    expect(lastDays()).toMatchObject({ from: '2026-10-01', to: '2026-10-12', branch_id: '1', only_issues: true, page: 1 });
    fireEvent.click(screen.getByLabelText('Solo con incidencias'));
    await waitFor(() => expect(lastDays()).toMatchObject({ result: 'incident' }));
    expect(screen.getByTestId('location').textContent).toContain('result=incident');
  });

  it('rango invalido no consulta y avisa', async () => {
    await page('?from=2026-10-12&to=2026-10-01');
    expect(await screen.findByText('Corrige el rango de fechas para consultar.')).toBeInTheDocument();
    expect(callsTo('GET', '/attendance/days')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Recalcular rango/ })).toBeDisabled();
  });

  it('Excel y Horas extra mandan los filtros', async () => {
    respond('GET', /export\/(days|overtime)\.xlsx/, () => new Blob(['x']));
    await page('?from=2026-10-01&to=2026-10-12&result=problems&branch=1');
    await screen.findByRole('heading', { name: /Días/ });
    fireEvent.click(screen.getByRole('button', { name: /^Excel$/ }));
    await waitFor(() => expect(callsTo('GET', /export\/days/)).toHaveLength(1));
    expect(callsTo('GET', /export\/days/)[0].params).toEqual({ from: '2026-10-01', to: '2026-10-12', branch_id: '1', result: 'late,absent,partial_absence,early_departure' });
    fireEvent.click(screen.getByRole('button', { name: /Horas extra/ }));
    await waitFor(() => expect(callsTo('GET', /export\/overtime/)).toHaveLength(1));
    expect(callsTo('GET', /export\/overtime/)[0].params).toEqual({ from: '2026-10-01', to: '2026-10-12', branch_id: '1' });
  });

  it('recalcular: confirma y llama al API con el rango', async () => {
    respond('POST', '/attendance/days/recalculate', () => ({ days: 3, employees: 2 }));
    await page('?from=2026-10-01&to=2026-10-05');
    await screen.findByRole('heading', { name: /Días/ });
    fireEvent.click(screen.getByRole('button', { name: /Recalcular rango/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Recalcular rango' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Recalcular' }));
    const confirmBtn = await screen.findAllByRole('button', { name: 'Recalcular' });
    fireEvent.click(confirmBtn[confirmBtn.length - 1]);
    await waitFor(() => expect(callsTo('POST', '/attendance/days/recalculate')).toHaveLength(1));
    expect(callsTo('POST', '/attendance/days/recalculate')[0].data).toEqual({ from: '2026-10-01', to: '2026-10-05' });
  });

  it('justificar valida motivo >= 5 y comprobante, y envia FormData', async () => {
    withProblemDays();
    respond('POST', /\/attendance\/days\/\d+\/[\d-]+\/justify/, () => ({}));
    await page('?from=2026-10-01&to=2026-10-12');
    const btn = (await screen.findAllByRole('button', { name: /^Justificar / }))[0];
    fireEvent.click(btn);
    const dialog = await screen.findByRole('dialog', { name: 'Justificar día' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Justificar' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('al menos 5 caracteres');
    fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: 'abcd' } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('al menos 5 caracteres');
    fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: 'Cita medica' } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Adjunta el comprobante');
    const file = new File(['x'], 'c.pdf', { type: 'application/pdf' });
    fireEvent.change(within(dialog).getByLabelText(/Comprobante/), { target: { files: [file] } });
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Justificar' }));
    await waitFor(() => expect(callsTo('POST', /justify$/)).toHaveLength(1));
    expect(callsTo('POST', /justify$/)[0].data).toBeInstanceOf(FormData);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('checada manual valida fecha futura y motivo', async () => {
    withProblemDays();
    respond('POST', '/attendance/punches/manual', () => ({ recalculation: { employees: 1, days: 1 } }));
    await page('?from=2026-10-01&to=2026-10-12');
    fireEvent.click((await screen.findAllByRole('button', { name: /^Checada manual / }))[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Checada manual' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Indica la hora');
    fireEvent.change(within(dialog).getByLabelText('Fecha'), { target: { value: '2999-01-01' } });
    fireEvent.change(within(dialog).getByLabelText('Hora'), { target: { value: '08:00' } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('futura');
    fireEvent.change(within(dialog).getByLabelText('Fecha'), { target: { value: '2026-10-10' } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('al menos 5');
    fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: 'Olvido checar' } });
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(callsTo('POST', '/attendance/punches/manual')).toHaveLength(1));
    expect(callsTo('POST', '/attendance/punches/manual')[0].data).toMatchObject({ work_date: '2026-10-10', time: '08:00', punch_type: 'in', justification: 'Olvido checar' });
  });

  it('solo lectura: no hay acciones de escritura', async () => {
    setAuth(ATTENDANCE_READONLY);
    withProblemDays();
    await page('?from=2026-10-01&to=2026-10-12');
    await screen.findByRole('heading', { name: /Días/ });
    await waitFor(() => expect(screen.queryByText('Cargando días…')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Recalcular rango/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^Justificar / })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /^Checada manual / })).toHaveLength(0);
    expectNoBrokenText();
  });
});
