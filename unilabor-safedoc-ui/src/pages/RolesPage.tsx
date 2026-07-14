import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import {
  createRbacRole,
  deleteRbacRole,
  getApiErrorMessage,
  getRbacRole,
  getUserRoleIds,
  listRbacPermissions,
  listRbacRoles,
  listUsers,
  setRbacRolePermissions,
  setUserRoleIds,
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
  const [creating, setCreating] = useState(false);

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
            onClick={() => setCreating((value) => !value)}
            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] px-2 py-1 text-xs font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.34)]"
          >
            <Plus size={14} /> Nuevo
          </button>
        </div>

        {creating && (
          <CreateRoleForm
            moduleOptions={moduleOptions}
            onCancel={() => setCreating(false)}
            onCreated={async () => {
              setCreating(false);
              await onChanged();
            }}
          />
        )}

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
                {role.is_system ? (
                  <span className="ml-2 shrink-0 rounded-full bg-[rgba(124,173,211,0.28)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--color-brand-700)]">
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
                    className="ml-2 shrink-0 rounded-lg p-1 text-[var(--unilabor-neutral)] hover:text-red-600"
                    title="Eliminar rol"
                  >
                    <Trash2 size={15} />
                  </span>
                )}
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
              <button
                type="button"
                disabled={!dirty || saving}
                onClick={() => void savePermissions()}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-600,#00416a)] px-4 py-2 text-sm font-semibold text-white transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save size={16} /> Guardar permisos
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {permissionGroups.map(([moduleCode, perms]) => (
                <div key={moduleCode} className="rounded-xl border border-[rgba(0,65,106,0.08)] p-3">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                    {moduleCode}
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
                              {permission.resource}.{permission.action}
                            </span>
                            {permission.description && (
                              <span className="block text-[11px] text-[var(--unilabor-neutral)]">
                                {permission.description}
                              </span>
                            )}
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
    </div>
  );
};

const CreateRoleForm = ({
  moduleOptions,
  onCancel,
  onCreated,
}: {
  moduleOptions: string[];
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [moduleCode, setModuleCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code.trim() || !name.trim()) {
      notifyError('Código y nombre son requeridos');
      return;
    }
    setBusy(true);
    try {
      await createRbacRole({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        module_code: moduleCode || undefined,
        permission_codes: [],
      });
      notifySuccess('Rol creado. Ahora asígnale permisos.');
      await onCreated();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo crear el rol'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(239,245,250,0.6)] p-3">
      <input
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        placeholder="CÓDIGO (ej. SOPORTE_N1)"
        className="w-full rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-2 py-1.5 text-sm"
      />
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Nombre visible"
        className="w-full rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-2 py-1.5 text-sm"
      />
      <select
        value={moduleCode}
        onChange={(event) => setModuleCode(event.target.value)}
        className="w-full rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-2 py-1.5 text-sm"
      >
        <option value="">Sin módulo</option>
        {moduleOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-[var(--unilabor-neutral)]">
          Cancelar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="rounded-lg bg-[var(--color-brand-600,#00416a)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Crear
        </button>
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
                        {role.module_code ?? 'GLOBAL'} · {role.permission_count} permisos
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
