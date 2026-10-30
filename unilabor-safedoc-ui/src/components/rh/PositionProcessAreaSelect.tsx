import { useEffect, useState } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import { getApiErrorMessage } from '../../api/service.parsers';
import { listProcessAreas, updatePosition } from '../../api/service.api-rh-position';
import type { RhPosition, RhProcessArea } from '../../types/models';
import { notifyError, notifySuccess } from '../../utils/notify';

interface PositionProcessAreaSelectProps {
  position: RhPosition;
  onSaved: (position: RhPosition) => void;
}

/**
 * Área del proceso que rige el puesto (Preanalítica, Analítica, Posanalítica,
 * Administración). Define los firmantes del ANA-REG-060 en la Fase 6.
 */
export const PositionProcessAreaSelect = ({ position, onSaved }: PositionProcessAreaSelectProps) => {
  const [areas, setAreas] = useState<RhProcessArea[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listProcessAreas()
      .then(setAreas)
      .catch((error) => notifyError(getApiErrorMessage(error, 'No se pudieron cargar las áreas.')));
  }, []);

  const change = async (value: string) => {
    setSaving(true);
    try {
      const updated = await updatePosition(position.id, {
        code: position.code,
        name: position.name,
        process_area_id: value ? Number(value) : null,
      });
      onSaved(updated);
      notifySuccess(updated.process_area_name ? `${position.code} pertenece a ${updated.process_area_name}.` : `${position.code} quedó sin área.`);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el área del puesto.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="inline-flex items-center gap-2 text-xs text-[var(--unilabor-neutral)]" title="Área del proceso que rige el puesto">
      {saving ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />}
      <select
        value={position.process_area_id ?? ''}
        onChange={(event) => void change(event.target.value)}
        disabled={saving}
        className={`rounded-full border px-2.5 py-1 text-xs font-bold outline-none disabled:opacity-60 ${
          position.process_area_id ? 'border-[rgba(0,65,106,0.16)] bg-[rgba(191,212,230,0.34)] text-[var(--color-brand-700)]' : 'border-amber-300 bg-amber-50 text-amber-700'
        }`}
        aria-label="Área del puesto"
      >
        <option value="">Sin área</option>
        {areas.map((area) => (
          <option key={area.id} value={area.id}>
            {area.name}
          </option>
        ))}
      </select>
    </label>
  );
};
