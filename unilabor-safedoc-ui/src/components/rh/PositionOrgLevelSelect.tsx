import { useEffect, useState } from 'react';
import { Loader2, Network } from 'lucide-react';
import { listOrganizationalLevels } from '../../api/service.api-rh-authorized-personnel';
import { getApiErrorMessage } from '../../api/service.parsers';
import { updatePosition } from '../../api/service.api-rh-position';
import type { RhOrganizationalLevel, RhPosition } from '../../types/models';
import { notifyError, notifySuccess } from '../../utils/notify';

interface PositionOrgLevelSelectProps {
  position: RhPosition;
  onSaved: (position: RhPosition) => void;
}

/**
 * Nivel organizacional del puesto (Gerencial, Supervisión, Operativo): columna
 * NIVEL ORG. del Listado de personal autorizado (REH-REG-026).
 */
export const PositionOrgLevelSelect = ({ position, onSaved }: PositionOrgLevelSelectProps) => {
  const [levels, setLevels] = useState<RhOrganizationalLevel[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listOrganizationalLevels()
      .then(setLevels)
      .catch((error) => notifyError(getApiErrorMessage(error, 'No se pudieron cargar los niveles organizacionales.')));
  }, []);

  const change = async (value: string) => {
    if (!value) return;
    setSaving(true);
    try {
      const updated = await updatePosition(position.id, {
        code: position.code,
        name: position.name,
        organizational_level_id: Number(value),
      });
      onSaved(updated);
      notifySuccess(`${position.code} quedó en nivel ${updated.organizational_level_name ?? ''}.`);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el nivel organizacional.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="inline-flex items-center gap-2 text-xs text-[var(--unilabor-neutral)]" title="Nivel organizacional del puesto (REH-REG-026)">
      {saving ? <Loader2 size={13} className="animate-spin" /> : <Network size={13} />}
      <select
        value={position.organizational_level_id ?? ''}
        onChange={(event) => void change(event.target.value)}
        disabled={saving}
        className="rounded-full border border-[rgba(0,65,106,0.16)] bg-[rgba(191,212,230,0.34)] px-2.5 py-1 text-xs font-bold text-[var(--color-brand-700)] outline-none disabled:opacity-60"
        aria-label="Nivel organizacional del puesto"
      >
        {position.organizational_level_id ? null : <option value="">Sin nivel</option>}
        {levels.map((level) => (
          <option key={level.id} value={level.id}>
            {level.name}
          </option>
        ))}
      </select>
    </label>
  );
};
