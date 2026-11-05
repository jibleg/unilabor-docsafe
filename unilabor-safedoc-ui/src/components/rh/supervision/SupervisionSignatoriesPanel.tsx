import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { getSignatoriesOverview, saveAreaSignatories } from '../../../api/service.api-rh-supervision';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { SupervisionAreaSignatory, SupervisionSignatoriesOverview } from '../../../types/models';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { SearchableSelect } from '../../SearchableSelect';
import { SignatoryEditDrawer, type SignatoryEditTarget } from './SignatoryEditDrawer';
import { SignatoryUnitCard } from './SignatoryUnitCard';
import { WARNING_CLASS, generalWarnings } from './signatory-ui';
import { buttonClass } from './supervision-ui';
import { useEmployeeOptions } from './useEmployeeOptions';

/** Cambios sin guardar del bloque general: por área, el responsable y/o el suplente elegidos. */
type GeneralEdits = Record<string, { responsible?: number | null; alternate?: number | null }>;

const responsibleOf = (row: SupervisionAreaSignatory, edits: GeneralEdits): number | null => {
  const edit = edits[row.area_key];
  return edit && edit.responsible !== undefined ? edit.responsible : row.area_responsible_employee_id;
};

const alternateOf = (row: SupervisionAreaSignatory, edits: GeneralEdits): number | null => {
  const edit = edits[row.area_key];
  return edit && edit.alternate !== undefined ? edit.alternate : row.alternate_employee_id;
};

/**
 * Responsable del Área de las listas ANA-REG-060 (y sugerido en el REH-REG-003
 * y la carta REH-REG-008): un responsable general por área del proceso, que es
 * el respaldo, y de forma opcional un responsable propio por unidad. El
 * Supervisor / Auditor no se configura aquí: se asigna en Pendientes Fase 6.
 */
