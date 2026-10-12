import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AttendanceSettingsPage } from '../AttendanceSettingsPage';
import { ConfirmHost } from '../../../components/ConfirmHost';
import * as notify from '../../../utils/notify';
import { callsTo, emptyAll, emptyBodies, expectNoBrokenText, failAllReads, fx, httpError, installHarness, networkError, pending, renderPage, respond } from './harness';

vi.mock('../../../api/axios', async () => (await import('./harness')).axiosModule());
vi.mock('../../../utils/notify', async () => (await import('./harness')).notifyModule());
installHarness();

const page = (qs = '') => renderPage(<><AttendanceSettingsPage /><ConfirmHost /></>, '/attendance/settings' + qs, '/attendance/settings');
const submit = (dialog: HTMLElement) => fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);
const holidays = () => ({ holidays: [
  { id: 1, holiday_date: '2026-12-25', name: 'Navidad', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 2, holiday_date: '2026-11-02', name: 'Día de muertos', is_active: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
] });

describe('Parametros', () => {
  it('cargando reglas', async () => {
    respond('GET', '/attendance/settings', () => pending());
    await page();
    expect(screen.getByText('Cargando reglas…')).toBeInTheDocument();
  });

  it('4 pestanas y ?tab= selecciona la activa; tab invalido cae en Reglas', async () => {
    await page('?tab=vacations');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Reglas', 'Festivos', 'Tipos de incidencia', 'Vacaciones']);
    expect(screen.getByRole('tab', { name: 'Vacaciones' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/Igual a la Ley|Personalizada/)).toBeInTheDocument();
  });

  it('tab invalido -> reglas; cambiar de pestana actualiza la URL', async () => {
    await page('?tab=nada');
    expect(screen.getByRole('tab', { name: 'Reglas' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Festivos' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('tab=holidays'));
    fireEvent.click(screen.getByRole('tab', { name: 'Reglas' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('tab='));
  });

  describe('Reglas', () => {
    it('lista parametros con historial de cambios, sin textos rotos', async () => {
      await page();
      expect(await screen.findByText('Tolerancia de entrada')).toBeInTheDocument();
      fireEvent.click(await screen.findByRole('button', { name: /Historial de cambios/ }));
      expect((await screen.findAllByText(/TEST restaurar/)).length).toBeGreaterThan(0);
      expect(callsTo('GET', '/attendance/settings/changes').at(-1)?.params).toEqual({ limit: 100 });
      expectNoBrokenText();
    });
    it.each([['500', () => httpError(500)], ['403', () => httpError(403)], ['red', () => networkError()]])('error %s -> Reintentar', async (_n, mk) => {
      failAllReads(mk);
      await page();
      const retry = await screen.findByRole('button', { name: 'Reintentar' });
      respond('GET', '/attendance/settings', () => fx('settings'));
      respond('GET', '/attendance/settings/changes', () => fx('settings-changes'));
      fireEvent.click(retry);
      expect(await screen.findByText('Tolerancia de entrada')).toBeInTheDocument();
    });
    it('editar exige motivo >= 5 y valida rango; guarda con value y reason', async () => {
      respond('PUT', '/attendance/settings/tolerance_min', () => ({ settings: fx<{ settings: unknown[] }>('settings').settings }));
      await page();
      fireEvent.click(await screen.findByRole('button', { name: 'Editar Tolerancia de entrada' }));
      const dialog = await screen.findByRole('dialog', { name: 'Tolerancia de entrada' });
      fireEvent.change(within(dialog).getByLabelText(/^Valor/), { target: { value: '15' } });
      submit(dialog);
      expect(within(dialog).getByRole('alert')).toHaveTextContent('al menos 5 caracteres');
      fireEvent.change(within(dialog).getByLabelText(/^Valor/), { target: { value: '500' } });
      fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: 'Ajuste de política' } });
      submit(dialog);
      expect(within(dialog).getByRole('alert')).toHaveTextContent('El máximo es 120');
      fireEvent.change(within(dialog).getByLabelText(/^Valor/), { target: { value: '15' } });
      submit(dialog);
      await waitFor(() => expect(callsTo('PUT', '/attendance/settings/tolerance_min')).toHaveLength(1));
      expect(callsTo('PUT', '/attendance/settings/tolerance_min')[0].data).toEqual({ value: 15, reason: 'Ajuste de política' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
    it('enum se edita con select', async () => {
      await page();
      fireEvent.click(await screen.findByRole('button', { name: 'Editar Periodo de retardos' }).catch(() => screen.getAllByRole('button', { name: /^Editar / })[3]));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText(/^Valor/).tagName).toBe('SELECT');
    });
    it('error al guardar mantiene el modal y avisa', async () => {
      respond('PUT', /settings\//, () => { throw httpError(400, { message: 'Valor fuera de rango' }); });
      await page();
      fireEvent.click(await screen.findByRole('button', { name: 'Editar Tolerancia de entrada' }));
      const dialog = await screen.findByRole('dialog', { name: 'Tolerancia de entrada' });
      fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: 'Prueba larga' } });
      submit(dialog);
      await waitFor(() => expect(notify.notifyError).toHaveBeenCalledWith('Valor fuera de rango'));
      expect(screen.getByRole('dialog', { name: 'Tolerancia de entrada' })).toBeInTheDocument();
    });
  });

  describe('Festivos', () => {
    it('lista, vacio y error', async () => {
      respond('GET', '/attendance/holidays', () => holidays());
      await page('?tab=holidays');
      expect(await screen.findByText('Navidad')).toBeInTheDocument();
      expect(screen.getByText('Inactivo')).toBeInTheDocument();
      expectNoBrokenText();
    });
    it('vacio', async () => {
      emptyAll(emptyBodies);
      await page('?tab=holidays');
      expect(await screen.findByText(/No hay festivos en/)).toBeInTheDocument();
    });
    it('error -> Reintentar', async () => {
      failAllReads(() => httpError(500));
      await page('?tab=holidays');
      const retry = await screen.findByRole('button', { name: 'Reintentar' });
      respond('GET', '/attendance/holidays', () => holidays());
      fireEvent.click(retry);
      expect(await screen.findByText('Navidad')).toBeInTheDocument();
    });
    it('cambiar el ano consulta ese ano; crear valida y envia', async () => {
      respond('POST', '/attendance/holidays', () => ({}));
      await page('?tab=holidays');
      await screen.findByText(/No hay festivos en|Navidad/);
      fireEvent.change(screen.getByLabelText('Año'), { target: { value: String(new Date().getFullYear() + 1) } });
      await waitFor(() => expect(callsTo('GET', '/attendance/holidays').at(-1)?.params).toEqual({ year: new Date().getFullYear() + 1 }));
      fireEvent.click(screen.getByRole('button', { name: /Nuevo festivo/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Nuevo festivo' });
      submit(dialog);
      expect(within(dialog).getByRole('alert')).toHaveTextContent('entre 2 y 120');
      fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Año nuevo' } });
      submit(dialog);
      await waitFor(() => expect(callsTo('POST', '/attendance/holidays')).toHaveLength(1));
      expect(callsTo('POST', '/attendance/holidays')[0].data).toMatchObject({ name: 'Año nuevo' });
    });
    it('desactivar y eliminar piden confirmacion', async () => {
      respond('GET', '/attendance/holidays', () => holidays());
      respond('PATCH', /holidays\/1/, () => ({}));
      respond('DELETE', /holidays\/1/, () => ({}));
      await page('?tab=holidays');
      fireEvent.click(await screen.findByRole('button', { name: 'Desactivar Navidad' }));
      fireEvent.click((await screen.findAllByRole('button', { name: 'Desactivar' })).at(-1) as HTMLElement);
      await waitFor(() => expect(callsTo('PATCH', /holidays\/1/)[0]?.data).toEqual({ is_active: false }));
      fireEvent.click(screen.getByRole('button', { name: 'Eliminar Navidad' }));
      fireEvent.click((await screen.findAllByRole('button', { name: 'Eliminar' })).at(-1) as HTMLElement);
      await waitFor(() => expect(callsTo('DELETE', /holidays\/1/)).toHaveLength(1));
    });
  });

  describe('Tipos de incidencia', () => {
    it('tipos de sistema: clave no editable', async () => {
      await page('?tab=incident-types');
      expect((await screen.findAllByText('Sistema')).length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: 'Editar Vacaciones' }));
      const dialog = await screen.findByRole('dialog', { name: 'Editar tipo' });
      expect(within(dialog).getByLabelText('Clave')).toBeDisabled();
      expect(within(dialog).getByText('Los tipos de sistema no cambian de clave.')).toBeInTheDocument();
      expect(within(dialog).getByText(/Activo \(siempre\)/)).toBeInTheDocument();
      expectNoBrokenText(dialog);
    });
    it('nuevo tipo sugiere clave, la valida y envia', async () => {
      respond('POST', '/attendance/incident-types', () => ({}));
      await page('?tab=incident-types');
      fireEvent.click(await screen.findByRole('button', { name: /Nuevo tipo/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Nuevo tipo' });
      fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Permiso Médico' } });
      expect(within(dialog).getByLabelText('Clave')).toHaveValue('permiso_medico');
      fireEvent.change(within(dialog).getByLabelText('Clave'), { target: { value: 'Mal Clave' } });
      submit(dialog);
      expect(within(dialog).getByRole('alert')).toHaveTextContent('minúsculas, números y guion bajo');
      fireEvent.change(within(dialog).getByLabelText('Clave'), { target: { value: 'permiso_medico' } });
      submit(dialog);
      await waitFor(() => expect(callsTo('POST', '/attendance/incident-types')).toHaveLength(1));
      expect(callsTo('POST', '/attendance/incident-types')[0].data).toMatchObject({ name: 'Permiso Médico', code: 'permiso_medico', sort_order: 90 });
    });
    it('error -> Reintentar', async () => {
      failAllReads(() => httpError(500));
      await page('?tab=incident-types');
      const retry = await screen.findByRole('button', { name: 'Reintentar' });
      respond('GET', '/attendance/incident-types', () => fx('incident-types-all'));
      fireEvent.click(retry);
      expect(await screen.findByText('Incapacidad')).toBeInTheDocument();
    });
  });

  describe('Vacaciones', () => {
    const custom = () => {
      const d = fx<{ policy: Array<Record<string, unknown>> }>('vacation-policy');
      d.policy[1] = { ...d.policy[1], vacation_days: 20, differs_from_law: true };
      return d;
    };
    it('tabla igual a la Ley', async () => {
      await page('?tab=vacations');
      expect(await screen.findByText('Igual a la Ley (LFT 2023)')).toBeInTheDocument();
      expect(screen.queryByText(/la Ley marca/)).not.toBeInTheDocument();
      expectNoBrokenText();
    });
    it('personalizada muestra "la Ley marca X"', async () => {
      respond('GET', '/attendance/vacation-policy', () => custom());
      await page('?tab=vacations');
      expect(await screen.findByText('Personalizada')).toBeInTheDocument();
      expect(screen.getByText(/la Ley marca 14/)).toBeInTheDocument();
    });
    it('la primera fila no se elimina; editar valida pasos de 0.5', async () => {
      respond('PUT', /vacation-policy\/\d+/, () => ({ policy: fx<{ policy: unknown[] }>('vacation-policy').policy }));
      await page('?tab=vacations');
      await screen.findByText('Igual a la Ley (LFT 2023)');
      const deletes = screen.getAllByRole('button', { name: /^Eliminar / });
      const edits = screen.getAllByRole('button', { name: /^Editar / });
      expect(deletes.length).toBe(edits.length - 1);
      fireEvent.click(edits[1]);
      const dialog = await screen.findByRole('dialog', { name: /Editar año/ });
      expect(within(dialog).getByLabelText('Desde el año')).toBeDisabled();
      fireEvent.change(within(dialog).getByLabelText('Días de vacaciones'), { target: { value: '15.3' } });
      submit(dialog);
      expect(within(dialog).getByRole('alert')).toHaveTextContent('pasos de 0.5');
      fireEvent.change(within(dialog).getByLabelText('Días de vacaciones'), { target: { value: '15.5' } });
      submit(dialog);
      await waitFor(() => expect(callsTo('PUT', /vacation-policy\/2/)).toHaveLength(1));
      expect(callsTo('PUT', /vacation-policy\/2/)[0].data).toEqual({ vacation_days: 15.5 });
    });
    it('restablecer a la Ley confirma', async () => {
      respond('GET', '/attendance/vacation-policy', () => custom());
      respond('POST', '/attendance/vacation-policy/reset', () => fx('vacation-policy'));
      await page('?tab=vacations');
      await screen.findByText('Personalizada');
      fireEvent.click(screen.getByRole('button', { name: /Restablecer a la Ley/ }));
      fireEvent.click((await screen.findAllByRole('button', { name: 'Restablecer' })).at(-1) as HTMLElement);
      await waitFor(() => expect(callsTo('POST', '/attendance/vacation-policy/reset')).toHaveLength(1));
      expect(await screen.findByText('Igual a la Ley (LFT 2023)')).toBeInTheDocument();
    });
    it('nueva fila valida anio y dias', async () => {
      await page('?tab=vacations');
      fireEvent.click(await screen.findByRole('button', { name: /Nueva fila/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Nueva fila' });
      fireEvent.change(within(dialog).getByLabelText('Desde el año'), { target: { value: '99' } });
      fireEvent.change(within(dialog).getByLabelText('Días de vacaciones'), { target: { value: '10' } });
      submit(dialog);
      expect(within(dialog).getByRole('alert')).toHaveTextContent('1 a 60');
    });
  });
});
