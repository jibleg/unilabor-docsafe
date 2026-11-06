import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationsBell } from './NotificationsBell';
import { lisDateToDisplay } from './notifications/notificationsFormat';
import { useMyNotificationsStore } from '../store/useMyNotificationsStore';
import {
  getMyNotificationsCount,
  listMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
} from '../api/service.api-my-notifications';
import type { MyNotification } from '../types/models';

vi.mock('../api/service.api-my-notifications', () => ({
  getMyNotificationsCount: vi.fn(),
  listMyNotifications: vi.fn(),
  markMyNotificationRead: vi.fn(async () => undefined),
  markAllMyNotificationsRead: vi.fn(async () => undefined),
}));

const notification = (patch: Partial<MyNotification> = {}): MyNotification => ({
  id: 'n-1',
  tipo: 'felicitacion',
  titulo: '¡Un paciente te felicitó!',
  cuerpo: 'Muy amable',
  nota: 'Felicidades',
  contexto: { rol: 'toma', clave: '07', fecha: 20261015, folio: 'A-1' },
  created_at: '2026-10-16T12:00:00Z',
  read_at: null,
  ...patch,
});

const renderBell = () =>
  render(
    <MemoryRouter>
      <NotificationsBell />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  useMyNotificationsStore.setState({ unread: 0, inFlight: false, celebrating: false, lastCount: 0 });
});

describe('NotificationsBell', () => {
  it('muestra el contador sin leer', () => {
    useMyNotificationsStore.setState({ unread: 3 });
    renderBell();
    expect(screen.getByRole('button', { name: 'Notificaciones: 3 sin leer' })).toHaveTextContent('3');
  });

  it('al abrir una notificacion la marca leida y baja el contador', async () => {
    useMyNotificationsStore.setState({ unread: 1 });
    vi.mocked(listMyNotifications).mockResolvedValue({ linked: true, available: true, rows: [notification()], total: 1, unread: 1 });
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));
    fireEvent.click(await screen.findByText('¡Un paciente te felicitó!'));
    expect(await screen.findByText('Nota de coordinación: Felicidades')).toBeInTheDocument();
    await waitFor(() => expect(useMyNotificationsStore.getState().unread).toBe(0));
    expect(markMyNotificationRead).toHaveBeenCalledWith('n-1');
  });

  it('marca todas', async () => {
    useMyNotificationsStore.setState({ unread: 1 });
    vi.mocked(listMyNotifications).mockResolvedValue({ linked: true, available: true, rows: [notification()], total: 1, unread: 1 });
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));
    fireEvent.click(await screen.findByText('Marcar todas como leídas'));
    await waitFor(() => expect(markAllMyNotificationsRead).toHaveBeenCalled());
    await waitFor(() => expect(useMyNotificationsStore.getState().unread).toBe(0));
  });

  it('sin vinculo explica que RH debe vincular', async () => {
    vi.mocked(listMyNotifications).mockResolvedValue({ linked: false, available: true, rows: [], total: 0, unread: 0 });
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
    expect(await screen.findByText(/Pide a Recursos Humanos/)).toBeInTheDocument();
  });

  it('con XLab caido queda vacia y lo avisa', async () => {
    vi.mocked(listMyNotifications).mockResolvedValue({ linked: true, available: false, rows: [], total: 0, unread: 0 });
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
    expect(await screen.findByText(/no están disponibles por el momento/)).toBeInTheDocument();
  });
});

describe('animacion de la campana', () => {
  it('celebra al llegar notificaciones y el globo abre el panel', async () => {
    useMyNotificationsStore.setState({ unread: 2, celebrating: true });
    vi.mocked(listMyNotifications).mockResolvedValue({ linked: true, available: true, rows: [notification()], total: 1, unread: 2 });
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /buenas noticias/ }));
    expect(await screen.findByRole('dialog', { name: 'Notificaciones' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /buenas noticias/ })).not.toBeInTheDocument();
    expect(useMyNotificationsStore.getState().celebrating).toBe(false);
  });

  it('cada icono del globo lanza su lluvia sin cerrar el globo', () => {
    useMyNotificationsStore.setState({ unread: 2, celebrating: true });
    const { container } = renderBell();
    fireEvent.click(screen.getByRole('button', { name: 'Lanzar trofeos' }));
    const piezas = [...container.querySelectorAll('.bell-burst-piece')].map((pieza) => pieza.textContent);
    expect(piezas.filter((icono) => icono === '🏆').length).toBeGreaterThanOrEqual(16);
    expect(screen.getByRole('button', { name: /buenas noticias/ })).toBeInTheDocument();
  });

  it('sin leer la campana se mueve; al quedar en cero, no', () => {
    useMyNotificationsStore.setState({ unread: 1 });
    const { container, rerender } = renderBell();
    expect(container.querySelector('.bell-ring')).not.toBeNull();
    useMyNotificationsStore.setState({ unread: 0 });
    rerender(
      <MemoryRouter>
        <NotificationsBell />
      </MemoryRouter>,
    );
    expect(container.querySelector('.bell-ring')).toBeNull();
  });

  it('no celebra si no hay sin leer aunque el estado siga encendido', () => {
    useMyNotificationsStore.setState({ unread: 0, celebrating: true });
    renderBell();
    expect(screen.queryByRole('button', { name: /buenas noticias/ })).not.toBeInTheDocument();
  });
});

describe('useMyNotificationsStore', () => {
  it('celebra solo cuando aumentan las sin leer', async () => {
    vi.mocked(getMyNotificationsCount).mockResolvedValue(3);
    await useMyNotificationsStore.getState().refresh();
    expect(useMyNotificationsStore.getState().celebrating).toBe(true);

    useMyNotificationsStore.getState().endCelebration();
    await useMyNotificationsStore.getState().refresh();
    expect(useMyNotificationsStore.getState().celebrating).toBe(false);

    useMyNotificationsStore.getState().setUnread(2);
    vi.mocked(getMyNotificationsCount).mockResolvedValue(2);
    await useMyNotificationsStore.getState().refresh();
    expect(useMyNotificationsStore.getState().celebrating).toBe(false);

    vi.mocked(getMyNotificationsCount).mockResolvedValue(3);
    await useMyNotificationsStore.getState().refresh();
    expect(useMyNotificationsStore.getState().celebrating).toBe(true);
  });

  it('si falla la consulta deja el contador en cero', async () => {
    useMyNotificationsStore.setState({ unread: 5 });
    vi.mocked(getMyNotificationsCount).mockRejectedValue(new Error('503'));
    await useMyNotificationsStore.getState().refresh();
    expect(useMyNotificationsStore.getState().unread).toBe(0);
  });
});

describe('lisDateToDisplay', () => {
  it('convierte AAAAMMDD y tolera valores vacios', () => {
    expect(lisDateToDisplay(20261015)).toBe('15/10/2026');
    expect(lisDateToDisplay(null)).toBe('');
    expect(lisDateToDisplay(0)).toBe('');
  });
});
