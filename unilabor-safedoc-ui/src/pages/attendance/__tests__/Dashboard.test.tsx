import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { AttendanceDashboardPage } from '../AttendanceDashboardPage';
import { callsTo, emptyAll, emptyBodies, expectNoBrokenText, failAllReads, httpError, installHarness, networkError, pending, renderPage, respond } from './harness';

vi.mock('../../../api/axios', async () => (await import('./harness')).axiosModule());
installHarness();

const PATH = '/attendance/dashboard';
const page = (qs = '') => renderPage(<AttendanceDashboardPage />, PATH + qs);

describe('Dashboard (Hoy en vivo)', () => {
  it('estado cargando muestra el esqueleto accesible', async () => {
    respond('GET', '/attendance/board/live', () => pending());
    await page();
    expect(screen.getByText('Cargando tablero en vivo')).toBeInTheDocument();
  });

  it('con datos reales renderiza sin textos rotos', async () => {
    await page();
    expect(await screen.findByRole('heading', { name: /Hoy en vivo/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Cargando tablero en vivo')).not.toBeInTheDocument());
    expectNoBrokenText();
  });

  it('estado vacio no truena', async () => {
    emptyAll(emptyBodies);
    await page();
    await waitFor(() => expect(screen.queryByText('Cargando tablero en vivo')).not.toBeInTheDocument());
    expectNoBrokenText();
  });

  it.each([
    ['500', () => httpError(500, { message: 'Falla interna' })],
    ['403', () => httpError(403, { message: 'Sin permiso' })],
    ['red caida', () => networkError()],
  ])('error %s muestra Reintentar y funciona', async (_n, mk) => {
    failAllReads(mk);
    await page();
    const retry = await screen.findByRole('button', { name: /Reintentar/ });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    respond('GET', '/attendance/board/live', () => ({ ...emptyBodies['^/attendance/board/live$'] as object }));
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument());
  });

  it('cambiar fecha y sucursal dispara refetch con los params correctos', async () => {
    await page();
    await screen.findByRole('heading', { name: /Hoy en vivo/ });
    await waitFor(() => expect(callsTo('GET', '/attendance/board/live').length).toBe(1));
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-15' } });
    await waitFor(() => expect(callsTo('GET', '/attendance/board/live').at(-1)?.params).toEqual({ date: '2026-09-15' }));
    await waitFor(() => expect(screen.getAllByRole('option', { name: /UNILABOR CENTRO/ }).length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: '1' } });
    await waitFor(() => expect(callsTo('GET', '/attendance/board/live').at(-1)?.params).toEqual({ date: '2026-09-15', branch_id: '1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    await waitFor(() => expect(callsTo('GET', '/attendance/board/live').at(-1)?.params?.date).toBe('2026-09-14'));
    expect(screen.getByTestId('location').textContent).toContain('date=2026-09-14');
  });

  it('el intervalo de 60 s solo corre si la fecha es hoy y se limpia al desmontar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = await page();
    await vi.waitFor(() => expect(callsTo('GET', '/attendance/board/live').length).toBe(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(callsTo('GET', '/attendance/board/live').length).toBe(2);
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(callsTo('GET', '/attendance/board/live').length).toBe(2);
  });

  it('en una fecha pasada no hay refresco automatico', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await page('?date=2026-09-01');
    await vi.waitFor(() => expect(callsTo('GET', '/attendance/board/live').length).toBe(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(callsTo('GET', '/attendance/board/live').length).toBe(1);
  });

  it('un refresco automatico fallido no tapa el tablero cargado', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await page();
    await vi.waitFor(() => expect(callsTo('GET', '/attendance/board/live').length).toBe(1));
    await vi.waitFor(() => expect(screen.queryByText('Cargando tablero en vivo')).not.toBeInTheDocument());
    respond('GET', '/attendance/board/live', () => { throw networkError(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
