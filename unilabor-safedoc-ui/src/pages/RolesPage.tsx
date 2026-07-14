import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import {
  createRbacRole,
  deleteRbacRole,
  getApiErrorMessage,
  getRbacRole,
  getRoleUserIds,
  getUserRoleIds,
  listRbacPermissions,
  listRbacRoles,
  listUsers,
  setRbacRolePermissions,
  setRoleUsers,
  setUserRoleIds,
  updateRbacRole,
} from '../api/service';
import type {
  ManagedUser,
  RbacPermission,
  RbacRoleDetail,
  RbacRoleSummary,
} from '../types/models';
import { notifyError, notifySuccess } from '../utils/notify';
import { confirmAction } from '../utils/confirm';

type Tab = 'roles' | 'users';

const cardClass =
  'rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4 shadow-[0_10px_24px_rgba(0,65,106,0.06)]';

const inputClass =
  'w-full rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-2 py-1.5 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)]';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';

// Etiquetas en espanol para los codigos de modulo.
const MODULE_LABELS: Record<string, string> = {
  QUALITY: 'Calidad',
  RH: 'Recursos Humanos',
  HELPDESK: 'Gestión de Activos',
  ADMIN: 'Administración',
  GLOBAL: 'General',
};
const moduleLabel = (code: string | null | undefined): string =>
  MODULE_LABELS[(code ?? 'GLOBAL').toUpperCase()] ?? code ?? 'General';

