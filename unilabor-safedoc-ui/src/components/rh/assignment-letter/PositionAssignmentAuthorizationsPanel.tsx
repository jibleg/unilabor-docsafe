import { useEffect, useState } from 'react';
import { CheckCheck, Loader2, MinusCircle, Save } from 'lucide-react';
import { getPositionAuthorizations, listAssignmentAuthorizationItems, setPositionAuthorizations } from '../../../api/service.api-rh-assignment-letter';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { AssignmentAuthorizationItem } from '../../../types/models';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { buttonClass } from '../supervision/supervision-ui';
import { AuthorizationGroups } from './AuthorizationGroups';

interface PositionAssignmentAuthorizationsPanelProps {
  positionId: number;
  positionName: string;
}

/**
 * Pestaña "Carta de asignación" del puesto: qué autorizaciones del REH-REG-008
 * aplican al puesto (las define RH con el coordinador del área). Se prellenan
 * en la carta de cada colaborador. Las generales (1-8, "a todos") vienen
 * activadas por defecto, pero se pueden desactivar para el puesto.
 */
export const PositionAssignmentAuthorizationsPanel = ({ positionId, positionName }: PositionAssignmentAuthorizationsPanelProps) => {
  const [items, setItems] = useState<AssignmentAuthorizationItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listAssignmentAuthorizationItems(), getPositionAuthorizations(positionId)])
      .then(([catalog, ids]) => {
        if (cancelled) return;
        setItems(catalog);
        setSelected(new Set(ids));
        setSaved(new Set(ids));
      })
      .catch((error) => notifyError(getApiErrorMessage(error, 'No se pudieron cargar las autorizaciones del puesto.')))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [positionId]);

  const general = items.filter((item) => item.applies_to_all);
  const dirty = selected.size !== saved.size || [...selected].some((id) => !saved.has(id));
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      const ids = await setPositionAuthorizations(positionId, [...selected]);
      setSelected(new Set(ids));
      setSaved(new Set(ids));
      notifySuccess(`Autorizaciones de ${positionName} guardadas.`);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron guardar las autorizaciones.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
        <Loader2 size={14} className="animate-spin" /> Cargando autorizaciones…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-xl text-xs leading-5 text-[var(--unilabor-ink)]">
          Autorizaciones de la <strong>Carta de asignación de puesto (REH-REG-008)</strong> que aplican a este puesto. Se marcan solas en la carta
          de cada colaborador al autorizar su REH-REG-003; RH puede ajustarlas por persona antes de firmar. Las {general.length} generales vienen
          activadas por defecto.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSelected(new Set(items.map((item) => item.id)))} className={buttonClass} title="Activar todas">
            <CheckCheck size={14} /> Todas
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className={buttonClass} title="Desactivar todas">
            <MinusCircle size={14} /> Ninguna
          </button>
          <button type="button" onClick={() => void save()} disabled={!dirty || saving} className={buttonClass}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
          </button>
        </div>
      </div>
      <p className="text-xs font-semibold text-[var(--color-brand-700)]">
        {selected.size} de {items.length} autorizaciones activadas
      </p>
      <AuthorizationGroups
        items={items}
        isChecked={(id) => selected.has(id)}
        onToggle={toggle}
        onToggleGroup={(ids, value) =>
          setSelected((current) => {
            const next = new Set(current);
            for (const id of ids) {
              if (value) next.add(id);
              else next.delete(id);
            }
            return next;
          })
        }
      />
    </div>
  );
};
