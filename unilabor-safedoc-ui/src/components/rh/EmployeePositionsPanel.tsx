import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  assignEmployeePosition,
  endEmployeePosition,
  listEmployeePositions,
  listPositions,
} from '../../api/service.api-rh-position';
import { getApiErrorMessage } from '../../api/service.parsers';
import type { RhEmployeePosition, RhPosition } from '../../types/models';

interface EmployeePositionsPanelProps {
  employeeId: number;
}

export const EmployeePositionsPanel = ({ employeeId }: EmployeePositionsPanelProps) => {
  const [assigned, setAssigned] = useState<RhEmployeePosition[]>([]);
  const [catalog, setCatalog] = useState<RhPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPositionId, setSelectedPositionId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [positions, allPositions] = await Promise.all([
        listEmployeePositions(employeeId),
        listPositions(false),
      ]);
      setAssigned(positions);
      setCatalog(allPositions);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudieron cargar los puestos del colaborador.'));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAssign = async () => {
    const positionId = Number(selectedPositionId);
    if (!positionId) {
      toast.warning('Selecciona un puesto.');
      return;
    }
    setSaving(true);
    try {
      await assignEmployeePosition(employeeId, positionId);
      setSelectedPositionId('');
      toast.success('Puesto asignado correctamente.');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo asignar el puesto.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEnd = async (employeePositionId: number) => {
    try {
      await endEmployeePosition(employeePositionId);
      toast.success('Puesto finalizado correctamente.');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo finalizar el puesto.'));
    }
  };

  const availablePositions = catalog.filter(
    (position) => !assigned.some((item) => item.position_id === position.id),
  );

  return (
    <div className="rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/92 shadow-xl shadow-[rgba(0,65,106,0.08)]">
      <div className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)] px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Inducción por puesto</p>
        <h3 className="mt-1 flex items-center gap-2 text-lg font-bold text-[var(--color-brand-700)]">
          <Briefcase size={18} />
          Puestos asignados
        </h3>
      </div>

      <div className="space-y-3 p-5">
        {loading ? (
          <p className="text-sm text-[var(--unilabor-neutral)]">Cargando...</p>
        ) : assigned.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
            Sin puestos asignados. Un colaborador puede tener más de un puesto activo a la vez.
          </p>
        ) : (
          <div className="space-y-2">
            {assigned.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-bold text-[var(--color-brand-700)]">{item.position_name}</p>
                  <p className="text-xs text-[var(--unilabor-neutral)]">{item.position_code}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleEnd(item.id)}
                  className="rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-500/10"
                  title="Finalizar este puesto"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <select
            value={selectedPositionId}
            onChange={(event) => setSelectedPositionId(event.target.value)}
            className="w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none"
          >
            <option value="">Seleccionar puesto...</option>
            {availablePositions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleAssign()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
};