export const SupervisionSignatoriesPanel = () => {
  const [overview, setOverview] = useState<SupervisionSignatoriesOverview | null>(null);
  const [edits, setEdits] = useState<GeneralEdits>({});
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<SignatoryEditTarget | null>(null);
  // Intento de carga que fallo (null = ninguno); "Reintentar" lanza el siguiente.
  const [attempt, setAttempt] = useState(0);
  const [failedAttempt, setFailedAttempt] = useState<number | null>(null);
  const employeeOptions = useEmployeeOptions();

  useEffect(() => {
    let alive = true;
    getSignatoriesOverview()
      .then((loaded) => alive && setOverview(loaded))
      .catch((error) => {
        if (!alive) return;
        setFailedAttempt(attempt);
        notifyError(getApiErrorMessage(error, 'No se pudieron cargar los responsables por área.'));
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (!overview && failedAttempt === attempt) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--unilabor-neutral)]">
        No se pudieron cargar los responsables por área.
        <button type="button" onClick={() => setAttempt((value) => value + 1)} className={buttonClass}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!overview) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
        <Loader2 size={14} className="animate-spin" /> Cargando áreas…
      </p>
    );
  }

  const rows = overview.rows;
  const dirty = rows.some(
    (row) => responsibleOf(row, edits) !== row.area_responsible_employee_id || alternateOf(row, edits) !== row.alternate_employee_id,
  );

  const edit = (areaKey: string, field: 'responsible' | 'alternate', employeeId: string) =>
    setEdits((current) => ({ ...current, [areaKey]: { ...current[areaKey], [field]: employeeId ? Number(employeeId) : null } }));

  const handleSaveGeneral = async () => {
    setSaving(true);
    try {
      const result = await saveAreaSignatories(
        rows.map((row) => ({
          area_key: row.area_key,
          area_responsible_employee_id: responsibleOf(row, edits),
          alternate_employee_id: alternateOf(row, edits),
        })),
      );
      setOverview(result.overview);
      setEdits({});
      notifySuccess(result.message);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron guardar los responsables generales.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-brand-700)]">Responsable general por área (respaldo)</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--unilabor-ink)]">
              Firma como <strong>Responsable del Área</strong> en las listas de toda unidad que no tenga responsable propio. El <strong>suplente</strong> firma
              cuando el evaluado es el propio responsable general, porque nadie avala su propia supervisión. El <strong>Supervisor / Auditor</strong> se asigna
              a cada colaborador en su puesto, en <em>Pendientes Fase 6</em>.
            </p>
          </div>
          <button type="button" onClick={() => void handleSaveGeneral()} disabled={saving || !dirty} className={buttonClass}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
          </button>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase text-[var(--unilabor-neutral)]">
            <tr>
              <th className="px-3 py-2">Área</th>
              <th className="px-3 py-2">Puestos</th>
              <th className="px-3 py-2">Colaboradores</th>
              <th className="px-3 py-2">Fase 6 pendientes</th>
              <th className="w-[30%] px-3 py-2">Responsable general</th>
              <th className="w-[30%] px-3 py-2">Suplente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
            {rows.map((row) => {
              const responsibleId = responsibleOf(row, edits);
              const alternateId = alternateOf(row, edits);
              const warnings = generalWarnings(row);
              return (
                <tr key={row.area_key} className={`align-top ${row.phase6_pending > 0 && !responsibleId ? 'bg-amber-50/50' : ''}`}>
                  <td className="px-3 py-2 font-semibold text-[var(--unilabor-ink)]">{row.area_name}</td>
                  <td className="px-3 py-2 text-xs">{row.positions}</td>
                  <td className="px-3 py-2 text-xs">{row.employees}</td>
                  <td className="px-3 py-2 text-xs">
                    {row.phase6_pending > 0 ? <span className="font-bold text-[var(--color-brand-700)]">{row.phase6_pending}</span> : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <SearchableSelect
                      value={responsibleId ? String(responsibleId) : ''}
                      // El responsable y el suplente de un área son personas distintas.
                      options={employeeOptions.filter((option) => option.value !== String(alternateId))}
                      onChange={(value) => edit(row.area_key, 'responsible', value)}
                      placeholder="Elige al responsable"
                      emptyLabel="Sin responsable"
                      searchPlaceholder="Buscar colaborador..."
                      disabled={saving}
                    />
                    {warnings.map((warning) => (
                      <p key={warning.text} className={`mt-1 text-[11px] leading-4 ${WARNING_CLASS[warning.tone]}`}>
                        {warning.text}
                      </p>
                    ))}
                  </td>
                  <td className="px-3 py-2">
                    <SearchableSelect
                      value={alternateId ? String(alternateId) : ''}
                      options={employeeOptions.filter((option) => option.value !== String(responsibleId))}
                      onChange={(value) => edit(row.area_key, 'alternate', value)}
                      placeholder="Sin suplente"
                      emptyLabel="Sin suplente"
                      searchPlaceholder="Buscar colaborador..."
                      disabled={saving}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="space-y-4">
        <div className="max-w-3xl">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-brand-700)]">Responsables por unidad</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--unilabor-ink)]">
            Si en una unidad el responsable de un área es otra persona, elígela aquí: manda la unidad de la ficha del colaborador evaluado. Donde no
            elijas a nadie, la unidad hereda al responsable general. Las listas en borrador toman el cambio al guardar; las que ya están en firma o
            cerradas no cambian.
          </p>
          {overview.employees_without_unit > 0 ? (
            <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
              {overview.employees_without_unit} colaborador(es) activo(s) no tienen sucursal en su ficha: sus listas usan siempre al responsable general.
            </p>
          ) : null}
        </div>
        <div className="space-y-3">
          {overview.units.map((unit) => (
            <SignatoryUnitCard key={unit.unit_id} unit={unit} onEdit={(target, cell) => setEditing({ unit: target, cell })} />
          ))}
        </div>
      </section>

      <SignatoryEditDrawer
        target={editing}
        units={overview.units}
        generals={rows}
        employeeOptions={employeeOptions}
        onClose={() => setEditing(null)}
        onSaved={setOverview}
      />
    </div>
  );
};
