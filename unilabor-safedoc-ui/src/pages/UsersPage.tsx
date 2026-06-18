
import { useCallback, useEffect, useState } from 'react';
import { Edit3, KeyRound, Plus, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import {
  createUser,
  deleteUserById,
  fetchCategories,
  fetchModuleCatalog,
  fetchUserCategories,
  getApiErrorMessage,
  listUsersPaginated,
  resetUserPassword,
  updateUserById,
  updateUserCategories,
  type CreateUserPayload,
  type UpdateUserPayload,
} from '../api/service';
import type { Category, ManagedUser, ModuleAccess, ModuleCode } from '../types/models';
import { useAuthStore } from '../store/useAuthStore';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';

import { UserFormModal } from '../components/admin/UserFormModal';
import {
  PAGE_SIZE_OPTIONS,
  EMAIL_REGEX,
  EMPTY_FORM,
  FALLBACK_MODULE_OPTIONS,
  getRoleLabel,
  getRoleBadgeClassName,
  normalizeRoleValue,
  confirmAction,
  type RoleValue,
  type UserFormState,
} from './UsersPage.helpers';

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
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);

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
      const result = await listUsersPaginated({
        page: currentPage,
        limit: pageSize,
        search: debouncedQuery,
      });
      setUsers(result.data);
      setTotal(result.pagination.total);
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudo cargar el listado de usuarios'));
    } finally {
      setLoadingUsers(false);
    }
  }, [currentPage, pageSize, debouncedQuery]);

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const categoriesData = await fetchCategories();
      setCategories(
        [...categoriesData].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
      );
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudieron cargar las categorías'));
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
      notifyWarning(getApiErrorMessage(requestError, 'No se pudo cargar el catálogo de módulos. Se usará la configuración base.'));
      setModuleOptions(FALLBACK_MODULE_OPTIONS);
    } finally {
      setLoadingModules(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
    void loadModules();
  }, [loadCategories, loadModules]);

  // Búsqueda con debounce: vuelve a la primera página al cambiar el término.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setCurrentPage(1);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [query]);

  // Refetch del servidor cuando cambian página, tamaño o búsqueda efectiva.
  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const startRecord = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, total);

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
      notifyWarning('El correo no tiene un formato válido');
      return false;
    }

    if (form.role === 'VIEWER' && form.moduleCodes.includes('QUALITY') && form.categoryIds.length === 0) {
      notifyWarning('Un usuario VIEWER debe tener al menos una categoría asignada');
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
      notifyError(getApiErrorMessage(requestError, 'No se pudieron cargar las categorías del usuario'));
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
      notifyWarning('No puedes eliminar tu propia cuenta desde este módulo');
      return;
    }

    const confirmed = await confirmAction(
      `Se eliminará al usuario "${user.full_name}".`,
      'La cuenta será desactivada y no podrá iniciar sesión.',
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
      `Se reseteará la contraseña de "${user.full_name}".`,
      'Se enviará una clave temporal por correo y el usuario deberá cambiarla al iniciar sesión.',
      'Resetear',
    );

    if (!confirmed) {
      return;
    }

    setResettingId(user.id);
    try {
      await resetUserPassword(user.id);
      notifySuccess('Contraseña temporal enviada por correo. El cambio será obligatorio al iniciar sesión.');
      await loadUsers();
    } catch (requestError) {
      notifyError(getApiErrorMessage(requestError, 'No se pudo resetear la contraseña del usuario'));
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
            Administra usuarios, roles y reseteo de contraseñas temporales.
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
            <span>Filas por página</span>
            <select
              value={pageSize}
              onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }}
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
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Módulos</th>
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
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-[var(--unilabor-neutral)]">
                  No hay usuarios para mostrar.
                </td>
              </tr>
            ) : (
              users.map((user) => {
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
                          <span className="text-xs text-[var(--unilabor-neutral)]">Sin módulos</span>
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
                          title={isCurrentUser ? 'No puedes resetear tu propia clave desde aquí' : ''}
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
          Mostrando {startRecord} - {endRecord} de {total}
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
            Página {currentPage} de {totalPages}
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
        <UserFormModal
          title="Nuevo usuario"
          form={createForm}
          setForm={setCreateForm}
          onUpdateRole={updateCreateRole}
          onToggleModule={toggleCreateModule}
          onToggleCategory={toggleCreateCategory}
          moduleOptions={moduleOptions}
          categories={categories}
          loadingModules={loadingModules}
          loadingCategories={loadingCategories}
          modulesHelpText="El rol global sigue activo por compatibilidad. En la siguiente iteración cada módulo podrá tener su propio rol."
          showCredentialsNote
          submitting={creating}
          submitLabel="Guardar usuario"
          submittingLabel="Guardando..."
          submitIcon={<Plus size={14} />}
          onSubmit={() => void submitCreateUser()}
          onClose={closeCreateModal}
        />
      )}

      {isEditModalOpen && editingUser && (
        <UserFormModal
          title="Editar usuario"
          form={editForm}
          setForm={setEditForm}
          onUpdateRole={updateEditRole}
          onToggleModule={toggleEditModule}
          onToggleCategory={toggleEditCategory}
          moduleOptions={moduleOptions}
          categories={categories}
          loadingModules={loadingModules}
          loadingCategories={loadingCategories || loadingUserCategories}
          modulesHelpText="Desde aquí ya puedes activar o retirar acceso a QUALITY, RH y HELPDESK sin tocar la base manualmente."
          submitting={savingEdit}
          submitLabel="Guardar cambios"
          submittingLabel="Guardando..."
          submitIcon={<Edit3 size={14} />}
          onSubmit={() => void submitEditUser()}
          onClose={closeEditModal}
        />
      )}
    </div>
  );
};
