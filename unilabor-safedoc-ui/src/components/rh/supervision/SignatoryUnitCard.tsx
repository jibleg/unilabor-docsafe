import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import type { SupervisionUnitAreaSignatory, SupervisionUnitSignatories } from '../../../types/models';
import { SignatoryToggle } from './SignatoryToggle';
import { SOURCE_BADGE, WARNING_CLASS, hasStaff, ownCoverage, unitAreaWarnings } from './signatory-ui';

interface SignatoryUnitCardProps {
  unit: SupervisionUnitSignatories;
  onEdit: (unit: SupervisionUnitSignatories, cell: SupervisionUnitAreaSignatory) => void;
}

/**
 * Una unidad (sucursal) con el Responsable del Área que firma hoy por cada
 * área del proceso: el propio de la unidad o, si no tiene, el heredado del
 * general. Por defecto solo lista las áreas con personal en la unidad.
 */
export const SignatoryUnitCard = ({ unit, onEdit }: SignatoryUnitCardProps) => {
  const [expanded, setExpanded] = useState(true);
  const [showEmpty, setShowEmpty] = useState(false);
  const coverage = ownCoverage(unit);
  const hiddenCount = unit.areas.filter((cell) => !hasStaff(cell)).length;
  const cells = showEmpty ? unit.areas : unit.areas.filter(hasStaff);

  return (
    <section className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center justify-between gap-3 bg-[rgba(238,245,250,0.9)] px-4 py-2.5 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {unit.unit_name}
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-[var(--unilabor-neutral)]">
          <span>{unit.employees} colaborador(es)</span>
          <span>{unit.phase6_pending} Fase 6 pendiente(s)</span>
          <span className={coverage.own > 0 ? 'text-emerald-700' : ''}>
            {coverage.own} de {coverage.total} áreas con responsable propio
          </span>
        </span>
      </button>

      {expanded ? (
        <div className="space-y-3 px-4 py-3">
          {cells.length === 0 ? (
            <p className="text-xs text-[var(--unilabor-neutral)]">Ningún colaborador de esta unidad tiene puestos con área del proceso asignada.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase text-[var(--unilabor-neutral)]">
                <tr>
                  <th className="px-3 py-2">Área</th>
                  <th className="px-3 py-2">Colaboradores</th>
                  <th className="px-3 py-2">Fase 6 pendientes</th>
                  <th className="w-[50%] px-3 py-2">Responsable del Área</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
                {cells.map((cell) => {
                  const badge = SOURCE_BADGE[cell.effective_source ?? 'NONE'];
                  const warnings = unitAreaWarnings(unit.unit_id, cell);
                  return (
                    <tr key={cell.area_key} className={!cell.effective && cell.phase6_pending > 0 ? 'bg-rose-50/40' : ''}>
                      <td className="px-3 py-2 font-semibold text-[var(--unilabor-ink)]">{cell.area_name}</td>
                      <td className="px-3 py-2 text-xs">{cell.employees}</td>
                      <td className="px-3 py-2 text-xs">
                        {cell.phase6_pending > 0 ? <span className="font-bold text-[var(--color-brand-700)]">{cell.phase6_pending}</span> : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <p className="flex flex-wrap items-center gap-2">
                          {cell.effective ? <span className="font-semibold text-[var(--unilabor-ink)]">{cell.effective.name}</span> : null}
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.className}`} title={badge.title}>
                            {badge.label}
                          </span>
                        </p>
                        {warnings.map((warning) => (
                          <p key={warning.text} className={`mt-0.5 text-[11px] leading-4 ${WARNING_CLASS[warning.tone]}`}>
                            {warning.text}
                          </p>
                        ))}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => onEdit(unit, cell)}
                          title={`Cambiar el responsable de ${cell.area_name} en ${unit.unit_name}`}
                          aria-label={`Cambiar el responsable de ${cell.area_name} en ${unit.unit_name}`}
                          className="rounded-lg p-1.5 text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.4)]"
                        >
                          <Pencil size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {hiddenCount > 0 ? (
            <SignatoryToggle checked={showEmpty} onChange={setShowEmpty} label="Mostrar áreas sin personal" hint={`${hiddenCount} área(s) sin colaboradores en esta unidad`} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
