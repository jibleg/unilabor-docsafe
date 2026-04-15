
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, KeyRound, Loader2, Plus, RefreshCw, Trash2, UserPlus, X } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  createUser,
  deleteUserById,
  fetchCategories,
  fetchUserCategories,
  getApiErrorMessage,
  listUsers,
  resetUserPassword,
  updateUserById,
  updateUserCategories,
  type CreateUserPayload,
  type UpdateUserPayload,
} from '../api/service';
import type { Category, ManagedUser } from '../types/models';
import { useAuthStore } from '../store/useAuthStore';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';
import { normalizeRole } from '../utils/roles';

const PAGE_SIZE_OPTIONS = [5, 10, 20];

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'VIEWER', label: 'Visualizador' },
] as const;

type RoleValue = (typeof ROLE_OPTIONS)[number]['value'];

interface UserFormState {
  full_name: string;
  email: string;
  role: RoleValue;
  categoryIds: number[];
}

const EMPTY_FORM: UserFormState = {
  full_name: '',
  email: '',
  role: 'VIEWER',
  categoryIds: [],
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getRoleLabel = (role: string): string => {
  const normalizedRole = normalizeRole(role);
  const roleOption = ROLE_OPTIONS.find((option) => option.value === normalizedRole);
  return roleOption?.label ?? normalizedRole;
};

const getRoleBadgeClassName = (role: string): string => {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'ADMIN') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }
  if (normalizedRole === 'EDITOR') {
    return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200';
  }
  return 'border-slate-600 bg-slate-800/70 text-slate-200';
};

const normalizeRoleValue = (role: string): RoleValue => {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'ADMIN' || normalizedRole === 'EDITOR' || normalizedRole === 'VIEWER') {
    return normalizedRole;
  }
  return 'VIEWER';
};

const sortUsers = (users: ManagedUser[]): ManagedUser[] =>
  [...users].sort((a, b) => a.full_name.localeCompare(b.full_name, 'es', { sensitivity: 'base' }));

