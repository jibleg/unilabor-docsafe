import type { AreaResponsibleSource, SignatoryPerson, SupervisionAreaSignatory, SupervisionUnitAreaSignatory, SupervisionUnitSignatories } from '../../../types/models';

/** Etiquetas y advertencias de "Firmantes por área" (responsable general y responsables por unidad). */

export const SOURCE_BADGE: Record<AreaResponsibleSource | 'NONE', { label: string; title: string; className: string }> = {
  UNIT: {
    label: 'Propio de la unidad',
    title: 'Responsable configurado para esta unidad y área',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  GENERAL: {
    label: 'Heredado del general',
    title: 'La unidad no tiene responsable propio: firma el responsable general del área',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  ALTERNATE: {
    label: 'Suplente',
    title: 'Ni la unidad ni el general tienen un responsable vigente: firma el suplente general del área',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  NONE: {
    label: 'Sin responsable',
    title: 'Nadie vigente en la cadena unidad → general → suplente: sus listas no se podrán enviar a firma',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
  },
};

export type SignatoryWarningTone = 'danger' | 'warning' | 'info';

export interface SignatoryWarning {
  tone: SignatoryWarningTone;
  text: string;
}

export const WARNING_CLASS: Record<SignatoryWarningTone, string> = {
  danger: 'text-rose-700',
  warning: 'text-amber-700',
  info: 'text-[var(--unilabor-neutral)]',
};

const lists = (count: number): string => `${count} lista${count === 1 ? '' : 's'}`;

/** Por qué un colaborador configurado no puede firmar hoy (null = puede). */
const personIssue = (person: SignatoryPerson, role: string): SignatoryWarning | null => {
  if (!person.is_active) return { tone: 'danger', text: `${person.name} (${role}) está de baja: elige a otra persona.` };
  if (!person.has_user) {
    return { tone: 'danger', text: `${person.name} (${role}) no tiene usuario de sistema: no podrá firmar en su Buzón y el envío a firma se bloquea.` };
  }
  return null;
};

/** Advertencias del responsable general y del suplente de un área. */
export const generalWarnings = (row: SupervisionAreaSignatory): SignatoryWarning[] => {
  const warnings: SignatoryWarning[] = [];
  const responsibleIssue = row.responsible ? personIssue(row.responsible, 'responsable general') : null;
  const alternateIssue = row.alternate ? personIssue(row.alternate, 'suplente') : null;
  if (responsibleIssue) warnings.push(responsibleIssue);
  if (alternateIssue) warnings.push(alternateIssue);
  if (row.responsible && row.responsible_self_evaluations > 0) {
    const covered = row.alternate?.is_active === true;
    warnings.push({
      tone: covered ? 'info' : 'warning',
      text: covered
        ? `${row.responsible.name} es evaluado en ${lists(row.responsible_self_evaluations)} de esta área: ahí firma el suplente.`
        : `${row.responsible.name} es evaluado en ${lists(row.responsible_self_evaluations)} de esta área y nadie avala su propia supervisión: elige un suplente o un responsable propio en su unidad.`,
    });
  }
  return warnings;
};

/** Advertencias de una celda (unidad, área) de "Responsables por unidad". */
export const unitAreaWarnings = (unitId: number, cell: SupervisionUnitAreaSignatory): SignatoryWarning[] => {
  const warnings: SignatoryWarning[] = [];
  if (cell.own && !cell.own.is_active) {
    warnings.push({ tone: 'danger', text: `${cell.own.name} (propio de la unidad) está de baja: firma el siguiente de la cadena.` });
  }
  const effective = cell.effective;
  if (!effective) {
    if (cell.phase6_pending > 0 || cell.drafts > 0) {
      warnings.push({ tone: 'danger', text: 'Sus listas no se podrán enviar a firma hasta que tenga responsable.' });
    }
    return warnings;
  }
  if (!effective.has_user) {
    warnings.push({ tone: 'danger', text: 'Sin usuario de sistema: no podrá firmar en su Buzón y el envío a firma se bloquea.' });
  }
  if (cell.effective_self_evaluations > 0) {
    warnings.push({
      tone: 'warning',
      text: `Es evaluado en ${lists(cell.effective_self_evaluations)} de esta área: ahí firma el siguiente de la cadena (general o suplente).`,
    });
  }
  if (effective.unit_id !== unitId) {
    warnings.push({ tone: 'info', text: `Es de otra unidad (${effective.unit_name ?? 'sin sucursal en su ficha'}).` });
  }
  return warnings;
};

/** Un área se muestra en la unidad si tiene personal, carga de Fase 6 o un responsable propio que revisar. */
export const hasStaff = (cell: SupervisionUnitAreaSignatory): boolean =>
  cell.employees > 0 || cell.phase6_pending > 0 || cell.drafts > 0 || cell.in_signature > 0 || cell.own !== null;

/** "N de M áreas con responsable propio" (M = áreas con personal en la unidad). */
export const ownCoverage = (unit: SupervisionUnitSignatories): { own: number; total: number } => {
  const staffed = unit.areas.filter(hasStaff);
  return { own: staffed.filter((cell) => cell.own?.is_active).length, total: staffed.length };
};
