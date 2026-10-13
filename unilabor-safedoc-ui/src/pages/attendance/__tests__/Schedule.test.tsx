import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AttendanceSchedulePage } from '../AttendanceSchedulePage';
import * as notify from '../../../utils/notify';
import { ATTENDANCE_READONLY, callsTo, emptyAll, emptyBodies, expectNoBrokenText, failAllReads, fx, httpError, installHarness, networkError, pending, renderPage, respond, setAuth } from './harness';

vi.mock('../../../api/axios', async () => (await import('./harness')).axiosModule());
vi.mock('../../../utils/notify', async () => (await import('./harness')).notifyModule());
installHarness();

const page = (qs = '') => renderPage(<AttendanceSchedulePage />, '/attendance/schedule' + qs);
const lastWeek = () => callsTo('GET', '/attendance/schedule').at(-1)?.params;
const ready = () => screen.findByRole('checkbox', { name: /Marcar todos/ });
const names = () => fx<{ data: Array<{ full_name: string }> }>('schedule').data.map((r) => r.full_name);

const openAssign = async () => {
  fireEvent.click(await screen.findByRole('checkbox', { name: `Marcar a ${names()[0]}` }));
  fireEvent.click(screen.getByRole('button', { name: /Programar a 1/ }));
  return screen.findByRole('dialog', { name: 'Programar turno' });
};

/** Los turnos se eligen en un desplegable: lo abre (si esta cerrado) y devuelve la opcion. */
const shiftOption = (dialog: HTMLElement, name: RegExp | string) => {
  const trigger = within(dialog).getByRole('button', { name: 'Elegir turnos' });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  return screen.getByRole('option', { name }); // el panel flota en un portal, fuera del dialogo
};

