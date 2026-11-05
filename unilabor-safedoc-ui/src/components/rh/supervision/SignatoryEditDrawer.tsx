import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { getUnitSignatoryImpact, saveUnitSignatories } from '../../../api/service.api-rh-supervision';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type {
  SupervisionAreaSignatory,
  SupervisionSignatoriesOverview,
  SupervisionUnitAreaSignatory,
  SupervisionUnitSignatories,
  UnitSignatoryImpact,
} from '../../../types/models';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { SearchableSelect, type SearchableOption } from '../../SearchableSelect';
import { DrawerShell } from '../../attendance/schedule/DrawerShell';
import { SignatoryToggle } from './SignatoryToggle';
import { SOURCE_BADGE } from './signatory-ui';
import { buttonClass, labelClass, primaryButtonClass } from './supervision-ui';

/** Celda (unidad, área) cuyo responsable propio se está editando. */
export interface SignatoryEditTarget {
  unit: SupervisionUnitSignatories;
  cell: SupervisionUnitAreaSignatory;
}

interface SignatoryEditDrawerProps {
  /** null = panel cerrado. */
  target: SignatoryEditTarget | null;
  units: SupervisionUnitSignatories[];
  /** Responsable general de cada área (lo que hereda una unidad sin responsable propio). */
  generals: SupervisionAreaSignatory[];
  employeeOptions: SearchableOption[];
  onClose: () => void;
  onSaved: (overview: SupervisionSignatoriesOverview) => void;
}

interface SignatoryEditFormProps extends Omit<SignatoryEditDrawerProps, 'target'> {
  target: SignatoryEditTarget;
  onBusyChange: (busy: boolean) => void;
}

const plural = (count: number, singular: string, pluralForm: string): string => `${count} ${count === 1 ? singular : pluralForm}`;

