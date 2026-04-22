
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, KeyRound, Loader2, Plus, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  createUser,
  deleteUserById,
  fetchCategories,
  fetchModuleCatalog,
  fetchUserCategories,
  getApiErrorMessage,
  listUsers,
  resetUserPassword,
  updateUserById,
  updateUserCategories,
  type CreateUserPayload,
  type UpdateUserPayload,
} from '../api/service';
import type { Category, ManagedUser, ModuleAccess, ModuleCode } from '../types/models';
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
  moduleCodes: ModuleCode[];
}

const EMPTY_FORM: UserFormState = {
  full_name: '',
  email: '',
  role: 'VIEWER',
  categoryIds: [],
  moduleCodes: ['QUALITY'],
};

const FALLBACK_MODULE_OPTIONS: ModuleAccess[] = [
  {
    code: 'QUALITY',
    name: 'Documentos de Calidad',
    description: 'Gestion documental institucional',
    icon: 'shield-check',
    role: 'ADMIN',
    is_active: true,
    sort_order: 10,
  },
  {
    code: 'RH',
    name: 'Recursos Humanos',
    description: 'Expediente digital del colaborador',
    icon: 'users',
    role: 'ADMIN',
    is_active: true,
    sort_order: 20,
  },
  {
    code: 'HELPDESK',
    name: 'Mesa de Ayuda',
    description: 'Gestion de activos, tickets y mantenimiento',
    icon: 'life-buoy',
    role: 'ADMIN',
    is_active: true,
    sort_order: 30,
  },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getRoleLabel = (role: string): string => {
  const normalizedRole = normalizeRole(role);
  const roleOption = ROLE_OPTIONS.find((option) => option.value === normalizedRole);
  return roleOption?.label ?? normalizedRole;
};

const getRoleBadgeClassName = (role: string): string => {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'ADMIN') {
    return 'border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] text-[var(--color-brand-700)]';
  }
  if (normalizedRole === 'EDITOR') {
    return 'border-[rgba(124,173,211,0.28)] bg-[rgba(191,212,230,0.34)] text-[var(--color-brand-700)]';
  }
  return 'border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.16)] text-[var(--color-brand-700)]';
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
          <p className="text-sm text-[var(--color-brand-700)]">{title}</p>
          <p className="text-xs text-[var(--unilabor-neutral)]">{description}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
              onClick={() => {
                settle(false);
                closeToast();
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
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
  const currentUserEmail = useAuthStore((state) => state.user?.email?.trim().toLowerCase() ?? '');

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [moduleOptions, setModuleOptions] = useState<ModuleAccess[]>(FALLBACK_MODULE_OPTIONS);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingModules, setLoadingModules] = useState(false);

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

  const loadModules = useCallback(async () => {
    setLoadingModules(true);
    try {
      const modules = await fetchModuleCatalog();
      if (modules.length > 0) {
        setModuleOptions(modules);
      }
    } catch (requestError) {
      notifyWarning(getApiErrorMessage(requestError, 'No se pudo cargar el catalogo de modulos. Se usara la configuracion base.'));
      setModuleOptions(FALLBACK_MODULE_OPTIONS);
    } finally {
      setLoadingModules(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadCategories();
    void loadModules();
  }, [loadCategories, loadModules, loadUsers]);

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
      categoryIds: currentForm.categoryIds,
    }));
  };

  const updateEditRole = (role: RoleValue) => {
    setEditForm((currentForm) => ({
      ...currentForm,
      role,
      categoryIds: currentForm.categoryIds,
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

  const toggleCreateModule = (moduleCode: ModuleCode) => {
    setCreateForm((currentForm) => {
      const alreadySelected = currentForm.moduleCodes.includes(moduleCode);
      return {
        ...currentForm,
        moduleCodes: alreadySelected
          ? currentForm.moduleCodes.filter((code) => code !== moduleCode)
          : [...currentForm.moduleCodes, moduleCode],
      };
    });
  };

  const toggleEditModule = (moduleCode: ModuleCode) => {
    setEditForm((currentForm) => {
      const alreadySelected = currentForm.moduleCodes.includes(moduleCode);
      return {
        ...currentForm,
        moduleCodes: alreadySelected
          ? currentForm.moduleCodes.filter((code) => code !== moduleCode)
          : [...currentForm.moduleCodes, moduleCode],
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

    if (form.role === 'VIEWER' && form.moduleCodes.includes('QUALITY') && form.categoryIds.length === 0) {
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
      category_ids: createForm.categoryIds,
      module_codes: createForm.moduleCodes,
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
      moduleCodes: user.modules?.map((moduleAccess) => moduleAccess.code) ?? ['QUALITY'],
    });
    setIsEditModalOpen(true);

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
      module_codes: editForm.moduleCodes,
    };

    setSavingEdit(true);
    try {
      await updateUserById(editingUser.id, payload);

      await updateUserCategories(editingUser.id, editForm.categoryIds);

      closeEditModal();
      await loadUsers();
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudo actualizar el usuario'));
    } finally {
      setSavingEdit(false);
    }
  };

  const removeUser = async (user: ManagedUser) => {
    const isCurrentUser =
      (currentUserId.length > 0 && currentUserId === user.id) ||
      (currentUserEmail.length > 0 && currentUserEmail === user.email.trim().toLowerCase());

    if (isCurrentUser) {
      notifyWarning('No puedes eliminar tu propia cuenta desde este modulo');
      return;
    }

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
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Personal del laboratorio</h1>
          <p className="text-sm text-[var(--unilabor-neutral)]">
            Administra usuarios, roles y reseteo de contrasenas temporales.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
          >
            <UserPlus size={16} />
            Nuevo usuario
          </button>

          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={loadingUsers}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={16} className={loadingUsers ? 'animate-spin' : ''} />
            Recargar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, correo o rol..."
            className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)] lg:max-w-md"
          />

          <div className="flex items-center gap-2 text-xs text-[var(--unilabor-neutral)]">
            <span>Filas por pagina</span>
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="rounded-lg border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-2.5 py-1.5 text-xs text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
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

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)] backdrop-blur-xl">
        <table className="w-full text-left">
          <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
            <tr>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Nombre</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Email</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Rol</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Modulos</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Estado</th>
              <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
            {loadingUsers ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-[var(--unilabor-neutral)]">
                  Cargando usuarios...
                </td>
              </tr>
            ) : visibleUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-[var(--unilabor-neutral)]">
                  No hay usuarios para mostrar.
                </td>
              </tr>
            ) : (
              visibleUsers.map((user) => {
                const isCurrentUser =
                  (currentUserId.length > 0 && currentUserId === user.id) ||
                  (currentUserEmail.length > 0 &&
                    currentUserEmail === user.email.trim().toLowerCase());
                const isDeleting = deletingId === user.id;
                const isResetting = resettingId === user.id;

                return (
                  <tr key={user.id} className="transition-colors hover:bg-[rgba(191,212,230,0.22)]">
                    <td className="px-6 py-4 text-sm font-semibold text-[var(--color-brand-700)]">{user.full_name}</td>
                    <td className="px-6 py-4 text-sm text-[var(--unilabor-ink)]">{user.email}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${getRoleBadgeClassName(
                          user.role,
                        )}`}
                      >
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {(user.modules ?? []).length > 0 ? (
                          (user.modules ?? []).map((moduleAccess) => (
                            <span
                              key={`${user.id}-${moduleAccess.code}`}
                              className="rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.34)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]"
                            >
                              {moduleAccess.code}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-[var(--unilabor-neutral)]">Sin modulos</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-[var(--unilabor-ink)]">
                      {user.is_active ? (
                        <span className="rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-2.5 py-1 font-semibold uppercase tracking-wide text-[var(--color-brand-700)]">
                          Activo
                        </span>
                      ) : (
                        <span className="rounded-full border border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.16)] px-2.5 py-1 font-semibold uppercase tracking-wide text-[var(--color-brand-700)]">
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
                          className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Edit3 size={14} />
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => void triggerPasswordReset(user)}
                          disabled={isCurrentUser || isDeleting || isResetting}
                          className="inline-flex items-center gap-1 rounded-lg border border-[rgba(124,173,211,0.28)] bg-[rgba(191,212,230,0.34)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                          title={isCurrentUser ? 'No puedes resetear tu propia clave desde aqui' : ''}
                        >
                          <KeyRound size={14} />
                          {isResetting ? 'Reseteando...' : 'Reset clave'}
                        </button>

                        <button
                          type="button"
                          onClick={() => void removeUser(user)}
                          disabled={isCurrentUser || isDeleting || isResetting}
                          className="inline-flex items-center gap-1 rounded-lg border border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.16)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(151,163,172,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
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

      <div className="flex flex-col gap-3 rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 px-4 py-3 text-sm text-[var(--unilabor-neutral)] shadow-xl shadow-[rgba(0,65,106,0.08)] sm:flex-row sm:items-center sm:justify-between">
        <span>
          Mostrando {startRecord} - {endRecord} de {filteredUsers.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage <= 1}
            className="rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-xs font-semibold text-[var(--color-brand-700)]">
            Pagina {currentPage} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage >= totalPages}
            className="rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
              <h2 className="text-base font-bold text-[var(--color-brand-700)]">Nuevo usuario</h2>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
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
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    placeholder="Nombre Apellido"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
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
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                    placeholder="usuario@unilabor.mx"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Rol
                </label>
                <select
                  value={createForm.role}
                  onChange={(event) => updateCreateRole(normalizeRoleValue(event.target.value))}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                >
                  {ROLE_OPTIONS.map((roleOption) => (
                    <option key={roleOption.value} value={roleOption.value}>
                      {roleOption.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Modulos habilitados
                </p>
                <p className="mb-3 text-xs text-[var(--unilabor-neutral)]">
                  El rol global sigue activo por compatibilidad. En la siguiente iteracion cada modulo podra tener su propio rol.
                </p>

                {loadingModules ? (
                  <p className="text-xs text-[var(--unilabor-neutral)]">Cargando modulos...</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {moduleOptions.map((moduleOption) => {
                      const selected = createForm.moduleCodes.includes(moduleOption.code);
                      return (
                        <label
                          key={moduleOption.code}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[rgba(0,65,106,0.08)] bg-white/90 px-3 py-2 text-xs text-[var(--unilabor-ink)] transition hover:border-[rgba(124,173,211,0.35)] hover:bg-[rgba(191,212,230,0.2)]"
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleCreateModule(moduleOption.code)}
                            className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] bg-white text-[var(--color-brand-500)]"
                          />
                          <span className={selected ? 'font-semibold text-[var(--color-brand-700)]' : ''}>
                            {moduleOption.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Categorias asignadas
                </p>
                <p className="mb-3 text-xs text-[var(--unilabor-neutral)]">
                  {createForm.role === 'VIEWER' && createForm.moduleCodes.includes('QUALITY')
                    ? 'El usuario VIEWER debe tener al menos una categoria para visualizar documentos.'
                    : 'La asignacion de categorias es opcional para este rol.'}
                </p>

                {loadingCategories ? (
                  <p className="text-xs text-[var(--unilabor-neutral)]">Cargando categorias...</p>
                ) : categories.length === 0 ? (
                  <p className="text-xs text-[var(--unilabor-neutral)]">No hay categorias disponibles.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {categories.map((category) => {
                      const selected = createForm.categoryIds.includes(category.id);
                      return (
                        <label
                          key={category.id}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[rgba(0,65,106,0.08)] bg-white/90 px-3 py-2 text-xs text-[var(--unilabor-ink)] transition hover:border-[rgba(124,173,211,0.35)] hover:bg-[rgba(191,212,230,0.2)]"
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleCreateCategory(category.id)}
                            className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] bg-white text-[var(--color-brand-500)]"
                          />
                          <span className={selected ? 'font-semibold text-[var(--color-brand-700)]' : ''}>
                            {category.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.28)] px-3 py-2 text-xs text-[var(--color-brand-700)]">
                Al crear el usuario, el sistema envia por correo una contrasena temporal y se fuerza el cambio en el primer inicio de sesion.
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={creating}
                  className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void submitCreateUser()}
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
            <div className="border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
              <h2 className="text-base font-bold text-[var(--color-brand-700)]">Editar usuario</h2>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
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
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
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
                    className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Rol
                </label>
                <select
                  value={editForm.role}
                  onChange={(event) => updateEditRole(normalizeRoleValue(event.target.value))}
                  className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
                >
                  {ROLE_OPTIONS.map((roleOption) => (
                    <option key={roleOption.value} value={roleOption.value}>
                      {roleOption.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Modulos habilitados
                </p>
                <p className="mb-3 text-xs text-[var(--unilabor-neutral)]">
                  Desde aqui ya puedes activar o retirar acceso a `QUALITY`, `RH` y `HELPDESK` sin tocar la base manualmente.
                </p>

                {loadingModules ? (
                  <p className="text-xs text-[var(--unilabor-neutral)]">Cargando modulos...</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {moduleOptions.map((moduleOption) => {
                      const selected = editForm.moduleCodes.includes(moduleOption.code);
                      return (
                        <label
                          key={moduleOption.code}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[rgba(0,65,106,0.08)] bg-white/90 px-3 py-2 text-xs text-[var(--unilabor-ink)] transition hover:border-[rgba(124,173,211,0.35)] hover:bg-[rgba(191,212,230,0.2)]"
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleEditModule(moduleOption.code)}
                            className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] bg-white text-[var(--color-brand-500)]"
                          />
                          <span className={selected ? 'font-semibold text-[var(--color-brand-700)]' : ''}>
                            {moduleOption.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.95)] p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
                  Categorias asignadas
                </p>
                <p className="mb-3 text-xs text-[var(--unilabor-neutral)]">
                  {editForm.role === 'VIEWER' && editForm.moduleCodes.includes('QUALITY')
                    ? 'El usuario VIEWER debe tener al menos una categoria para visualizar documentos.'
                    : 'La asignacion de categorias es opcional para este rol.'}
                </p>

                {loadingCategories || loadingUserCategories ? (
                  <p className="text-xs text-[var(--unilabor-neutral)]">Cargando categorias...</p>
                ) : categories.length === 0 ? (
                  <p className="text-xs text-[var(--unilabor-neutral)]">No hay categorias disponibles.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {categories.map((category) => {
                      const selected = editForm.categoryIds.includes(category.id);
                      return (
                        <label
                          key={category.id}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[rgba(0,65,106,0.08)] bg-white/90 px-3 py-2 text-xs text-[var(--unilabor-ink)] transition hover:border-[rgba(124,173,211,0.35)] hover:bg-[rgba(191,212,230,0.2)]"
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleEditCategory(category.id)}
                            className="h-4 w-4 rounded border-[rgba(0,65,106,0.18)] bg-white text-[var(--color-brand-500)]"
                          />
                          <span className={selected ? 'font-semibold text-[var(--color-brand-700)]' : ''}>
                            {category.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={savingEdit}
                  className="rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void submitEditUser()}
                  disabled={savingEdit}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
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