export const RolesPage = () => {
  const [tab, setTab] = useState<Tab>('roles');
  const [roles, setRoles] = useState<RbacRoleSummary[]>([]);
  const [permissions, setPermissions] = useState<RbacPermission[]>([]);
  const [loading, setLoading] = useState(false);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesData, permsData] = await Promise.all([listRbacRoles(), listRbacPermissions()]);
      setRoles(rolesData);
      setPermissions(permsData);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar roles/permisos'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  // Permisos agrupados por modulo para la matriz.
  const permissionGroups = useMemo(() => {
    const map = new Map<string, RbacPermission[]>();
    for (const permission of permissions) {
      const key = permission.module_code ?? 'GLOBAL';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(permission);
    }
    return Array.from(map.entries());
  }, [permissions]);

  const moduleOptions = useMemo(
    () => Array.from(new Set(permissions.map((p) => p.module_code).filter((code): code is string => Boolean(code)))),
    [permissions],
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--color-brand-700)]">
            <ShieldCheck size={22} /> Roles y permisos
          </h1>
          <p className="text-sm text-[var(--unilabor-neutral)]">
            Administra los roles del sistema, sus permisos por acción y los roles asignados a cada usuario.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadBase()}
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.34)]"
        >
          <RefreshCw size={16} /> Actualizar
        </button>
      </header>

      <div className="inline-flex rounded-xl border border-[rgba(0,65,106,0.1)] bg-white/80 p-1">
        <button
          type="button"
          onClick={() => setTab('roles')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
            tab === 'roles'
              ? 'bg-[rgba(191,212,230,0.5)] text-[var(--color-brand-700)]'
              : 'text-[var(--unilabor-neutral)] hover:text-[var(--color-brand-700)]'
          }`}
        >
          <ShieldCheck size={16} /> Roles
        </button>
        <button
          type="button"
          onClick={() => setTab('users')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
            tab === 'users'
              ? 'bg-[rgba(191,212,230,0.5)] text-[var(--color-brand-700)]'
              : 'text-[var(--unilabor-neutral)] hover:text-[var(--color-brand-700)]'
          }`}
        >
          <Users size={16} /> Usuarios
        </button>
      </div>

      {tab === 'roles' ? (
        <RolesTab
          roles={roles}
          permissionGroups={permissionGroups}
          moduleOptions={moduleOptions}
          loading={loading}
          onChanged={loadBase}
        />
      ) : (
        <UsersTab roles={roles} />
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Pestaña Roles: lista + editor de matriz de permisos + alta/baja
// -----------------------------------------------------------------------------
const RolesTab = ({
  roles,
  permissionGroups,
  moduleOptions,
  loading,
  onChanged,
}: {
  roles: RbacRoleSummary[];
  permissionGroups: [string, RbacPermission[]][];
  moduleOptions: string[];
  loading: boolean;
  onChanged: () => Promise<void>;
}) => {
  const [selected, setSelected] = useState<RbacRoleDetail | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  // Modal de alta/edicion de rol (null = cerrado).
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; role?: RbacRoleSummary } | null>(null);
  // Modal de asignacion de usuarios a un rol (null = cerrado).
  const [usersModalRole, setUsersModalRole] = useState<RbacRoleSummary | null>(null);

  const selectRole = async (roleId: number) => {
    try {
      const detail = await getRbacRole(roleId);
      setSelected(detail);
      setDraft(new Set(detail.permissions));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el rol'));
    }
  };

  const toggle = (code: string) =>
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const savePermissions = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await setRbacRolePermissions(selected.id, Array.from(draft));
      setSelected(updated);
      setDraft(new Set(updated.permissions));
      notifySuccess('Permisos actualizados');
      await onChanged();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron guardar los permisos'));
    } finally {
      setSaving(false);
    }
  };

  const removeRole = async (role: RbacRoleSummary) => {
    const ok = await confirmAction(
      'Eliminar rol',
      `¿Eliminar el rol "${role.name}"? Se quitará de ${role.user_count} usuario(s).`,
      'Eliminar',
    );
    if (!ok) return;
    try {
      await deleteRbacRole(role.id);
      if (selected?.id === role.id) setSelected(null);
      notifySuccess('Rol eliminado');
      await onChanged();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo eliminar el rol'));
    }
  };

  const dirty =
    selected !== null &&
    (draft.size !== selected.permissions.length ||
      selected.permissions.some((code) => !draft.has(code)));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
      <div className={cardClass}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
            Roles ({roles.length})
          </h2>
          <button
            type="button"
            onClick={() => setModal({ mode: 'create' })}
            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-2 py-1 text-xs font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.34)]"
          >
            <Plus size={14} /> Nuevo
          </button>
        </div>

        <ul className="space-y-1">
          {roles.map((role) => (
            <li key={role.id}>
              <button
                type="button"
                onClick={() => void selectRole(role.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                  selected?.id === role.id
                    ? 'border-[rgba(0,65,106,0.18)] bg-[rgba(191,212,230,0.4)]'
                    : 'border-transparent hover:bg-[rgba(191,212,230,0.28)]'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--unilabor-ink)]">{role.name}</span>
                  <span className="block truncate text-[11px] text-[var(--unilabor-neutral)]">
                    {role.permission_count} permisos · {role.user_count} usuarios
                  </span>
                </span>
                <span className="ml-2 flex shrink-0 items-center gap-1">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      setUsersModalRole(role);
                    }}
                    className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:text-[var(--color-brand-700)]"
                    title="Asignar usuarios"
                  >
                    <Users size={15} />
                  </span>
                  {role.is_system ? (
                    <span className="rounded-full bg-[rgba(124,173,211,0.28)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--color-brand-700)]">
                      Sistema
                    </span>
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        void removeRole(role);
                      }}
                      className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:text-red-600"
                      title="Eliminar rol"
                    >
                      <Trash2 size={15} />
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {loading && roles.length === 0 && (
            <li className="px-3 py-4 text-sm text-[var(--unilabor-neutral)]">Cargando…</li>
          )}
        </ul>
      </div>

      <div className={cardClass}>
        {!selected ? (
          <p className="py-10 text-center text-sm text-[var(--unilabor-neutral)]">
            Selecciona un rol para ver y editar sus permisos.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-brand-700)]">{selected.name}</h2>
                <p className="text-xs text-[var(--unilabor-neutral)]">
                  <code>{selected.code}</code> · {draft.size} permisos seleccionados
                  {selected.is_system ? ' · rol de sistema' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModal({ mode: 'edit', role: selected })}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.34)]"
                >
                  <Pencil size={15} /> Editar
                </button>
                <button
                  type="button"
                  disabled={!dirty || saving}
                  onClick={() => void savePermissions()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-600,#00416a)] px-4 py-2 text-sm font-semibold text-white transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Save size={16} /> Guardar permisos
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {permissionGroups.map(([moduleCode, perms]) => (
                <div key={moduleCode} className="rounded-xl border border-[rgba(0,65,106,0.08)] p-3">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                    {moduleLabel(moduleCode)}
                  </h3>
                  <ul className="space-y-1.5">
                    {perms.map((permission) => (
                      <li key={permission.id}>
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={draft.has(permission.code)}
                            onChange={() => toggle(permission.code)}
                            className="mt-0.5 h-4 w-4 accent-[var(--color-brand-600,#00416a)]"
                          />
                          <span className="min-w-0">
                            <span className="block font-medium text-[var(--unilabor-ink)]">
                              {permission.description ?? `${permission.resource}.${permission.action}`}
                            </span>
                            <span className="block font-mono text-[10px] text-[var(--unilabor-neutral)]">
                              {permission.code}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {modal && (
        <RoleFormModal
          mode={modal.mode}
          role={modal.role}
          moduleOptions={moduleOptions}
          onClose={() => setModal(null)}
          onSaved={async (roleId) => {
            setModal(null);
            await onChanged();
            await selectRole(roleId);
          }}
        />
      )}

      {usersModalRole && (
        <RoleUsersModal
          role={usersModalRole}
          onClose={() => setUsersModalRole(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Modal centrado en el rol: lista todos los usuarios con un toggle para
// asignar/quitar el rol. Cada cambio se persiste al momento (optimista).
// -----------------------------------------------------------------------------
const RoleUsersModal = ({
  role,
  onClose,
  onChanged,
}: {
  role: RbacRoleSummary;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listUsers(), getRoleUserIds(role.id)])
      .then(([userList, ids]) => {
        if (cancelled) return;
        setUsers(userList);
        setAssigned(new Set(ids));
      })
      .catch((error) => notifyError(getApiErrorMessage(error, 'No se pudieron cargar los usuarios')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [role.id]);

  const toggle = async (userId: string) => {
    if (savingId) return;
    const willAssign = !assigned.has(userId);
    const next = new Set(assigned);
    if (willAssign) next.add(userId);
    else next.delete(userId);

    setSavingId(userId);
    setAssigned(next); // optimista
    try {
      const confirmed = await setRoleUsers(role.id, Array.from(next));
      setAssigned(new Set(confirmed));
      setTouched(true);
    } catch (error) {
      setAssigned(assigned); // revertir
      notifyError(getApiErrorMessage(error, 'No se pudo actualizar la asignación'));
    } finally {
      setSavingId(null);
    }
  };

  const close = () => {
    if (touched) void onChanged();
    onClose();
  };

  const filtered = users.filter((user) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return user.full_name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-[var(--color-brand-700)]">
              Usuarios del rol: {role.name}
            </h2>
            <p className="text-[11px] text-[var(--unilabor-neutral)]">
              {assigned.size} usuario(s) con este rol · activa el interruptor para asignar o quitar
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1 text-[var(--unilabor-neutral)] transition hover:text-[var(--color-brand-700)]"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="shrink-0 px-4 pt-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar usuario…"
            className={inputClass}
          />
        </div>

        <ul className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-4 py-3">
          {loading && <li className="px-2 py-4 text-sm text-[var(--unilabor-neutral)]">Cargando…</li>}
          {!loading &&
            filtered.map((user) => {
              const on = assigned.has(user.id);
              return (
                <li key={user.id}>
                  <button
                    type="button"
                    disabled={savingId !== null}
                    onClick={() => void toggle(user.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-[rgba(0,65,106,0.08)] px-3 py-2 text-left transition hover:bg-[rgba(191,212,230,0.22)] disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[var(--unilabor-ink)]">
                        {user.full_name}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--unilabor-neutral)]">{user.email}</span>
                    </span>
                    <span
                      aria-hidden
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                        on ? 'bg-[var(--color-brand-600,#00416a)]' : 'bg-[rgba(0,65,106,0.2)]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                          on ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          {!loading && filtered.length === 0 && (
            <li className="px-2 py-4 text-sm text-[var(--unilabor-neutral)]">Sin resultados.</li>
          )}
        </ul>

        <div className="flex shrink-0 justify-end border-t border-[rgba(0,65,106,0.08)] px-4 py-3">
          <button
            type="button"
            onClick={close}
            className="rounded-lg bg-[var(--color-brand-600,#00416a)] px-4 py-1.5 text-sm font-semibold text-white"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};

// Modal de alta/edicion de rol. En edicion el codigo y el modulo son fijos
// (el backend no los modifica) y se puede activar/desactivar el rol.
const RoleFormModal = ({
  mode,
  role,
  moduleOptions,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  role?: RbacRoleSummary;
  moduleOptions: string[];
  onClose: () => void;
  onSaved: (roleId: number) => Promise<void> | void;
}) => {
  const isEdit = mode === 'edit';
  const [code, setCode] = useState(role?.code ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [moduleCode, setModuleCode] = useState(role?.module_code ?? '');
  const [isActive, setIsActive] = useState(role?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  // Bloquea el scroll del fondo mientras el modal esta abierto (evita que el
  // scroll se propague al contenedor detras del backdrop).
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const submit = async () => {
    if ((!isEdit && !code.trim()) || !name.trim()) {
      notifyError('Código y nombre son requeridos');
      return;
    }
    setBusy(true);
    try {
      const saved =
        isEdit && role
          ? await updateRbacRole(role.id, {
              name: name.trim(),
              description: description.trim() || null,
              is_active: isActive,
            })
          : await createRbacRole({
              code: code.trim().toUpperCase(),
              name: name.trim(),
              description: description.trim() || undefined,
              module_code: moduleCode || undefined,
              permission_codes: [],
            });
      notifySuccess(isEdit ? 'Rol actualizado' : 'Rol creado. Ahora asígnale permisos.');
      await onSaved(saved.id);
    } catch (error) {
      notifyError(
        getApiErrorMessage(error, isEdit ? 'No se pudo actualizar el rol' : 'No se pudo crear el rol'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(11,34,53,0.28)] p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/95 shadow-2xl shadow-[rgba(0,65,106,0.16)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
          <h2 className="text-base font-bold text-[var(--color-brand-700)]">
            {isEdit ? 'Editar rol' : 'Nuevo rol'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--unilabor-neutral)] transition hover:text-[var(--color-brand-700)]"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
          <div>
            <label className={labelClass}>Código</label>
            <input
              value={code}
              disabled={isEdit}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="SOPORTE_N1"
              className={`${inputClass} ${isEdit ? 'cursor-not-allowed opacity-60' : ''}`}
            />
            {isEdit && (
              <p className="mt-1 text-[11px] text-[var(--unilabor-neutral)]">El código no se puede cambiar.</p>
            )}
          </div>
          <div>
            <label className={labelClass}>Nombre visible</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Soporte Nivel 1"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Descripción</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="Para qué sirve este rol"
              className={inputClass}
            />
          </div>
          {!isEdit && (
            <div>
              <label className={labelClass}>Módulo</label>
              <select
                value={moduleCode}
                onChange={(event) => setModuleCode(event.target.value)}
                className={inputClass}
              >
                <option value="">Sin módulo</option>
                {moduleOptions.map((option) => (
                  <option key={option} value={option}>
                    {moduleLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isEdit && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--unilabor-ink)]">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                className="h-4 w-4 accent-[var(--color-brand-600,#00416a)]"
              />
              Rol activo
            </label>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-[var(--unilabor-neutral)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-lg bg-[var(--color-brand-600,#00416a)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {isEdit ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Pestaña Usuarios: asignar roles (M:N) a un usuario
// -----------------------------------------------------------------------------
const UsersTab = ({ roles }: { roles: RbacRoleSummary[] }) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [draft, setDraft] = useState<Set<number>>(new Set());
  const [baseline, setBaseline] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((error) => notifyError(getApiErrorMessage(error, 'No se pudieron cargar los usuarios')));
  }, []);

  const selectUser = async (user: ManagedUser) => {
    setSelected(user);
    try {
      const ids = await getUserRoleIds(user.id);
      setDraft(new Set(ids));
      setBaseline(new Set(ids));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los roles del usuario'));
    }
  };

  const toggle = (roleId: number) =>
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const ids = await setUserRoleIds(selected.id, Array.from(draft));
      setDraft(new Set(ids));
      setBaseline(new Set(ids));
      notifySuccess('Roles del usuario actualizados');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron guardar los roles'));
    } finally {
      setSaving(false);
    }
  };

  const dirty = draft.size !== baseline.size || Array.from(draft).some((id) => !baseline.has(id));

  const filtered = users.filter((user) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      user.full_name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)
    );
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
      <div className={cardClass}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar usuario…"
          className="mb-3 w-full rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-2 py-1.5 text-sm"
        />
        <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
          {filtered.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => void selectUser(user)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selected?.id === user.id
                    ? 'border-[rgba(0,65,106,0.18)] bg-[rgba(191,212,230,0.4)]'
                    : 'border-transparent hover:bg-[rgba(191,212,230,0.28)]'
                }`}
              >
                <span className="block truncate text-sm font-semibold text-[var(--unilabor-ink)]">
                  {user.full_name}
                </span>
                <span className="block truncate text-[11px] text-[var(--unilabor-neutral)]">{user.email}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={cardClass}>
        {!selected ? (
          <p className="py-10 text-center text-sm text-[var(--unilabor-neutral)]">
            Selecciona un usuario para asignarle roles.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-brand-700)]">{selected.full_name}</h2>
                <p className="text-xs text-[var(--unilabor-neutral)]">
                  {selected.email} · {draft.size} rol(es)
                </p>
              </div>
              <button
                type="button"
                disabled={!dirty || saving}
                onClick={() => void save()}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-600,#00416a)] px-4 py-2 text-sm font-semibold text-white transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save size={16} /> Guardar roles
              </button>
            </div>

            <ul className="grid gap-1.5 sm:grid-cols-2">
              {roles.map((role) => (
                <li key={role.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[rgba(0,65,106,0.08)] px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.has(role.id)}
                      onChange={() => toggle(role.id)}
                      className="h-4 w-4 accent-[var(--color-brand-600,#00416a)]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[var(--unilabor-ink)]">{role.name}</span>
                      <span className="block truncate text-[11px] text-[var(--unilabor-neutral)]">
                        {moduleLabel(role.module_code)} · {role.permission_count} permisos
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