const SignatoryEditForm = ({ target, units, generals, employeeOptions, onClose, onSaved, onBusyChange }: SignatoryEditFormProps) => {
  const { unit, cell } = target;
  // Un responsable propio dado de baja ya no es elegible: el formulario arranca en "usar el general".
  const ownId = cell.own?.is_active ? String(cell.own.employee_id) : '';
  const [employeeId, setEmployeeId] = useState(ownId);
  const [extraUnitIds, setExtraUnitIds] = useState<number[]>([]);
  const [impact, setImpact] = useState<{ key: string; value: UnitSignatoryImpact | null } | null>(null);
  const [saving, setSaving] = useState(false);

  const general = generals.find((row) => row.area_key === cell.area_key) ?? null;
  const otherUnits = units.filter((candidate) => candidate.unit_id !== unit.unit_id);
  const unitIds = useMemo(() => [unit.unit_id, ...extraUnitIds], [unit.unit_id, extraUnitIds]);
  const impactKey = `${cell.area_key}|${unitIds.join(',')}|${employeeId}`;
  const selectedName = employeeOptions.find((option) => option.value === employeeId)?.label ?? null;
  const changed = (employeeId ? Number(employeeId) : null) !== (cell.own?.employee_id ?? null);
  const badge = SOURCE_BADGE[cell.effective_source ?? 'NONE'];
  const inheritLabel = `Usar el responsable general (${general?.area_responsible_name || 'sin configurar'})`;

  useEffect(() => {
    let alive = true;
    getUnitSignatoryImpact(cell.area_key, unitIds, employeeId ? Number(employeeId) : null)
      .then((value) => alive && setImpact({ key: impactKey, value }))
      .catch(() => alive && setImpact({ key: impactKey, value: null }));
    return () => {
      alive = false;
    };
  }, [cell.area_key, unitIds, employeeId, impactKey]);

  const toggleUnit = (unitId: number, checked: boolean) =>
    setExtraUnitIds((current) => (checked ? [...current, unitId] : current.filter((id) => id !== unitId)));

  const save = async () => {
    setSaving(true);
    onBusyChange(true);
    try {
      const result = await saveUnitSignatories(
        unitIds.map((unitId) => ({ unit_id: unitId, area_key: cell.area_key, area_responsible_employee_id: employeeId ? Number(employeeId) : null })),
      );
      notifySuccess(result.message);
      onSaved(result.overview);
      onClose();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el responsable de la unidad.'));
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  };

  const currentImpact = impact?.key === impactKey ? impact : null;

  return (
    <div className="space-y-5">
      <p className="text-xs leading-5 text-[var(--unilabor-neutral)]">
        Hoy firma:{' '}
        <span className="font-semibold text-[var(--unilabor-ink)]">{cell.effective?.name ?? 'nadie'}</span>{' '}
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.className}`}>{badge.label}</span>
        <br />
        {plural(cell.employees, 'colaborador', 'colaboradores')} del área en la unidad · {plural(cell.phase6_pending, 'Fase 6 pendiente', 'Fase 6 pendientes')}
      </p>

      <div>
        <label className={labelClass}>Responsable del Área en {unit.unit_name}</label>
        <SearchableSelect
          value={employeeId}
          options={employeeOptions}
          onChange={setEmployeeId}
          placeholder={inheritLabel}
          emptyLabel={inheritLabel}
          searchPlaceholder="Buscar colaborador..."
          disabled={saving}
        />
        <p className="mt-1 text-[11px] leading-4 text-[var(--unilabor-neutral)]">
          Puede ser de otra unidad. Si no eliges a nadie, la unidad hereda al responsable general del área.
        </p>
      </div>

      {otherUnits.length > 0 ? (
        <div>
          <p className={labelClass}>Aplicar también a estas unidades</p>
          <div className="space-y-2 rounded-xl border border-[rgba(0,65,106,0.1)] p-3">
            {otherUnits.map((other) => {
              const otherCell = other.areas.find((candidate) => candidate.area_key === cell.area_key);
              const staff = otherCell?.employees ?? 0;
              return (
                <SignatoryToggle
                  key={other.unit_id}
                  checked={extraUnitIds.includes(other.unit_id)}
                  onChange={(checked) => toggleUnit(other.unit_id, checked)}
                  disabled={saving}
                  label={other.unit_name}
                  hint={
                    staff > 0
                      ? `${plural(staff, 'colaborador', 'colaboradores')} · hoy firma ${otherCell?.effective?.name ?? 'nadie'}`
                      : 'Sin personal en esta área'
                  }
                />
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-[rgba(0,65,106,0.1)] bg-[rgba(248,251,253,0.9)] px-3 py-2.5 text-xs leading-5 text-[var(--unilabor-ink)]" aria-live="polite">
        <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Impacto</p>
        {!currentImpact ? (
          <p className="inline-flex items-center gap-2 text-[var(--unilabor-neutral)]">
            <Loader2 size={12} className="animate-spin" /> Calculando…
          </p>
        ) : !currentImpact.value ? (
          <p className="text-[var(--unilabor-neutral)]">No se pudo calcular el impacto; el cambio se puede guardar de todos modos.</p>
        ) : (
          <>
            <p>
              Se actualizarán <strong>{plural(currentImpact.value.drafts_to_update, 'borrador', 'borradores')}</strong>;{' '}
              {plural(currentImpact.value.in_signature_unchanged, 'lista en firma no cambia', 'listas en firma no cambian')}.
            </p>
            {currentImpact.value.candidate_self_evaluations > 0 ? (
              <p className="text-amber-700">
                {selectedName ?? 'El colaborador elegido'} es evaluado en {plural(currentImpact.value.candidate_self_evaluations, 'lista', 'listas')} de{' '}
                {unitIds.length > 1 ? 'estas unidades' : 'esta unidad'}: ahí firmará el responsable general o su suplente.
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={saving} className={buttonClass}>
          Cancelar
        </button>
        <button type="button" onClick={() => void save()} disabled={saving || (!changed && extraUnitIds.length === 0)} className={primaryButtonClass}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
        </button>
      </div>
    </div>
  );
};

/** Panel lateral para elegir el Responsable del Área propio de una unidad (o volver a heredar el general). */
export const SignatoryEditDrawer = ({ target, onClose, ...form }: SignatoryEditDrawerProps) => {
  const [busy, setBusy] = useState(false);
  return (
    <DrawerShell
      open={target !== null}
      title={target ? `${target.cell.area_name} · ${target.unit.unit_name}` : 'Responsable del Área'}
      subtitle="Responsable del Área propio de la unidad"
      onClose={onClose}
      busy={busy}
    >
      {target ? (
        <SignatoryEditForm key={`${target.unit.unit_id}:${target.cell.area_key}`} target={target} onClose={onClose} onBusyChange={setBusy} {...form} />
      ) : null}
    </DrawerShell>
  );
};
