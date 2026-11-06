import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, Unlink } from 'lucide-react';
import {
  createEmployeeXlabLink,
  deleteEmployeeXlabLink,
  getEmployeeXlabLink,
  listAvailableXlabUsers,
  updateEmployeeXlabLink,
} from '../../api/service.api-my-notifications';
import { getApiErrorMessage } from '../../api/service.parsers';
import { useAuthStore } from '../../store/useAuthStore';
import type { EmployeeXlabLink, XlabUser } from '../../types/models';
import { confirmAction } from '../../utils/confirm';
import { notifyError, notifySuccess } from '../../utils/notify';
import { hasPermission } from '../../utils/permissions';
import { SearchableSelect } from '../SearchableSelect';

const secondaryButton =
  'inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.12)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:opacity-50';
const primaryButton =
  'inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:opacity-50';

/**
 * Vínculo 1 a 1 del usuario de DocSafe del colaborador con su usuario de XLab: con él,
 * el colaborador recibe en DocSafe sus notificaciones de Contigo+. Solo edita quien
 * puede editar colaboradores; se monta solo si el colaborador ya tiene usuario.
 */
export const EmployeeXlabLinkCard = ({ employeeId }: { employeeId: number }) => {
  const permissions = useAuthStore((state) => state.permissions);
  const canEdit = hasPermission(permissions, 'RH.EMPLOYEES.WRITE');
  const [link, setLink] = useState<EmployeeXlabLink | null>(null);
  const [users, setUsers] = useState<XlabUser[]>([]);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getEmployeeXlabLink(employeeId)
      .then((value) => {
        if (!cancelled) setLink(value);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getApiErrorMessage(error, 'No se pudo consultar el vínculo con XLab.'));
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const startEditing = useCallback(async () => {
    setEditing(true);
    setSelected('');
    setLoadingUsers(true);
    try {
      setUsers(await listAvailableXlabUsers());
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los usuarios de XLab.'));
      setEditing(false);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const options = useMemo(
    () =>
      users.map((user) => ({
        value: String(user.cve_usuario),
        label: user.nombre,
        hint: `Clave ${user.cve_usuario}${user.tipo !== null ? ` · Tipo ${user.tipo}` : ''}`,
      })),
    [users],
  );

  const save = async () => {
    setSaving(true);
    try {
      const cve = Number(selected);
      setLink(link?.cve_usuario != null ? await updateEmployeeXlabLink(employeeId, cve) : await createEmployeeXlabLink(employeeId, cve));
      setEditing(false);
      notifySuccess('Vínculo con XLab guardado.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el vínculo con XLab.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const confirmed = await confirmAction(
      'Quitar vínculo con XLab',
      'El colaborador dejará de ver sus notificaciones de Contigo+ en DocSafe. Las notificaciones no se borran.',
      'Quitar vínculo',
    );
    if (!confirmed) {
      return;
    }
    setSaving(true);
    try {
      await deleteEmployeeXlabLink(employeeId);
      setLink(await getEmployeeXlabLink(employeeId));
      notifySuccess('Vínculo con XLab quitado.');
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo quitar el vínculo con XLab.'));
    } finally {
      setSaving(false);
    }
  };

  const linked = link?.cve_usuario != null;

  return (
    <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Usuario de XLab</p>

      {loadError ? (
        <p className="mt-2 text-sm text-red-700">{loadError}</p>
      ) : !link ? (
        <p className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
          <Loader2 size={14} className="animate-spin" /> Cargando…
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          {linked ? (
            <div>
              <p className="text-sm font-semibold text-[var(--color-brand-700)]">
                {link.xlab_user?.nombre ?? `Usuario ${link.cve_usuario}`}
              </p>
              <p className="text-xs text-[var(--unilabor-neutral)]">
                Clave {link.cve_usuario}
                {link.xlab_user?.tipo != null ? ` · Tipo ${link.xlab_user.tipo}` : ''}
                {link.xlab_user && !link.xlab_user.activo ? ' · Inactivo en XLab' : ''}
                {link.xlab_available ? '' : ' · XLab no disponible por el momento'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--unilabor-neutral)]">Sin vincular: el colaborador aún no recibe sus notificaciones de Contigo+.</p>
          )}

          {canEdit && editing ? (
            <div className="space-y-2">
              <SearchableSelect
                value={selected}
                options={options}
                onChange={setSelected}
                disabled={loadingUsers || saving}
                clearable={false}
                placeholder={loadingUsers ? 'Cargando usuarios de XLab…' : 'Elige un usuario de XLab'}
                searchPlaceholder="Busca por nombre o clave..."
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(false)} disabled={saving} className={secondaryButton}>
                  Cancelar
                </button>
                <button type="button" onClick={() => void save()} disabled={!selected || saving} className={primaryButton}>
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Guardar vínculo
                </button>
              </div>
            </div>
          ) : canEdit ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void startEditing()} disabled={saving} className={linked ? secondaryButton : primaryButton}>
                <Link2 size={13} /> {linked ? 'Cambiar' : 'Vincular'}
              </button>
              {linked ? (
                <button type="button" onClick={() => void remove()} disabled={saving} className={secondaryButton}>
                  <Unlink size={13} /> Quitar
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
