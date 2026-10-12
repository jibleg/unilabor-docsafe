import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { AttendanceCommitmentPage } from '../AttendanceCommitmentPage';
import { callsTo, expectNoBrokenText, failAllReads, fx, httpError, installHarness, networkError, pending, renderPage, respond } from './harness';

vi.mock('../../../api/axios', async () => (await import('./harness')).axiosModule());
installHarness();

const page = (qs = '') => renderPage(<AttendanceCommitmentPage />, '/attendance/commitment' + qs);
const last = () => callsTo('GET', '/attendance/board/commitment').at(-1)?.params;
const ready = () => screen.findByText('Ranking de compromiso');

describe('Compromiso', () => {
  it('cargando', async () => {
    respond('GET', '/attendance/board/commitment', () => pending());
    await page();
    expect(screen.getByText('Cargando compromiso')).toBeInTheDocument();
  });

  it('con datos reales: titulo, ranking y sin textos rotos', async () => {
    await page();
    await ready();
    expect(screen.getByRole('heading', { name: /Compromiso por periodo/ })).toBeInTheDocument();
    expect(screen.getByText(/Datos cerrados hasta el/)).toBeInTheDocument();
    expectNoBrokenText();
  });

  it('sin colaboradores muestra nota vacia', async () => {
    respond('GET', '/attendance/board/commitment', () => ({ ...fx('board-commitment-month'), people: [], recognitions: [], attention: [], employees: [] }));
    await page();
    expect(await screen.findByText(/No hay colaboradores con control de asistencia/)).toBeInTheDocument();
    expectNoBrokenText();
  });

  it('periodo que aun no cierra su primer dia avisa', async () => {
    respond('GET', '/attendance/board/commitment', () => ({ ...fx('board-commitment-month'), closed_through: null }));
    await page();
    expect(await screen.findByText(/todavía no cierra su primer día/)).toBeInTheDocument();
  });

  it.each([['500', () => httpError(500, { message: 'Falla' })], ['403', () => httpError(403)], ['red', () => networkError()]])('error %s -> Reintentar', async (_n, mk) => {
    failAllReads(mk);
    await page();
    const retry = await screen.findByRole('button', { name: /Reintentar/ });
    respond('GET', '/attendance/board/commitment', () => fx('board-commitment-month'));
    fireEvent.click(retry);
    await ready();
  });

  it('cambio de periodo arma la query y limpia from/to', async () => {
    await page('?period=custom&from=2026-09-01&to=2026-09-10');
    await ready();
    expect(last()).toEqual({ period: 'custom', from: '2026-09-01', to: '2026-09-10' });
    fireEvent.click(screen.getByRole('tab', { name: 'Semana' }));
    await waitFor(() => expect(last()).toEqual({ period: 'week' }));
    expect(screen.getByTestId('location').textContent).not.toContain('from=');
  });

  it('rango personalizado: desde/hasta se envian', async () => {
    await page('?period=custom');
    await ready();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-08-01' } });
    await waitFor(() => expect(last()).toMatchObject({ period: 'custom', from: '2026-08-01' }));
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-08-20' } });
    await waitFor(() => expect(last()).toEqual({ period: 'custom', from: '2026-08-01', to: '2026-08-20' }));
  });

  it('periodo anterior usa el ancla y periodo actual la quita', async () => {
    await page();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Periodo anterior' }));
    await waitFor(() => expect(last()).toEqual({ period: 'month', anchor: '2026-09-01' }));
    fireEvent.click(screen.getByRole('button', { name: 'Periodo actual' }));
    await waitFor(() => expect(last()).toEqual({ period: 'month' }));
  });

  it('seleccionar un colaborador consulta con employee_id y muestra el detalle; Volver regresa', async () => {
    await page();
    await ready();
    fireEvent.click(screen.getAllByRole('row', { name: /Ver detalle de/ })[0]);
    await waitFor(() => expect(last()?.employee_id).toBeTruthy());
    const detail = fx<{ detail: { full_name: string } }>('board-commitment-employee').detail.full_name;
    expect(await screen.findByRole('heading', { name: detail })).toBeInTheDocument();
    expectNoBrokenText();
    fireEvent.click(screen.getByRole('button', { name: /Volver|Regresar|Equipo/ }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('employee_id'));
  });

  it('PDF y Excel usan los mismos filtros', async () => {
    respond('GET', /\/attendance\/export\/commitment\.xlsx/, () => new Blob(['x']));
    respond('GET', /\/attendance\/report\/commitment\.pdf/, () => new Blob(['x']));
    await page('?period=week&anchor=2026-10-05&branch_id=1');
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Descargar Excel' }));
    await waitFor(() => expect(callsTo('GET', '/attendance/export/commitment.xlsx').length).toBe(1));
    expect(callsTo('GET', '/attendance/export/commitment.xlsx')[0].params).toEqual({ period: 'week', anchor: '2026-10-05', branch_id: '1' });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir PDF' }));
    await waitFor(() => expect(window.open).toHaveBeenCalled());
    expect(apiGetUrls()).toContain('/attendance/report/commitment.pdf?period=week&anchor=2026-10-05&branch_id=1');
  });

  it('un fallo de descarga no rompe la pagina', async () => {
    respond('GET', /export\/commitment\.xlsx/, () => { throw httpError(500, { message: 'x' }); });
    await page();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Descargar Excel' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Descargar Excel' })).toBeEnabled());
  });
});

const apiGetUrls = () => callsTo('GET', /commitment\.pdf/).map((c) => c.url);
