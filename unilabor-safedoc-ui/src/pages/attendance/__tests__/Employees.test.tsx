import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AttendanceEmployeesPage } from '../AttendanceEmployeesPage';
import { ConfirmHost } from '../../../components/ConfirmHost';
import * as notify from '../../../utils/notify';
import { ATTENDANCE_READONLY, callsTo, emptyAll, emptyBodies, expectNoBrokenText, failAllReads, fx, httpError, installHarness, networkError, pending, renderPage, respond, setAuth } from './harness';

vi.mock('../../../api/axios', async () => (await import('./harness')).axiosModule());
vi.mock('../../../utils/notify', async () => (await import('./harness')).notifyModule());
installHarness();

const page = (qs = '') => renderPage(<><AttendanceEmployeesPage /><ConfirmHost /></>, '/attendance/employees' + qs, '/attendance/employees');
const table = () => screen.findByRole('table');
const listCalls = () => callsTo('GET', '/attendance/employees');
const lastList = () => listCalls().at(-1)?.params;
type Emp = { id: number; full_name: string; is_enabled: boolean; branch_id: number | null; device_employee_number: string | null };
const emps = () => fx<{ data: Emp[] }>('employees').data;

describe('Colaboradores', () => {
  it('cargando', async () => {
    respond('GET', '/attendance/employees', () => pending());
    await page();
    expect(screen.getByText('Cargando colaboradores…')).toBeInTheDocument();
  });

  it('con datos reales y chips de resumen con conteos', async () => {
    await page();
    await table();
    const chips = screen.getByRole('group', { name: 'Resumen de colaboradores' });
    expect(within(chips).getByRole('button', { name: /Habilitados/ })).toHaveTextContent('3');
    expect(within(chips).getByRole('button', { name: /Por sincronizar/ })).toHaveTextContent('2');
    expectNoBrokenText();
  });

  it('vacio', async () => {
    emptyAll(emptyBodies);
    await page();
    expect(await screen.findByText('No hay colaboradores con estos filtros.')).toBeInTheDocument();
  });

  it.each([['500', () => httpError(500)], ['403', () => httpError(403)], ['red', () => networkError()]])('error %s -> Reintentar', async (_n, mk) => {
    failAllReads(mk);
    await page();
    const retry = await screen.findByRole('button', { name: /Reintentar/ });
    respond('GET', '/attendance/employees', () => fx('employees'));
    respond('GET', '/attendance/employees/summary', () => fx('employees-summary'));
    fireEvent.click(retry);
    await table();
  });

  it('el resumen fallido no rompe la pagina', async () => {
    respond('GET', '/attendance/employees/summary', () => { throw httpError(500); });
    await page();
    await table();
    expectNoBrokenText();
  });

  it('los chips filtran y se pueden quitar', async () => {
    await page();
    await table();
    const chips = screen.getByRole('group', { name: 'Resumen de colaboradores' });
    fireEvent.click(within(chips).getByRole('button', { name: /Por sincronizar/ }));
    await waitFor(() => expect(lastList()).toMatchObject({ enabled: 'true', sync_status: 'pending' }));
    fireEvent.click(within(chips).getByRole('button', { name: /Sin horario/ }));
    await waitFor(() => expect(lastList()).toMatchObject({ enabled: 'true', without_schedule: 'true' }));
    expect(lastList()).not.toHaveProperty('sync_status');
    fireEvent.click(within(chips).getByRole('button', { name: /Sin horario/ }));
    await waitFor(() => expect(lastList()).not.toHaveProperty('without_schedule'));
  });

  it('chip "Sin sucursal" recorre habilitados y filtra en el cliente', async () => {
    await page();
    await table();
    fireEvent.click(within(screen.getByRole('group', { name: 'Resumen de colaboradores' })).getByRole('button', { name: /Sin sucursal/ }));
    await waitFor(() => expect(lastList()).toMatchObject({ enabled: 'true', page: 1, limit: 100 }));
    expect(await screen.findByText('No hay colaboradores con estos filtros.')).toBeInTheDocument();
  });

  it('filtros del formulario viajan a la API', async () => {
    await page();
    await table();
    await waitFor(() => expect(screen.getAllByRole('option', { name: /UNILABOR CENTRO/ }).length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: '1' } });
    await waitFor(() => expect(lastList()).toMatchObject({ branch_id: '1' }));
    fireEvent.change(screen.getByLabelText('Habilitación'), { target: { value: 'false' } });
    await waitFor(() => expect(lastList()).toMatchObject({ enabled: 'false' }));
    fireEvent.change(screen.getByLabelText('Sincronización'), { target: { value: 'no_schedule' } });
    await waitFor(() => expect(lastList()).toMatchObject({ without_schedule: 'true' }));
  });

  it('habilitar sin sucursal o numero abre la edicion y avisa', async () => {
    await page();
    await table();
    const target = emps().find((e) => !e.is_enabled && (e.branch_id === null || !e.device_employee_number))!;
    fireEvent.click(screen.getByRole('button', { name: `Habilitar a ${target.full_name}` }));
    expect(await screen.findByRole('dialog', { name: 'Edición rápida' })).toBeInTheDocument();
    expect(notify.notifyError).toHaveBeenCalledWith('Para habilitar completa la sucursal y el número de empleado.');
  });

  it('deshabilitar pide confirmacion y hace PATCH', async () => {
    respond('PATCH', /employees\/\d+$/, () => ({ employee: emps()[0] }));
    await page();
    await table();
    const target = emps().find((e) => e.is_enabled)!;
    fireEvent.click(screen.getByRole('button', { name: `Deshabilitar a ${target.full_name}` }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Deshabilitar' })).at(-1) as HTMLElement);
    await waitFor(() => expect(callsTo('PATCH', new RegExp(`employees/${target.id}$`))).toHaveLength(1));
    expect(callsTo('PATCH', new RegExp(`employees/${target.id}$`))[0].data).toEqual({ is_enabled: false });
  });

  describe('habilitar en lote', () => {
    const open = async () => {
      await page();
      await table();
      fireEvent.click(screen.getByRole('button', { name: /Habilitar en lote/ }));
      return screen.findByRole('dialog', { name: 'Habilitar en lote' });
    };
    it('valida localmente numero y sucursal por fila', async () => {
      const dialog = await open();
      const first = emps()[0];
      fireEvent.click(await within(dialog).findByRole('checkbox', { name: `Elegir a ${first.full_name}` }));
      const input = within(dialog).getByLabelText(`Número de empleado de ${first.full_name}`);
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.click(within(dialog).getByRole('button', { name: /^Habilitar$/ }));
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Corrige las filas marcadas.');
      expect(within(dialog).getByText('Falta el número de empleado.')).toBeInTheDocument();
      // Las letras no entran al campo: solo quedan los digitos.
      fireEvent.change(input, { target: { value: 'ab-12 c3!' } });
      expect(input).toHaveValue('123');
      fireEvent.change(input, { target: { value: 'ab cd!' } });
      expect(input).toHaveValue('');
      fireEvent.click(within(dialog).getByRole('button', { name: /^Habilitar$/ }));
      expect(within(dialog).getByText('Falta el número de empleado.')).toBeInTheDocument();
      expect(callsTo('POST', '/attendance/employees/bulk-enable')).toHaveLength(0);
    });
    it('muestra errores por fila del 400 y no cierra', async () => {
      const [a, b] = emps();
      respond('POST', '/attendance/employees/bulk-enable', () => { throw httpError(400, { message: 'Hay filas con errores; no se habilito a nadie.', details: { rows: [{ employee_id: b.id, message: 'El numero de empleado X se repite.' }] } }); });
      const dialog = await open();
      fireEvent.click(await within(dialog).findByRole('checkbox', { name: `Elegir a ${a.full_name}` }));
      fireEvent.click(within(dialog).getByRole('checkbox', { name: `Elegir a ${b.full_name}` }));
      for (const e of [a, b]) fireEvent.change(within(dialog).getByLabelText(`Número de empleado de ${e.full_name}`), { target: { value: `9${e.id}` } });
      fireEvent.change(within(dialog).getByLabelText('Sucursal por defecto'), { target: { value: '1' } });
      fireEvent.click(within(dialog).getByRole('button', { name: /^Habilitar$/ }));
      await waitFor(() => expect(callsTo('POST', '/attendance/employees/bulk-enable')).toHaveLength(1));
      expect(callsTo('POST', '/attendance/employees/bulk-enable')[0].data).toEqual({
        rows: [{ employee_id: a.id, device_employee_number: `9${a.id}` }, { employee_id: b.id, device_employee_number: `9${b.id}` }],
        default_branch_id: 1,
      });
      expect(await within(dialog).findByText('El numero de empleado X se repite.')).toBeInTheDocument();
      expect(within(dialog).getByRole('alert')).toHaveTextContent('no se habilito a nadie');
    });
    it('exito cierra y recarga', async () => {
      respond('POST', '/attendance/employees/bulk-enable', () => ({ enabled: 1, employee_ids: [1] }));
      const dialog = await open();
      const a = emps()[0];
      fireEvent.click(await within(dialog).findByRole('checkbox', { name: `Elegir a ${a.full_name}` }));
      fireEvent.change(within(dialog).getByLabelText(`Número de empleado de ${a.full_name}`), { target: { value: '91' } });
      fireEvent.change(within(dialog).getByLabelText('Sucursal por defecto'), { target: { value: '1' } });
      const before = listCalls().length;
      fireEvent.click(within(dialog).getByRole('button', { name: /^Habilitar$/ }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Habilitar en lote' })).not.toBeInTheDocument());
      await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
      expect(notify.notifySuccess).toHaveBeenCalledWith('1 colaborador(es) habilitado(s).');
    });
  });

  describe('sincronizar con relojes', () => {
    it('sucursal sin agente deshabilitada; con agente encola y muestra resultado', async () => {
      respond('POST', /devices\/agents\/\d+\/sync/, () => ({ queued: 3, queued_sync: 2, queued_remove: 1, skipped_without_number: 1 }));
      await page();
      await table();
      fireEvent.click(screen.getByRole('button', { name: /Sincronizar con relojes/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Sincronizar con relojes' });
      const buttons = await within(dialog).findAllByRole('button', { name: /^Sincronizar$/ });
      expect(buttons.filter((b) => (b as HTMLButtonElement).disabled).length).toBeGreaterThan(0);
      const enabled = buttons.find((b) => !(b as HTMLButtonElement).disabled);
      // el agente del fixture esta inactivo; se habilita uno sintetico
      expect(enabled).toBeUndefined();
      expect(within(dialog).getAllByText('Sin agente instalado').length).toBeGreaterThan(0);
      expectNoBrokenText(dialog);
    });
    it('con agente activo encola', async () => {
      const o = fx<{ branches: Array<{ agent: Record<string, unknown> | null }> }>('devices-overview');
      o.branches[0].agent = { ...(o.branches[0].agent as object), id: 3, is_active: true, is_online: true };
      respond('GET', '/attendance/devices/overview', () => o);
      respond('POST', /devices\/agents\/3\/sync/, () => ({ queued: 3, queued_sync: 2, queued_remove: 1, skipped_without_number: 1 }));
      await page();
      await table();
      fireEvent.click(screen.getByRole('button', { name: /Sincronizar con relojes/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Sincronizar con relojes' });
      const btn = (await within(dialog).findAllByRole('button', { name: /^Sincronizar$/ })).find((b) => !(b as HTMLButtonElement).disabled)!;
      fireEvent.click(btn);
      expect(await within(dialog).findByText(/3 orden\(es\): 2 alta\(s\), 1 baja\(s\), 1 omitido\(s\) sin número/)).toBeInTheDocument();
    });
    it('error al consultar relojes ofrece Reintentar', async () => {
      respond('GET', '/attendance/devices/overview', () => { throw httpError(500); });
      await page();
      await table();
      fireEvent.click(screen.getByRole('button', { name: /Sincronizar con relojes/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Sincronizar con relojes' });
      expect(await within(dialog).findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    });
  });

  it('solo lectura: sin lote, sincronizar, editar ni habilitar', async () => {
    setAuth(ATTENDANCE_READONLY);
    await page();
    await table();
    expect(screen.queryByRole('button', { name: /Habilitar en lote/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sincronizar con relojes/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^(Editar|Habilitar a|Deshabilitar a) / })).toHaveLength(0);
    expect(screen.getAllByRole('link', { name: /^Ficha de / }).length).toBeGreaterThan(0);
  });
});
