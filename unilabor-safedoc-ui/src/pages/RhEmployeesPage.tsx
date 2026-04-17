import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Eye, Loader2, Plus, RefreshCw, Trash2, UserCog, UserRound } from 'lucide-react';
import {
  createEmployee,
  deleteEmployeeById,
  fetchEmployeeById,
  getApiErrorMessage,
  listEmployees,
  listLinkableUsers,
  type EmployeePayload,
  updateEmployeeById,
} from '../api/service';
import type { Employee, LinkableUser } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';

interface EmployeeFormState {
  employee_code: string;
  user_id: string;
  full_name: string;
  email: string;
  area: string;
  position: string;
}

const EMPTY_FORM: EmployeeFormState = {
  employee_code: '',
  user_id: '',
  full_name: '',
  email: '',
  area: '',
  position: '',
};

const getLinkableUserOptionLabel = (user: LinkableUser): string =>
  `${user.full_name} - ${user.email}`;

const toEmployeePayload = (form: EmployeeFormState): EmployeePayload => ({
  employee_code: form.employee_code.trim() || undefined,
  user_id: form.user_id || null,
  full_name: form.full_name.trim(),
  email: form.email.trim(),
  area: form.area.trim() || undefined,
  position: form.position.trim() || undefined,
});

export const RhEmployeesPage = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [linkableUsers, setLinkableUsers] = useState<LinkableUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [query, setQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [form, setForm] = useState<EmployeeFormState>(EMPTY_FORM);
  const [userSearchValue, setUserSearchValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listEmployees();
      setEmployees(data);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los colaboradores.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLinkableUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await listLinkableUsers();
      setLinkableUsers(data);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los usuarios vinculables.'));
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
    void loadLinkableUsers();
  }, [loadEmployees, loadLinkableUsers]);

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return employees;
    }

    return employees.filter((employee) =>
      [employee.employee_code, employee.full_name, employee.email, employee.area ?? '', employee.position ?? '']
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [employees, query]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setUserSearchValue('');
    setSelectedEmployee(null);
  };

  const validateForm = (): boolean => {
    if (!form.full_name.trim()) {
      notifyWarning('El nombre completo del colaborador es obligatorio.');
      return false;
    }

    if (!form.email.trim()) {
      notifyWarning('El correo del colaborador es obligatorio.');
      return false;
    }

    return true;
  };

  const openCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const openEdit = (employee: Employee) => {
    const linkedUserLabel = employee.linked_user
      ? getLinkableUserOptionLabel(employee.linked_user)
      : '';

    setSelectedEmployee(employee);
    setForm({
      employee_code: employee.employee_code,
      user_id: employee.user_id ?? '',
      full_name: employee.full_name,
      email: employee.email,
      area: employee.area ?? '',
      position: employee.position ?? '',
    });
    setUserSearchValue(linkedUserLabel);
    setIsEditOpen(true);
  };

  const handleUserSearchChange = (value: string) => {
    setUserSearchValue(value);

    const matchedUser = linkableUsers.find(
      (user) => getLinkableUserOptionLabel(user).toLowerCase() === value.trim().toLowerCase(),
    );

    setForm((current) => ({
      ...current,
      user_id: matchedUser?.id ?? '',
    }));
  };

  const openDetail = async (employeeId: number) => {
    setLoadingDetail(true);
    try {
      const employee = await fetchEmployeeById(employeeId);
      setDetailEmployee(employee);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el detalle del colaborador.'));
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreate = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      await createEmployee(toEmployeePayload(form));
      notifySuccess('Colaborador creado correctamente.');
      setIsCreateOpen(false);
      resetForm();
      await loadEmployees();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo crear el colaborador.'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedEmployee || !validateForm()) {
      return;
    }

    setSaving(true);
    try {
      await updateEmployeeById(selectedEmployee.id, toEmployeePayload(form));
      notifySuccess('Colaborador actualizado correctamente.');
      setIsEditOpen(false);
      resetForm();
      await loadEmployees();
      if (detailEmployee?.id === selectedEmployee.id) {
        await openDetail(selectedEmployee.id);
      }
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo actualizar el colaborador.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (employee: Employee) => {
    setDeletingId(employee.id);
    try {
      await deleteEmployeeById(employee.id);
      notifySuccess('Colaborador inactivado correctamente.');
      if (detailEmployee?.id === employee.id) {
        setDetailEmployee(null);
      }
      await loadEmployees();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo inactivar el colaborador.'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Recursos Humanos
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Colaboradores</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--unilabor-neutral)]">
            Crea, vincula y administra la base de colaboradores que despues alimentara el expediente digital.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void loadEmployees();
              void loadLinkableUsers();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
          >
            <Plus size={16} />
            Nuevo colaborador
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.9fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por codigo, nombre, correo, area o puesto..."
              className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
            <table className="w-full text-left">
              <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
                <tr>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Codigo</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Colaborador</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Area / Puesto</th>
                  <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
                      Cargando colaboradores...
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-sm text-[var(--unilabor-neutral)]">
                      No hay colaboradores para mostrar.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((employee) => (
                    <tr key={employee.id} className="transition-colors hover:bg-[rgba(191,212,230,0.22)]">
                      <td className="px-5 py-4 text-sm font-semibold text-[var(--color-brand-700)]">{employee.employee_code}</td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-[var(--color-brand-700)]">{employee.full_name}</p>
                        <p className="text-xs text-[var(--unilabor-neutral)]">{employee.email}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-[var(--unilabor-ink)]">
                        <p>{employee.area || 'Sin area'}</p>
                        <p className="text-xs text-[var(--unilabor-neutral)]">{employee.position || 'Sin puesto'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void openDetail(employee.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
                          >
                            <Eye size={14} />
                            Ver
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(employee)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
                          >
                            <Edit3 size={14} />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(employee)}
                            disabled={deletingId === employee.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.16)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(151,163,172,0.24)] disabled:opacity-60"
                          >
                            <Trash2 size={14} />
                            {deletingId === employee.id ? 'Inactivando...' : 'Inactivar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(239,245,250,0.96))] p-5 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]">
              <UserCog size={22} />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">
                Detalle
              </p>
              <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Ficha del colaborador</h2>
            </div>
          </div>

          {loadingDetail ? (
            <div className="mt-6 flex items-center gap-3 text-sm text-[var(--unilabor-neutral)]">
              <Loader2 size={16} className="animate-spin" />
              Cargando detalle...
            </div>
          ) : detailEmployee ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Codigo</p>
                <p className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{detailEmployee.employee_code}</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Nombre</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-brand-700)]">{detailEmployee.full_name}</p>
                </div>
                <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Correo</p>
                  <p className="mt-1 text-sm text-[var(--unilabor-ink)]">{detailEmployee.email}</p>
                </div>
                <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Area</p>
                  <p className="mt-1 text-sm text-[var(--unilabor-ink)]">{detailEmployee.area || 'Sin area'}</p>
                </div>
                <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Puesto</p>
                  <p className="mt-1 text-sm text-[var(--unilabor-ink)]">{detailEmployee.position || 'Sin puesto'}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Usuario vinculado</p>
                {detailEmployee.linked_user ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-semibold text-[var(--color-brand-700)]">
                      {detailEmployee.linked_user.full_name}
                    </p>
                    <p className="text-xs text-[var(--unilabor-neutral)]">{detailEmployee.linked_user.email}</p>
                    <div className="flex flex-wrap gap-2">
                      {detailEmployee.linked_user.modules.map((moduleAccess) => (
                        <span
                          key={`${detailEmployee.linked_user?.id}-${moduleAccess.code}`}
                          className="rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.34)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]"
                        >
                          {moduleAccess.code}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--unilabor-neutral)]">Aun no tiene usuario del sistema asociado.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-[rgba(0,65,106,0.14)] bg-white/80 p-6 text-sm text-[var(--unilabor-neutral)]">
              Selecciona un colaborador para revisar su informacion base y el usuario vinculado.
            </div>
          )}
        </div>
      </div>

      {(isCreateOpen || isEditOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
              <h2 className="text-base font-bold text-[var(--color-brand-700)]">
                {isCreateOpen ? 'Nuevo colaborador' : 'Editar colaborador'}
              </h2>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Codigo
                  </label>
                  <input
                    value={form.employee_code}
                    onChange={(event) => setForm((current) => ({ ...current, employee_code: event.target.value }))}
                    placeholder="Automatico si lo dejas vacio"
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Usuario del sistema
                  </label>
                  <input
                    list="rh-linkable-users"
                    value={userSearchValue}
                    onChange={(event) => handleUserSearchChange(event.target.value)}
                    placeholder={loadingUsers ? 'Cargando usuarios...' : 'Escribe para buscar y filtrar'}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                  <datalist id="rh-linkable-users">
                    {linkableUsers.map((user) => (
                      <option key={user.id} value={getLinkableUserOptionLabel(user)} />
                    ))}
                  </datalist>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-[var(--unilabor-neutral)]">
                      {form.user_id
                        ? 'Usuario vinculado seleccionado.'
                        : 'Puedes dejarlo vacio si el colaborador aun no tiene cuenta.'}
                    </p>
                    {form.user_id ? (
                      <button
                        type="button"
                        onClick={() => {
                          setUserSearchValue('');
                          setForm((current) => ({ ...current, user_id: '' }));
                        }}
                        className="text-[11px] font-semibold text-[var(--color-brand-700)] transition hover:opacity-80"
                      >
                        Limpiar
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Nombre completo
                  </label>
                  <input
                    value={form.full_name}
                    onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Correo
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Area
                  </label>
                  <input
                    value={form.area}
                    onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    placeholder="Recursos Humanos, Calidad, Laboratorio..."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                    Puesto
                  </label>
                  <input
                    value={form.position}
                    onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    placeholder="Analista, Coordinador, Responsable..."
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.28)] px-3 py-2 text-xs text-[var(--color-brand-700)]">
                Esta ficha servira como base del expediente digital y del futuro portal del colaborador.
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setIsEditOpen(false);
                    resetForm();
                  }}
                  disabled={saving}
                  className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void (isCreateOpen ? handleCreate() : handleUpdate())}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <UserRound size={14} />
                      {isCreateOpen ? 'Guardar colaborador' : 'Guardar cambios'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
