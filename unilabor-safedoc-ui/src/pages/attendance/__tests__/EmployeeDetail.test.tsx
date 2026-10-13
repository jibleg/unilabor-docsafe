import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AttendanceEmployeeDetailPage } from '../AttendanceEmployeeDetailPage';
import { ATTENDANCE_READONLY, callsTo, expectNoBrokenText, failAllReads, fx, httpError, installHarness, networkError, pending, renderPage, respond, setAuth } from './harness';

vi.mock('../../../api/axios', async () => (await import('./harness')).axiosModule());
vi.mock('../../../utils/notify', async () => (await import('./harness')).notifyModule());
installHarness();

const page = (id = '3') => renderPage(<AttendanceEmployeeDetailPage />, `/attendance/employees/${id}`, '/attendance/employees/:id');
const NAME = () => fx<{ employee: { full_name: string } }>('employee-detail').employee.full_name;
const ready = () => screen.findByRole('heading', { level: 1, name: NAME() });

const vacations = () => ({
  employee: { id: 3, full_name: NAME(), employee_code: 'AKHA' },
  hire_date: '2021-03-01',
  periods: [
    { id: 11, seniority_year: 1, period_start_date: '2022-03-01', period_due_date: '2023-09-01', days_entitled: 12, days_adjustment: 0, adjustment_reason: null, days_taken: 12, expired: true, balance: 0 },
    { id: 12, seniority_year: 5, period_start_date: '2026-03-01', period_due_date: '2027-09-01', days_entitled: 14, days_adjustment: 2, adjustment_reason: 'Bono', days_taken: 3, expired: false, balance: 13 },
  ],
  balance: { entitled: 14, adjustment: 2, taken: 3, balance: 13, expiring: { days: 2, due_date: '2027-09-01' } },
});

