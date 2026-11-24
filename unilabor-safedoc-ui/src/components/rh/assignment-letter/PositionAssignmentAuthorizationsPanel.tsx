import { useEffect, useState } from 'react';
import { CheckCheck, Loader2, MinusCircle, Save } from 'lucide-react';
import { getPositionAuthorizations, listAssignmentAuthorizationItems, setPositionAuthorizations } from '../../../api/service.api-rh-assignment-letter';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { AssignmentAuthorizationItem } from '../../../types/models';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { buttonClass } from '../supervision/supervision-ui';
import { AuthorizationGroups } from './AuthorizationGroups';

/** Número de la autorización «Otras» del formato REH-REG-008. */
const OTHER_ITEM_NO = 82;

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
  const [other, setOther] = useState('');
  const [savedOther, setSavedOther] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listAssignmentAuthorizationItems(), getPositionAuthorizations(positionId)])
      .then(([catalog, defaults]) => {
        if (cancelled) return;
        setItems(catalog);
        setSelected(new Set(defaults.item_ids));
        setSaved(new Set(defaults.item_ids));
        setOther(defaults.other_authorizations ?? '');
        setSavedOther(defaults.other_authorizations ?? '');
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
  // "Otras" (82) lleva texto libre: se define aquí para que todas las cartas del puesto digan lo mismo.
  const otherItem = items.find((item) => item.item_no === OTHER_ITEM_NO);
  const otherEnabled = otherItem ? selected.has(otherItem.id) : false;
  const dirty = selected.size !== saved.size || [...selected].some((id) => !saved.has(id)) || other.trim() !== savedOther.trim();
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
      const defaults = await setPositionAuthorizations(positionId, [...selected], otherEnabled ? other.trim() || null : null);
      setSelected(new Set(defaults.item_ids));
      setSaved(new Set(defaults.item_ids));
      setOther(defaults.other_authorizations ?? '');
      setSavedOther(defaults.other_authorizations ?? '');
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
      {/* Siempre montado (solo se deshabilita) para que el panel no salte al marcar "Otras". */}
      <label className={`block text-xs font-semibold text-[var(--unilabor-neutral)] ${otherEnabled ? '' : 'opacity-40'}`}>
        Texto de «Otras» (autorización {OTHER_ITEM_NO})
        <input
          value={other}
          onChange={(event) => setOther(event.target.value)}
          disabled={!otherEnabled}
          maxLength={500}
          placeholder={otherEnabled ? 'Ej. Elaboración de bitácoras de trabajo, Generación de facturas a pacientes' : 'Activa «Otras» para capturar su texto'}
          title="Se precarga en la carta de cada colaborador del puesto"
          className="mt-1 block w-full rounded-xl border border-[rgba(0,65,106,0.15)] bg-white px-3 py-2 text-sm font-normal text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-300)]"
        />
      </label>
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