const confirmAction = (title: string, description: string, confirmLabel: string): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false;

    const settle = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    toast.warning(
      ({ closeToast }) => (
        <div className="space-y-3">
          <p className="text-sm text-slate-100">{title}</p>
          <p className="text-xs text-slate-300">{description}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
              onClick={() => {
                settle(false);
                closeToast();
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
              onClick={() => {
                settle(true);
                closeToast();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      {
        autoClose: false,
        closeOnClick: false,
        closeButton: false,
        draggable: false,
        onClose: () => settle(false),
      },
    );
  });

export const UsersPage = () => {
  const currentUserId = useAuthStore((state) => state.user?.id ?? '');

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);

  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<UserFormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState<UserFormState>(EMPTY_FORM);
  const [savingEdit, setSavingEdit] = useState(false);
  const [loadingUserCategories, setLoadingUserCategories] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const usersData = await listUsers();
      setUsers(sortUsers(usersData));
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudo cargar el listado de usuarios'));
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const categoriesData = await fetchCategories();
      setCategories(
        [...categoriesData].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
      );
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudieron cargar las categorias'));
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadCategories();
  }, [loadCategories, loadUsers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, pageSize]);

  const filteredUsers = useMemo(() => {
    const queryValue = query.trim().toLowerCase();
    if (queryValue.length === 0) {
      return users;
    }

    return users.filter((user) => {
      const fullName = user.full_name.toLowerCase();
      const email = user.email.toLowerCase();
      const role = normalizeRole(user.role).toLowerCase();
      return fullName.includes(queryValue) || email.includes(queryValue) || role.includes(queryValue);
    });
  }, [query, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const visibleUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredUsers.slice(start, end);
  }, [currentPage, filteredUsers, pageSize]);

  const startRecord = filteredUsers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, filteredUsers.length);

  const updateCreateRole = (role: RoleValue) => {
    setCreateForm((currentForm) => ({
      ...currentForm,
      role,
      categoryIds: role === 'VIEWER' ? currentForm.categoryIds : [],
    }));
  };

  const updateEditRole = (role: RoleValue) => {
    setEditForm((currentForm) => ({
      ...currentForm,
      role,
      categoryIds: role === 'VIEWER' ? currentForm.categoryIds : [],
    }));
  };

  const toggleCreateCategory = (categoryId: number) => {
    setCreateForm((currentForm) => {
      const alreadySelected = currentForm.categoryIds.includes(categoryId);
      return {
        ...currentForm,
        categoryIds: alreadySelected
          ? currentForm.categoryIds.filter((id) => id !== categoryId)
          : [...currentForm.categoryIds, categoryId],
      };
    });
  };

  const toggleEditCategory = (categoryId: number) => {
    setEditForm((currentForm) => {
      const alreadySelected = currentForm.categoryIds.includes(categoryId);
      return {
        ...currentForm,
        categoryIds: alreadySelected
          ? currentForm.categoryIds.filter((id) => id !== categoryId)
          : [...currentForm.categoryIds, categoryId],
      };
    });
  };

  const validateForm = (form: UserFormState): boolean => {
    if (!form.full_name.trim()) {
      notifyWarning('El nombre completo es obligatorio');
      return false;
    }

    if (!form.email.trim()) {
      notifyWarning('El correo es obligatorio');
      return false;
    }

    if (!EMAIL_REGEX.test(form.email.trim())) {
      notifyWarning('El correo no tiene un formato valido');
      return false;
    }

    if (form.role === 'VIEWER' && form.categoryIds.length === 0) {
      notifyWarning('Un usuario VIEWER debe tener al menos una categoria asignada');
      return false;
    }

    return true;
  };

  const openCreateModal = () => {
    setCreateForm(EMPTY_FORM);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (creating) {
      return;
    }
    setIsCreateModalOpen(false);
    setCreateForm(EMPTY_FORM);
  };

  const submitCreateUser = async () => {
    if (!validateForm(createForm)) {
      return;
    }

    const payload: CreateUserPayload = {
      email: createForm.email.trim(),
      full_name: createForm.full_name.trim(),
      role: createForm.role,
      category_ids: createForm.role === 'VIEWER' ? createForm.categoryIds : undefined,
    };

    setCreating(true);
    try {
      await createUser(payload);
      closeCreateModal();
      await loadUsers();
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudo crear el usuario'));
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = async (user: ManagedUser) => {
    const roleValue = normalizeRoleValue(user.role);

    setEditingUser(user);
    setEditForm({
      full_name: user.full_name,
      email: user.email,
      role: roleValue,
      categoryIds: [],
    });
    setIsEditModalOpen(true);

    if (roleValue !== 'VIEWER') {
      return;
    }

    setLoadingUserCategories(true);
    try {
      const userCategories = await fetchUserCategories(user.id);
      setEditForm((currentForm) => ({
        ...currentForm,
        categoryIds: userCategories.map((category) => category.id),
      }));
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudieron cargar las categorias del usuario'));
    } finally {
      setLoadingUserCategories(false);
    }
  };

  const closeEditModal = () => {
    if (savingEdit) {
      return;
    }

    setIsEditModalOpen(false);
    setEditingUser(null);
    setEditForm(EMPTY_FORM);
    setLoadingUserCategories(false);
  };

  const submitEditUser = async () => {
    if (!editingUser) {
      return;
    }

    if (!validateForm(editForm)) {
      return;
    }

    const payload: UpdateUserPayload = {
      email: editForm.email.trim(),
      full_name: editForm.full_name.trim(),
      role: editForm.role,
    };

    setSavingEdit(true);
    try {
      await updateUserById(editingUser.id, payload);

      if (editForm.role === 'VIEWER') {
        await updateUserCategories(editingUser.id, editForm.categoryIds);
      }

      closeEditModal();
      await loadUsers();
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudo actualizar el usuario'));
    } finally {
      setSavingEdit(false);
    }
  };

  const removeUser = async (user: ManagedUser) => {
    const confirmed = await confirmAction(
      `Se eliminara al usuario "${user.full_name}".`,
      'La cuenta sera desactivada y no podra iniciar sesion.',
      'Eliminar',
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(user.id);
    try {
      await deleteUserById(user.id);
      await loadUsers();
      if (editingUser?.id === user.id) {
        closeEditModal();
      }
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudo eliminar el usuario'));
    } finally {
      setDeletingId(null);
    }
  };

  const triggerPasswordReset = async (user: ManagedUser) => {
    const confirmed = await confirmAction(
      `Se reseteara la contrasena de "${user.full_name}".`,
      'Se enviara una clave temporal por correo y el usuario debera cambiarla al iniciar sesion.',
      'Resetear',
    );

    if (!confirmed) {
      return;
    }

    setResettingId(user.id);
    try {
      await resetUserPassword(user.id);
      notifySuccess('Contrasena temporal enviada por correo. El cambio sera obligatorio al iniciar sesion.');
      await loadUsers();
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudo resetear la contrasena del usuario'));
    } finally {
      setResettingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Personal del laboratorio</h1>
          <p className="text-sm text-slate-400">
            Administra usuarios, roles y reseteo de contrasenas temporales.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
          >
            <UserPlus size={16} />
            Nuevo usuario
          </button>

          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={loadingUsers}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={16} className={loadingUsers ? 'animate-spin' : ''} />
            Recargar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/40 backdrop-blur-xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, correo o rol..."
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 lg:max-w-md"
          />

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Filas por pagina</span>
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl shadow-slate-950/40 backdrop-blur-xl">
        <table className="w-full text-left">
          <thead className="border-b border-slate-800 bg-slate-900/80">
            <tr>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Nombre</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Email</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Rol</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Estado</th>
              <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-slate-400">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loadingUsers ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-slate-500">
                  Cargando usuarios...
                </td>
              </tr>
            ) : visibleUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-slate-500">
                  No hay usuarios para mostrar.
                </td>
              </tr>
            ) : (
              visibleUsers.map((user) => {
                const isCurrentUser = currentUserId.length > 0 && currentUserId === user.id;
                const isDeleting = deletingId === user.id;
                const isResetting = resettingId === user.id;

                return (
                  <tr key={user.id} className="transition-colors hover:bg-slate-800/50">
                    <td className="px-6 py-4 text-sm font-semibold text-slate-100">{user.full_name}</td>
                    <td className="px-6 py-4 text-sm text-slate-300">{user.email}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${getRoleBadgeClassName(
                          user.role,
                        )}`}
                      >
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-300">
                      {user.is_active ? (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-semibold uppercase tracking-wide text-emerald-200">
                          Activo
                        </span>
                      ) : (
                        <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-semibold uppercase tracking-wide text-rose-200">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void openEditModal(user)}
                          disabled={isDeleting || isResetting}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Edit3 size={14} />
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => void triggerPasswordReset(user)}
                          disabled={isCurrentUser || isDeleting || isResetting}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          title={isCurrentUser ? 'No puedes resetear tu propia clave desde aqui' : ''}
                        >
                          <KeyRound size={14} />
                          {isResetting ? 'Reseteando...' : 'Reset clave'}
                        </button>

                        <button
                          type="button"
                          onClick={() => void removeUser(user)}
                          disabled={isCurrentUser || isDeleting || isResetting}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          title={isCurrentUser ? 'No puedes eliminar tu propia cuenta' : ''}
                        >
                          <Trash2 size={14} />
                          {isDeleting ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Mostrando {startRecord} - {endRecord} de {filteredUsers.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage <= 1}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-xs font-semibold text-slate-300">
            Pagina {currentPage} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage >= totalPages}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h2 className="text-base font-bold text-slate-100">Nuevo usuario</h2>
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={creating}
                className="rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Nombre completo
                  </label>
                  <input
                    value={createForm.full_name}
                    onChange={(event) =>
                      setCreateForm((currentForm) => ({
                        ...currentForm,
                        full_name: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                    placeholder="Nombre Apellido"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Correo
                  </label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(event) =>
                      setCreateForm((currentForm) => ({
                        ...currentForm,
                        email: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                    placeholder="usuario@unilabor.mx"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Rol
                </label>
                <select
                  value={createForm.role}
                  onChange={(event) => updateCreateRole(normalizeRoleValue(event.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                >
                  {ROLE_OPTIONS.map((roleOption) => (
                    <option key={roleOption.value} value={roleOption.value}>
                      {roleOption.label}
                    </option>
                  ))}
                </select>
              </div>

              {createForm.role === 'VIEWER' && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Categorias asignadas
                  </p>

                  {loadingCategories ? (
                    <p className="text-xs text-slate-500">Cargando categorias...</p>
                  ) : categories.length === 0 ? (
                    <p className="text-xs text-slate-500">No hay categorias disponibles.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {categories.map((category) => {
                        const selected = createForm.categoryIds.includes(category.id);
                        return (
                          <label
                            key={category.id}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 transition hover:border-cyan-500/40"
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleCreateCategory(category.id)}
                              className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-500"
                            />
                            <span className={selected ? 'text-cyan-200' : ''}>{category.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                Al crear el usuario, el sistema envia por correo una contrasena temporal y se fuerza el cambio en el primer inicio de sesion.
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={creating}
                  className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void submitCreateUser()}
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      Guardar usuario
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h2 className="text-base font-bold text-slate-100">Editar usuario</h2>
              <button
                type="button"
                onClick={closeEditModal}
                disabled={savingEdit}
                className="rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Nombre completo
                  </label>
                  <input
                    value={editForm.full_name}
                    onChange={(event) =>
                      setEditForm((currentForm) => ({
                        ...currentForm,
                        full_name: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Correo
                  </label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(event) =>
                      setEditForm((currentForm) => ({
                        ...currentForm,
                        email: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Rol
                </label>
                <select
                  value={editForm.role}
                  onChange={(event) => updateEditRole(normalizeRoleValue(event.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                >
                  {ROLE_OPTIONS.map((roleOption) => (
                    <option key={roleOption.value} value={roleOption.value}>
                      {roleOption.label}
                    </option>
                  ))}
                </select>
              </div>

              {editForm.role === 'VIEWER' && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Categorias asignadas
                  </p>

                  {loadingCategories || loadingUserCategories ? (
                    <p className="text-xs text-slate-500">Cargando categorias...</p>
                  ) : categories.length === 0 ? (
                    <p className="text-xs text-slate-500">No hay categorias disponibles.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {categories.map((category) => {
                        const selected = editForm.categoryIds.includes(category.id);
                        return (
                          <label
                            key={category.id}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 transition hover:border-cyan-500/40"
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleEditCategory(category.id)}
                              className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-500"
                            />
                            <span className={selected ? 'text-cyan-200' : ''}>{category.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={savingEdit}
                  className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void submitEditUser()}
                  disabled={savingEdit}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingEdit ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Edit3 size={14} />
                      Guardar cambios
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