describe('Calendario de horarios', () => {
  it('cargando', async () => {
    respond('GET', '/attendance/schedule', () => pending());
    await page();
    expect(screen.getByText('Cargando calendario…')).toBeInTheDocument();
  });

  it('con datos reales: leyenda, grilla y horas', async () => {
    await page();
    await ready();
    expect(screen.getByLabelText('Leyenda de turnos')).toHaveTextContent('TEST-UI Matutino');
    expect(screen.getByText(/Horas netas de la semana/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Editar / }).length).toBeGreaterThan(0);
    expectNoBrokenText();
  });

  it('vacio', async () => {
    emptyAll(emptyBodies);
    await page();
    expect(await screen.findByText(/No hay colaboradores habilitados con esos filtros/)).toBeInTheDocument();
  });

  it.each([['500', () => httpError(500)], ['403', () => httpError(403)], ['red', () => networkError()]])('error %s -> Reintentar', async (_n, mk) => {
    failAllReads(mk);
    await page();
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    respond('GET', '/attendance/schedule', () => fx('schedule'));
    fireEvent.click(retry);
    await ready();
  });

  it('navegacion de semana mueve 7 dias desde week_start_date; Hoy limpia', async () => {
    await page();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    await waitFor(() => expect(lastWeek()).toMatchObject({ week: '2026-10-18' }));
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    await waitFor(() => expect(lastWeek()?.week).toBe('2026-10-04'));
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() => expect(lastWeek()).not.toHaveProperty('week'));
  });

  it('sucursal filtra y reinicia pagina', async () => {
    await page('?page=2');
    await ready();
    await waitFor(() => expect(screen.getAllByRole('option', { name: /UNILABOR CENTRO/ }).length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: '1' } });
    await waitFor(() => expect(lastWeek()).toMatchObject({ branch_id: 1, page: 1 }));
  });

  it('seleccionar colaboradores habilita "Programar a N"', async () => {
    await page();
    await ready();
    expect(screen.getByRole('button', { name: /Programar a 0/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: `Marcar a ${names()[0]}` }));
    expect(screen.getByRole('button', { name: /Programar a 1/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Marcar todos/ }));
    expect(screen.getByRole('button', { name: new RegExp(`Programar a ${names().length}`) })).toBeEnabled();
  });

  it('modal Programar: traslape, limite de 3 turnos, descanso y 409 con details', async () => {
    await page();
    await ready();
    const dialog = await openAssign();
    const shift = (n: string) => shiftOption(dialog, new RegExp(n));
    fireEvent.click(shift('Matutino'));
    fireEvent.click(shift('Vespertino'));
    expect(within(dialog).getByText(/se encima con/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Programar$/ }));
    expect(notify.notifyWarning).toHaveBeenCalledWith('Hay turnos que se enciman entre sí.');
    expect(callsTo('POST', '/attendance/assignments')).toHaveLength(0);
    fireEvent.click(shift('Nocturno'));
    expect(within(dialog).getByText(/Máximo 3 turnos por día|se encima/)).toBeInTheDocument();
    // descanso es excluyente
    fireEvent.click(shiftOption(dialog, /Descanso/));
    expect(within(dialog).queryByText(/se encima con/)).not.toBeInTheDocument();
    fireEvent.click(shift('Matutino'));
    respond('POST', '/attendance/assignments', () => {
      throw httpError(409, { message: 'Conflicto', details: [{ employee_id: 3, employee_name: 'Ana Torres Ruiz', conflicts: [{ date: '2026-10-12', message: 'Ya tiene 3 turnos' }] }] });
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Programar$/ }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Ana Torres Ruiz');
    expect(alert).toHaveTextContent('Ya tiene 3 turnos');
    expect(screen.getByRole('dialog', { name: 'Programar turno' })).toBeInTheDocument();
    expectNoBrokenText(alert);
  });

  it('modal Programar: envia payload correcto (un dia, sin repetir)', async () => {
    respond('POST', '/attendance/assignments', () => ({ assignments: [{ id: 1 }] }));
    await page();
    await ready();
    const dialog = await openAssign();
    fireEvent.click(shiftOption(dialog, /Matutino/));
    fireEvent.change(within(dialog).getByLabelText('Desde'), { target: { value: '2026-10-14' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Programar$/ }));
    await waitFor(() => expect(callsTo('POST', '/attendance/assignments')).toHaveLength(1));
    expect(callsTo('POST', '/attendance/assignments')[0].data).toMatchObject({
      employee_ids: [3], shift_ids: [116], start_date: '2026-10-14', end_date: '2026-10-14', repeats_weekly: false, weekdays: [3], keep_existing: true,
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Programar turno' })).not.toBeInTheDocument());
  });

  it('repetir semanalmente valida dias de la semana', async () => {
    await page();
    await ready();
    const dialog = await openAssign();
    fireEvent.click(shiftOption(dialog, /Matutino/));
    fireEvent.click(within(dialog).getByLabelText(/Repetir/i));
    const group = within(dialog).getByRole('group', { name: 'Días de la semana' });
    for (const b of within(group).getAllByRole('button')) if (b.getAttribute('aria-pressed') === 'true') fireEvent.click(b);
    fireEvent.click(within(dialog).getByRole('button', { name: /^Programar$/ }));
    expect(notify.notifyWarning).toHaveBeenCalledWith('Elige al menos un día de la semana.');
  });

  it('abre edicion precargada con vigencia/repeticion y muestra 409', async () => {
    await page();
    await ready();
    fireEvent.click(screen.getAllByRole('button', { name: /^Editar .*TEST-UI Matutino/ })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Editar programación' });
    expect(within(dialog).getByLabelText('Turno')).toHaveValue('116');
    fireEvent.click(within(dialog).getByLabelText('Cambiar vigencia y repetición'));
    expect(within(dialog).getByLabelText('Desde')).toHaveValue('2026-10-05');
    expect(within(dialog).getByLabelText('Hasta')).toHaveValue('');
    expect(within(dialog).getByLabelText('Cada cuántas semanas')).toHaveValue(1);
    respond('PATCH', /assignments\/\d+/, () => { throw httpError(409, { message: 'x', details: [{ employee_id: 3, employee_name: 'Ana', conflicts: [{ date: '2026-10-13', message: 'Se encima' }] }] }); });
    fireEvent.change(within(dialog).getByLabelText('Turno'), { target: { value: '117' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Se encima');
    const patch = callsTo('PATCH', /assignments\/193/)[0].data as Record<string, unknown>;
    expect(patch).toMatchObject({ shift_id: 117, start_date: '2026-10-05', repeats_weekly: true, weekdays: [1, 2, 3, 4, 5] });
  });

  it('edicion sin cambios avisa y Quitar ofrece terminar a partir de', async () => {
    await page();
    await ready();
    fireEvent.click(screen.getAllByRole('button', { name: /^Editar .*TEST-UI Matutino/ })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Editar programación' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar/ }));
    expect(notify.notifyWarning).toHaveBeenCalledWith('No hay cambios que guardar.');
    fireEvent.click(within(dialog).getByRole('button', { name: /Quitar/ }));
    respond('DELETE', /assignments\/193/, () => ({ result: { action: 'end' } }));
    fireEvent.click(await within(dialog).findByRole('button', { name: /Terminar a partir del/ }));
    await waitFor(() => expect(callsTo('DELETE', /assignments\/193/)).toHaveLength(1));
    expect(callsTo('DELETE', /assignments\/193/)[0].params).toMatchObject({ from_date_only: true });
  });

  it('Copiar horario: exige origen, copia con el seleccionado y muestra el resumen', async () => {
    respond('POST', '/attendance/schedule/copy', () => ({ result: { created: 5, assignments_created: 5, skipped_existing: 0, skipped_conflict: 1, detail: [{ employee_id: 3, date: '2026-10-19', reason: 'conflict', message: 'Choca' }] } }));
    await page();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Copiar horario/ }));
    let dialog = await screen.findByRole('dialog', { name: 'Copiar horario' });
    expect(within(dialog).getByRole('button', { name: /Copiar$/ })).toBeDisabled();
    await waitFor(() => expect(callsTo('GET', '/attendance/schedule').some((c) => c.params?.only_enabled)).toBe(true));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    fireEvent.click(screen.getByRole('checkbox', { name: `Marcar a ${names()[0]}` }));
    fireEvent.click(screen.getByRole('button', { name: /Copiar horario/ }));
    dialog = await screen.findByRole('dialog', { name: 'Copiar horario' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Copiar$/ })).toBeEnabled());
    fireEvent.click(within(dialog).getByRole('button', { name: /Copiar$/ }));
    await waitFor(() => expect(callsTo('POST', '/attendance/schedule/copy')).toHaveLength(1));
    expect(callsTo('POST', '/attendance/schedule/copy')[0].data).toMatchObject({ source_employee_id: 3, target_employee_ids: [], same_week: false, weeks: 1, replace: false });
    const done = await screen.findByRole('dialog', { name: 'Horario copiado' });
    expect(done).toHaveTextContent('Omitidos por conflicto');
    expect(done).toHaveTextContent('Choca');
    expectNoBrokenText(done);
  });

  it('pestaña Bitacora', async () => {
    await page('?tab=log');
    expect(await screen.findByLabelText('Acción')).toBeInTheDocument();
    await waitFor(() => expect(callsTo('GET', '/attendance/schedule/log')).toHaveLength(1));
    expectNoBrokenText();
  });

  it('solo lectura: sin copiar, programar ni "+" de celda', async () => {
    setAuth(ATTENDANCE_READONLY);
    await page();
    await ready().catch(() => undefined);
    await screen.findByLabelText('Leyenda de turnos');
    expect(screen.queryByRole('button', { name: /Copiar horario/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Programar a/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expectNoBrokenText();
  });
});

describe('Selector de turnos del modal Programar', () => {
  it('tiene buscador que filtra por nombre', async () => {
    await page();
    await ready();
    const dialog = await openAssign();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Elegir turnos' }));
    expect(screen.getAllByRole('option').length).toBeGreaterThan(2);
    fireEvent.change(screen.getByLabelText('Buscar turno'), { target: { value: 'zzz-no-existe' } });
    expect(screen.queryAllByRole('option', { name: /Matutino/ })).toHaveLength(1 - 1);
    expect(screen.getByText('Ningún turno coincide.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar turno'), { target: { value: 'matut' } });
    expect(screen.getByRole('option', { name: /Matutino/ })).toBeInTheDocument();
  });
});

describe('Selector de turnos: cierre', () => {
  it('se cierra al elegir un turno y se puede reabrir para sumar otro', async () => {
    await page();
    await ready();
    const dialog = await openAssign();
    const trigger = within(dialog).getByRole('button', { name: 'Elegir turnos' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: /Matutino/ }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent(/Matutino/);
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: /Matutino/ })).toHaveAttribute('aria-selected', 'true');
  });
});
