import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmployeeXlabLinkCard } from './EmployeeXlabLinkCard';
import { createEmployeeXlabLink, deleteEmployeeXlabLink, getEmployeeXlabLink, listAvailableXlabUsers } from '../../api/service.api-my-notifications';
import type { EmployeeXlabLink } from '../../types/models';

vi.mock('../../api/service.api-my-notifications', () => ({
  createEmployeeXlabLink: vi.fn(),
  deleteEmployeeXlabLink: vi.fn(async () => undefined),
  getEmployeeXlabLink: vi.fn(),
  listAvailableXlabUsers: vi.fn(),
  updateEmployeeXlabLink: vi.fn(),
}));
vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: (selector: (state: { permissions: string[] }) => unknown) => selector({ permissions: ['RH.EMPLOYEES.WRITE'] }),
}));
vi.mock('../../utils/permissions', () => ({ hasPermission: () => true }));
vi.mock('../../utils/confirm', () => ({ confirmAction: vi.fn(async () => true) }));
vi.mock('../../utils/notify', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock('../SearchableSelect', () => ({
  SearchableSelect: ({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) => (
    <select aria-label="usuario" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="" />
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const unlinked: EmployeeXlabLink = { user_id: 'u-1', cve_usuario: null, linked_at: null, linked_by_name: null, xlab_user: null, xlab_available: true };
const linked: EmployeeXlabLink = {
  ...unlinked,
  cve_usuario: 101,
  xlab_user: { cve_usuario: 101, nombre: 'MARÍA PEÑA', login: 'mpena', activo: true, tipo: 2 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EmployeeXlabLinkCard avisa el vínculo vigente a la ficha', () => {
  it('al vincular avisa true', async () => {
    vi.mocked(getEmployeeXlabLink).mockResolvedValue(unlinked);
    vi.mocked(listAvailableXlabUsers).mockResolvedValue([linked.xlab_user!]);
    vi.mocked(createEmployeeXlabLink).mockResolvedValue(linked);
    const onChange = vi.fn();
    render(<EmployeeXlabLinkCard employeeId={1} onChange={onChange} />);

    fireEvent.click(await screen.findByRole('button', { name: /Vincular/ }));
    await screen.findByRole('option', { name: /MARÍA PEÑA/ });
    fireEvent.change(screen.getByLabelText('usuario'), { target: { value: '101' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar vínculo/ }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(true));
  });

  it('al quitar avisa false, aunque falle la recarga de la tarjeta', async () => {
    vi.mocked(getEmployeeXlabLink).mockResolvedValueOnce(linked).mockRejectedValueOnce(new Error('sin red'));
    const onChange = vi.fn();
    render(<EmployeeXlabLinkCard employeeId={1} onChange={onChange} />);

    fireEvent.click(await screen.findByRole('button', { name: /Quitar/ }));

    await waitFor(() => expect(deleteEmployeeXlabLink).toHaveBeenCalledWith(1));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(false));
  });
});
