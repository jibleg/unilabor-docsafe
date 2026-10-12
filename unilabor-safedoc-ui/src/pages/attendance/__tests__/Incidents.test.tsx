import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AttendanceIncidentsPage } from '../AttendanceIncidentsPage';
import { ConfirmHost } from '../../../components/ConfirmHost';
import * as notify from '../../../utils/notify';
import { ATTENDANCE_READONLY, callsTo, emptyAll, emptyBodies, expectNoBrokenText, failAllReads, fx, httpError, installHarness, networkError, pending, renderPage, respond, setAuth } from './harness';

vi.mock('../../../api/axios', async () => (await import('./harness')).axiosModule());
vi.mock('../../../utils/notify', async () => (await import('./harness')).notifyModule());
installHarness();

const page = (qs = '') => renderPage(<><AttendanceIncidentsPage /><ConfirmHost /></>, '/attendance/incidents' + qs, '/attendance/incidents');
const loaded = () => waitFor(() => expect(screen.queryByText('Cargando incidencias…')).not.toBeInTheDocument());
const lastList = () => callsTo('GET', '/attendance/incidents').at(-1)?.params;
const ana = () => fx<{ data: Array<{ full_name: string }> }>('employees').data[0].full_name;

const openForm = async () => {
  await page();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: /Nueva incidencia/ }));
  return screen.findByRole('dialog', { name: 'Nueva incidencia' });
};
const pickEmployee = async (dialog: HTMLElement) => {
  fireEvent.focus(within(dialog).getByLabelText('Colaborador', { selector: 'input' }));
  fireEvent.click(await within(dialog).findByRole('button', { name: new RegExp(`^${ana()}\\s*AKHA`) }));
};
const selectType = (dialog: HTMLElement, label: RegExp) => {
  const option = within(dialog).getAllByRole('option').find((o) => label.test(o.textContent ?? ''));
  fireEvent.change(within(dialog).getByLabelText('Tipo'), { target: { value: (option as HTMLOptionElement).value } });
};