describe('Ficha de colaborador', () => {
  it('cargando', async () => {
    respond('GET', /^\/attendance\/employees\/\d+$/, () => pending());
    await page();
    expect(screen.getByText('Cargando ficha…')).toBeInTheDocument();
  });

  it('con datos reales: datos, vacaciones sin fecha de ingreso, horario y actividad', async () => {
    await page();
    await ready();
    expect(screen.getByText('Datos de asistencia')).toBeInTheDocument();
    expect(await screen.findByText(/Sin fecha de ingreso/)).toBeInTheDocument();
    expect(await screen.findByText('Horario de las próximas 2 semanas')).toBeInTheDocument();
    expect(await screen.findByText('Últimos días')).toBeInTheDocument();
    expectNoBrokenText();
  });

  it('id invalido', async () => {
    await page('abc');
    expect(await screen.findByText('Colaborador no válido.')).toBeInTheDocument();
    expect(callsTo('GET', /employees\/NaN/)).toHaveLength(0);
  });

  it.each([['404', () => httpError(404, { message: 'No existe' })], ['500', () => httpError(500)], ['red', () => networkError()]])('error %s -> Reintentar', async (_n, mk) => {
    failAllReads(mk);
    await page();
    const retry = await screen.findByRole('button', { name: /Reintentar/ });
    respond('GET', /^\/attendance\/employees\/\d+$/, () => fx('employee-detail'));
    fireEvent.click(retry);
    await ready();
  });

  it('tarjetas secundarias con error muestran Reintentar sin tumbar la ficha', async () => {
    respond('GET', /vacations\/employees/, () => { throw httpError(500); });
    respond('GET', /schedule\/employee/, () => { throw httpError(500); });
    respond('GET', '/attendance/days', () => { throw httpError(500); });
    respond('GET', '/attendance/incidents', () => { throw httpError(500); });
    await page();
    await ready();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Reintentar/ }).length).toBeGreaterThanOrEqual(2));
    expect(screen.getByText('Datos de asistencia')).toBeInTheDocument();
  });

  it('editar datos valida el numero de empleado y guarda', async () => {
    respond('PATCH', /employees\/3$/, () => ({ employee: { ...fx<{ employee: object }>('employee-detail').employee, device_employee_number: '90210' } }));
    await page();
    await ready();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar datos de asistencia' }));
    const num = await screen.findByLabelText('Número de empleado');
    fireEvent.change(num, { target: { value: 'ab cd!' } });
    expect(num).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Solo dígitos');
    expect(callsTo('PATCH', /employees\/3$/)).toHaveLength(0);
    fireEvent.change(num, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    // habilitado + sin numero => error
    expect(screen.getByRole('alert')).toHaveTextContent('Para habilitar necesitas sucursal y número de empleado.');
    fireEvent.change(num, { target: { value: '90210' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(callsTo('PATCH', /employees\/3$/)).toHaveLength(1));
    expect(callsTo('PATCH', /employees\/3$/)[0].data).toMatchObject({ is_enabled: true, device_employee_number: '90210', branch_id: 1 });
    await waitFor(() => expect(screen.queryByLabelText('Número de empleado')).not.toBeInTheDocument());
    expect(await screen.findByText('90210')).toBeInTheDocument();
  });

  it('fotografía: ofrece cargar desde archivo y abre el panel de recorte', async () => {
    await page();
    await ready();
    expect(await screen.findByText('Sin fotografía')).toBeInTheDocument();
    const input = screen.getByLabelText('Cargar fotografía desde archivo') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'rostro.jpg', { type: 'image/jpeg' })] } });
    const drawer = await screen.findByRole('dialog', { name: 'Fotografía de rostro' });
    expect(drawer).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar fotografía/ })).toBeDisabled();
  });

  it('error 409 de numero repetido se muestra', async () => {
    respond('PATCH', /employees\/3$/, () => { throw httpError(409, { message: 'El numero de empleado X ya lo usa Fulano.' }); });
    await page();
    await ready();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar datos de asistencia' }));
    fireEvent.change(await screen.findByLabelText('Número de empleado'), { target: { value: '777' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ya lo usa Fulano');
  });

  it('vacaciones con periodos: saldo, vencido, ajuste con validaciones', async () => {
    respond('GET', /vacations\/employees\/\d+$/, () => vacations());
    respond('POST', '/attendance/vacations/adjust', () => ({ ...vacations(), balance: { ...vacations().balance, balance: 12 } }));
    await page();
    await ready();
    expect(await screen.findByText('días disponibles')).toBeInTheDocument();
    expect(screen.getByText(/2 días vencen el/)).toBeInTheDocument();
    expect(screen.getByText('Vencido')).toBeInTheDocument();
    expectNoBrokenText();
    fireEvent.click(screen.getByRole('button', { name: /Ajustar/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Ajuste de vacaciones' });
    expect(within(dialog).getByLabelText('Periodo')).toHaveValue('12');
    fireEvent.change(within(dialog).getByLabelText(/Ajuste \(días/), { target: { value: '0.3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar/ }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('pasos de 0.5');
    fireEvent.change(within(dialog).getByLabelText(/Ajuste \(días/), { target: { value: '70' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar/ }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('-60 a 60');
    fireEvent.change(within(dialog).getByLabelText(/Ajuste \(días/), { target: { value: '1.5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar/ }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('al menos 5 caracteres');
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Corrección de saldo' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(callsTo('POST', '/attendance/vacations/adjust')).toHaveLength(1));
    expect(callsTo('POST', '/attendance/vacations/adjust')[0].data).toEqual({ period_id: 12, adjustment: 1.5, reason: 'Corrección de saldo' });
  });

  it('abrir periodos', async () => {
    respond('POST', /open-periods/, () => vacations());
    await page();
    await ready();
    fireEvent.click(await screen.findByRole('button', { name: /Abrir periodos/ }));
    await waitFor(() => expect(callsTo('POST', /open-periods/)).toHaveLength(1));
    expect(await screen.findByText('días disponibles')).toBeInTheDocument();
  });

  it('horario del colaborador y capturar huella/rostro requieren sincronizado', async () => {
    await page();
    await ready();
    const finger = await screen.findByRole('button', { name: /Capturar huella/ });
    expect(finger).toBeDisabled();
    expect((await screen.findAllByText(/TEST-UI Matutino 07:00-15:00/)).length).toBeGreaterThan(0);
  });

  it('con colaborador sincronizado captura huella', async () => {
    const e = fx<{ employee: object }>('employee-detail');
    respond('GET', /^\/attendance\/employees\/\d+$/, () => ({ employee: { ...e.employee, device_sync_status: 'synced', device_synced_at: '2026-10-12T18:00:00.000Z' } }));
    respond('POST', /devices\/employees\/3\/enroll/, () => ({ order_id: 1, terminal_id: 2 }));
    await page();
    await ready();
    const finger = await screen.findByRole('button', { name: /Capturar huella/ });
    await waitFor(() => expect(finger).toBeEnabled());
    fireEvent.click(finger);
    await waitFor(() => expect(callsTo('POST', /enroll/)).toHaveLength(1));
    expect(callsTo('POST', /enroll/)[0].data).toEqual({ mode: 'fingerprint' });
  });

  it('solo lectura: sin editar, ajustar, abrir periodos ni captura', async () => {
    setAuth(ATTENDANCE_READONLY);
    respond('GET', /vacations\/employees\/\d+$/, () => vacations());
    await page();
    await ready();
    await screen.findByText('días disponibles');
    expect(screen.queryByRole('button', { name: 'Editar datos de asistencia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajustar|Abrir periodos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Capturar/ })).not.toBeInTheDocument();
  });
});