describe('Incidencias', () => {
  it('cargando', async () => {
    respond('GET', '/attendance/incidents', () => pending());
    await page();
    expect(screen.getByText('Cargando incidencias…')).toBeInTheDocument();
  });

  it('con datos reales', async () => {
    await page();
    await loaded();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Permiso con goce')).toBeInTheDocument();
    expect(within(table).getByText('Festivo trabajado')).toBeInTheDocument();
    expectNoBrokenText();
  });

  it('vacio', async () => {
    emptyAll(emptyBodies);
    await page();
    expect(await screen.findByText('No hay incidencias con estos filtros.')).toBeInTheDocument();
  });

  it.each([['500', () => httpError(500)], ['403', () => httpError(403)], ['red', () => networkError()]])('error %s -> Reintentar', async (_n, mk) => {
    failAllReads(mk);
    await page();
    const retry = await screen.findByRole('button', { name: /Reintentar/ });
    respond('GET', '/attendance/incidents', () => fx('incidents'));
    fireEvent.click(retry);
    expect(within(await screen.findByRole('table')).getByText('Permiso con goce')).toBeInTheDocument();
  });

  it('filtros viajan al API', async () => {
    await page();
    await loaded();
    await waitFor(() => expect(screen.getAllByRole('option', { name: /Permiso con goce/ }).length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'captured' } });
    await waitFor(() => expect(lastList()).toMatchObject({ status: 'captured' }));
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: '3' } });
    await waitFor(() => expect(lastList()).toMatchObject({ status: 'captured', type_id: '3' }));
  });

  describe('formulario de captura', () => {
    it('exige colaborador y tipo, y valida horas vs dias', async () => {
      const dialog = await openForm();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Elige al colaborador.');
      await pickEmployee(dialog);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Elige el tipo de incidencia.');
      // tipo por horas: aparece Horas y desaparece Hasta
      selectType(dialog, /Horas extra/);
      expect(within(dialog).getByLabelText('Horas')).toBeInTheDocument();
      expect(within(dialog).queryByLabelText('Hasta')).not.toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Las horas deben ser mayores a 0');
      // tipo por dias
      selectType(dialog, /Permiso sin goce/);
      expect(within(dialog).queryByLabelText('Horas')).not.toBeInTheDocument();
      expect(within(dialog).getByLabelText('Hasta')).toBeInTheDocument();
      fireEvent.change(within(dialog).getByLabelText('Desde'), { target: { value: '2026-10-20' } });
      fireEvent.change(within(dialog).getByLabelText('Hasta'), { target: { value: '2026-10-10' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
      expect(within(dialog).getByRole('alert')).toHaveTextContent('La fecha final no puede ser anterior');
    });

    it('folio IMSS solo para incapacidad', async () => {
      const dialog = await openForm();
      selectType(dialog, /Permiso con goce/);
      expect(within(dialog).queryByLabelText('Folio IMSS')).not.toBeInTheDocument();
      selectType(dialog, /^Incapacidad/);
      expect(within(dialog).getByLabelText('Folio IMSS')).toBeInTheDocument();
    });

    it('autorizar ahora un tipo con comprobante exige adjunto', async () => {
      respond('POST', '/attendance/incidents', () => ({ incident: { id: 99 }, warnings: ['Aviso de prueba'] }));
      const dialog = await openForm();
      await pickEmployee(dialog);
      selectType(dialog, /Permiso con goce/);
      fireEvent.click(within(dialog).getByLabelText('Autorizar ahora'));
      expect(within(dialog).getByText(/necesitas adjuntar comprobante/)).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
      expect(within(dialog).getByRole('alert')).toHaveTextContent('exige comprobante');
      expect(callsTo('POST', '/attendance/incidents')).toHaveLength(0);
      const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['x'], 'c.pdf', { type: 'application/pdf' })] } });
      expect(within(dialog).getByText(/c\.pdf/)).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
      await waitFor(() => expect(callsTo('POST', '/attendance/incidents')).toHaveLength(1));
      const form = callsTo('POST', '/attendance/incidents')[0].data as FormData;
      expect(form.get('authorize')).toBe('true');
      expect(form.get('incident_type_id')).toBe('3');
      expect(form.getAll('files')).toHaveLength(1);
      await waitFor(() => expect(notify.notifyWarning).toHaveBeenCalledWith('Aviso de prueba'));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nueva incidencia' })).not.toBeInTheDocument());
    });

    it('sin autorizar se puede capturar sin comprobante; error del servidor se muestra', async () => {
      respond('POST', '/attendance/incidents', () => { throw httpError(400, { message: 'Saldo insuficiente' }); });
      const dialog = await openForm();
      await pickEmployee(dialog);
      selectType(dialog, /Permiso con goce/);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
      await waitFor(() => expect(callsTo('POST', '/attendance/incidents')).toHaveLength(1));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Saldo insuficiente');
      expect(within(dialog).getByRole('button', { name: 'Registrar' })).toBeEnabled();
    });

    it('vacaciones: vista previa de saldo con los params correctos', async () => {
      respond('POST', '/attendance/vacations/preview', () => ({ applies: true, working_days: 3, balance: 12, pending: 0, available: 12, exceeds: 0, blocked: false, no_hire_date: false, message: null }));
      const dialog = await openForm();
      await pickEmployee(dialog);
      selectType(dialog, /Vacaciones/);
      fireEvent.change(within(dialog).getByLabelText('Desde'), { target: { value: '2026-10-20' } });
      fireEvent.change(within(dialog).getByLabelText('Hasta'), { target: { value: '2026-10-22' } });
      expect(await within(dialog).findByText(/3 días laborables/)).toBeInTheDocument();
      expect(within(dialog).getByText(/Saldo 12/)).toBeInTheDocument();
      expect(callsTo('POST', '/attendance/vacations/preview').at(-1)?.data).toMatchObject({ employee_id: 3, incident_type_id: 1, start_date: '2026-10-20', end_date: '2026-10-22' });
      expectNoBrokenText(dialog);
    });

    it('vista previa bloqueada avisa en autorizar ahora', async () => {
      respond('POST', '/attendance/vacations/preview', () => ({ applies: true, working_days: 3, balance: 0, pending: 0, available: 0, exceeds: 3, blocked: true, no_hire_date: false, message: null }));
      const dialog = await openForm();
      await pickEmployee(dialog);
      selectType(dialog, /Vacaciones/);
      await within(dialog).findByText(/La política actual no permite/);
      fireEvent.click(within(dialog).getByLabelText('Autorizar ahora'));
      expect(await within(dialog).findByText(/bloqueará el registro/)).toBeInTheDocument();
    });
  });

  describe('importar Excel (3 pasos)', () => {
    const sim = {
      summary: { total: 3, ok: 1, duplicate: 1, error: 1 },
      rows: [
        { row: 2, status: 'ok', employee: 'Ana Torres Ruiz', type: 'Permiso con goce', start_date: '2026-10-20', end_date: '2026-10-20', errors: [], warnings: [] },
        { row: 3, status: 'duplicate', employee: 'Ana Torres Ruiz', type: 'Permiso con goce', start_date: '2026-10-20', end_date: '2026-10-20', errors: [], warnings: ['Ya existe'] },
        { row: 4, status: 'error', employee: null, type: null, start_date: null, end_date: null, errors: ['Colaborador no encontrado'], warnings: [] },
      ],
    };
    it('plantilla -> simular -> resultado', async () => {
      respond('GET', '/attendance/incidents/template', () => new Blob(['x']));
      respond('POST', '/attendance/incidents/import/simulate', () => sim);
      respond('POST', '/attendance/incidents/import', () => ({ summary: { imported: 1, authorized: 0, skipped: 2, failed: 0 }, rows: sim.rows.map((r) => ({ ...r, imported: r.status === 'ok', authorized: false })) }));
      await page();
      await loaded();
      fireEvent.click(screen.getByRole('button', { name: /Desde Excel/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Importar incidencias desde Excel' });
      fireEvent.click(within(dialog).getByRole('button', { name: /Descargar plantilla/ }));
      await waitFor(() => expect(callsTo('GET', '/attendance/incidents/template')).toHaveLength(1));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Ya tengo mi archivo' }));
      const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['x'], 'datos.csv')] } });
      expect(within(dialog).getByRole('alert')).toHaveTextContent('.xlsx');
      fireEvent.change(input, { target: { files: [new File(['x'], 'datos.xlsx')] } });
      fireEvent.click(within(dialog).getByRole('button', { name: /Simular/ }));
      expect(await within(dialog).findByText('Colaborador no encontrado')).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /Importar 1 fila/ })).toBeEnabled();
      expectNoBrokenText(dialog);
      fireEvent.click(within(dialog).getByRole('button', { name: /Importar 1 fila/ }));
      expect(await within(dialog).findByText('Importadas 1')).toBeInTheDocument();
      expect(within(dialog).getAllByText('No importada')).toHaveLength(2);
      expectNoBrokenText(dialog);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('sin filas listas no deja importar y el error de simulacion se muestra', async () => {
      respond('POST', '/attendance/incidents/import/simulate', () => { throw httpError(400, { message: 'Archivo invalido' }); });
      await page();
      await loaded();
      fireEvent.click(screen.getByRole('button', { name: /Desde Excel/ }));
      const dialog = await screen.findByRole('dialog', { name: /Importar/ });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Ya tengo mi archivo' }));
      expect(within(dialog).getByRole('button', { name: /Importar 0 fila/ })).toBeDisabled();
      fireEvent.change(dialog.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(['x'], 'a.xlsx')] } });
      fireEvent.click(within(dialog).getByRole('button', { name: /Simular/ }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Archivo invalido');
    });
  });

  describe('acciones por fila', () => {
    const openMenu = async () => {
      await page();
      await loaded();
      await screen.findByRole('table');
      fireEvent.click(screen.getAllByRole('button', { name: 'Acciones' })[0]);
    };
    it('autorizar pide confirmacion y llama /authorize', async () => {
      respond('POST', /incidents\/\d+\/authorize/, () => ({ incident: { id: 64 }, warnings: ['Saldo bajo'] }));
      await openMenu();
      fireEvent.click(await screen.findByRole('button', { name: 'Autorizar' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Autorizar', hidden: false }).then(() => screen.getAllByRole('button', { name: 'Autorizar' }).at(-1) as HTMLElement));
      await waitFor(() => expect(callsTo('POST', /authorize$/)).toHaveLength(1));
      await waitFor(() => expect(notify.notifySuccess).toHaveBeenCalledWith('Incidencia autorizada.'));
      expect(notify.notifyWarning).toHaveBeenCalledWith('Saldo bajo');
    });
    it('cancelar confirma y llama /cancel', async () => {
      respond('POST', /incidents\/\d+\/cancel/, () => ({ incident: { id: 64 }, warnings: [] }));
      await openMenu();
      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
      const buttons = await screen.findAllByRole('button', { name: 'Cancelar incidencia' });
      fireEvent.click(buttons.at(-1) as HTMLElement);
      await waitFor(() => expect(callsTo('POST', /cancel$/)).toHaveLength(1));
    });
    it('rechazar abre modal de notas y envia notas; error se queda en el modal', async () => {
      respond('POST', /incidents\/\d+\/reject/, () => { throw httpError(409, { message: 'Estado cambiado' }); });
      await openMenu();
      fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
      const dialog = await screen.findByRole('dialog', { name: 'Rechazar incidencia' });
      fireEvent.change(within(dialog).getByLabelText('Notas'), { target: { value: 'No procede' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Rechazar' }));
      await waitFor(() => expect(callsTo('POST', /reject$/)).toHaveLength(1));
      expect(callsTo('POST', /reject$/)[0].data).toEqual({ notes: 'No procede' });
      expect(await within(dialog).findByText('Estado cambiado')).toBeInTheDocument();
    });
    it('drawer de adjuntos: abrir, quitar con confirmacion y agregar', async () => {
      respond('GET', /incidents\/64\/attachments\/13/, () => new Blob(['x']));
      respond('DELETE', /incidents\/64\/attachments\/13/, () => ({ incident: { ...fx<{ incident: object }>('incident-detail').incident, attachments: [], attachments_count: 0 } }));
      respond('POST', /incidents\/64\/attachments/, () => ({}));
      await page();
      await loaded();
      fireEvent.click((await screen.findAllByRole('button', { name: 'Ver detalle' }))[0]);
      const drawer = await screen.findByRole('dialog', { name: 'Detalle de incidencia' });
      expect(await within(drawer).findByText('comprobante.png')).toBeInTheDocument();
      expectNoBrokenText(drawer);
      fireEvent.click(within(drawer).getByRole('button', { name: 'Abrir comprobante.png' }));
      await waitFor(() => expect(window.open).toHaveBeenCalled());
      const file = new File(['x'], 'nuevo.pdf', { type: 'application/pdf' });
      fireEvent.change(drawer.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
      await waitFor(() => expect(callsTo('POST', /attachments$/)).toHaveLength(1));
      fireEvent.click(within(drawer).getByRole('button', { name: 'Quitar comprobante.png' }));
      const confirm = await screen.findAllByRole('button', { name: 'Quitar' });
      fireEvent.click(confirm.at(-1) as HTMLElement);
      await waitFor(() => expect(callsTo('DELETE', /attachments\/13/)).toHaveLength(1));
      expect(await within(drawer).findByText('Sin comprobantes.')).toBeInTheDocument();
    });
    it('error al cargar el detalle ofrece Reintentar', async () => {
      respond('GET', /incidents\/\d+$/, () => { throw httpError(500); });
      await page();
      await loaded();
      fireEvent.click((await screen.findAllByRole('button', { name: 'Ver detalle' }))[0]);
      const drawer = await screen.findByRole('dialog', { name: 'Detalle de incidencia' });
      const retry = await within(drawer).findByRole('button', { name: 'Reintentar' });
      respond('GET', /incidents\/\d+$/, () => fx('incident-detail'));
      fireEvent.click(retry);
      expect(await within(drawer).findByText('comprobante.png')).toBeInTheDocument();
    });
  });

  it('solo lectura: sin Nueva, Excel ni menu de acciones, adjuntos solo lectura', async () => {
    setAuth(ATTENDANCE_READONLY);
    await page();
    await loaded();
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Nueva incidencia/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Desde Excel/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Acciones' })).toHaveLength(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle' })[0]);
    const drawer = await screen.findByRole('dialog', { name: 'Detalle de incidencia' });
    await within(drawer).findByText('comprobante.png');
    expect(within(drawer).queryByRole('button', { name: /Quitar/ })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: /Agregar/ })).not.toBeInTheDocument();
  });
});
