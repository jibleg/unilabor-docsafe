import type {
  SupervisionChecklistSection,
  SupervisionConclusion,
  SupervisionPendingRow,
  SupervisionResult,
  SupervisionSigner,
  SupervisionSignerRole,
} from '../../../types/models';

/** Estilos y etiquetas compartidos de la Lista de verificacion ANA-REG-060. */

export const cardClass = 'rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]';
export const inputClass =
  'w-full rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-3 py-2 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)] disabled:opacity-60';
export const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]';
export const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)] disabled:cursor-not-allowed disabled:opacity-50';
export const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-700)] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60';

export const CONCLUSION_UI: Record<SupervisionConclusion, { label: string; className: string }> = {
  CONFORME: { label: 'Conforme', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CONFORME_CON_OBSERVACIONES: { label: 'Conforme con observaciones', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  REQUIERE_SEGUIMIENTO: { label: 'Requiere seguimiento', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const RESULT_UI: Record<SupervisionResult, { label: string; active: string; title: string }> = {
  SI: { label: 'SÍ', active: 'bg-emerald-600 text-white border-emerald-600', title: 'Cumple' },
  NO: { label: 'NO', active: 'bg-rose-600 text-white border-rose-600', title: 'No cumple' },
  NA: { label: 'N/A', active: 'bg-slate-500 text-white border-slate-500', title: 'No aplica' },
};

export const formatPct = (value: number | null | undefined): string => (value === null || value === undefined ? '—' : `${value.toFixed(2)} %`);

export const formatDateOnly = (value: string | null | undefined): string => {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

export const todayIsoDate = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

export const SIGNERS_TOTAL = 3;

export const SIGNER_ROLE_LABELS: Record<SupervisionSignerRole, string> = {
  SUPERVISOR: 'Supervisor / Auditor',
  AREA_RESPONSIBLE: 'Responsable del Área',
  EMPLOYEE: 'Colaborador evaluado',
};

/** "Supervisor / Auditor y Responsable del Área". */
export const describeSignerRoles = (roles: SupervisionSignerRole[]): string => {
  const labels = roles.map((role) => SIGNER_ROLE_LABELS[role]);
  return labels.length <= 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
};

/** Por qué un firmante aún no puede firmar en su Buzón (null = listo). Misma regla que valida el backend al enviar. */
export const signerIssue = (signer: SupervisionSigner): string | null => {
  if (!signer.employee_id) return 'Sin asignar';
  if (!signer.is_active) return 'Dado de baja';
  if (!signer.has_user) return 'Sin usuario vinculado';
  return null;
};

/**
 * Firmantes que RH puede asignar desde el modal "Enviar a firma".
 *   * Supervisor: cuando falta o no puede firmar (sin asignar, de baja, sin usuario).
 *   * Responsable del área: igual en una supervisión de área; en la Fase 6 solo cuando
 *     Firmantes por área no resuelve a nadie (si resuelve a alguien, esa configuración manda).
 * El colaborador evaluado nunca se elige.
 */
export const assignableSignerRoles = (signers: SupervisionSigner[], linked: boolean): Array<'SUPERVISOR' | 'AREA_RESPONSIBLE'> => {
  const roles: Array<'SUPERVISOR' | 'AREA_RESPONSIBLE'> = [];
  for (const signer of signers) {
    if (signer.role === 'SUPERVISOR' && signerIssue(signer) !== null) roles.push('SUPERVISOR');
    if (signer.role === 'AREA_RESPONSIBLE' && (linked ? !signer.employee_id : signerIssue(signer) !== null)) roles.push('AREA_RESPONSIBLE');
  }
  return roles;
};

export const formatDateTime = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/**
 * Captura rapida: lo que el supervisor aun no califica queda en SI (o en N/A si
 * el aspecto no aplica al puesto). Nunca pisa lo ya calificado: asi puede
 * marcar primero los incumplimientos y completar el resto de un clic, o al
 * reves. Devuelve los resultados a aplicar por aspecto.
 */
export const quickFillPending = (
  sections: SupervisionChecklistSection[],
  current: Record<number, { result: SupervisionResult | null }>,
): Record<number, SupervisionResult> => {
  const fill: Record<number, SupervisionResult> = {};
  for (const section of sections) {
    for (const item of section.items) {
      if (current[item.item_id]?.result) continue;
      fill[item.item_id] = item.position_na ? 'NA' : 'SI';
    }
  }
  return fill;
};

/** Estado de una inscripcion en la bandeja de la Fase 6 (lo que muestra la columna Estado). */
export type PendingRowState = 'IN_SIGNATURE' | 'DRAFT' | 'NO_LIST' | 'INTERMEDIATE' | 'FAILED' | 'PASSED';

/** Orden en que se ofrecen en el filtro: de lo mas cercano a cerrarse a lo ya acreditado. */
export const PENDING_ROW_STATES: PendingRowState[] = ['IN_SIGNATURE', 'DRAFT', 'NO_LIST', 'INTERMEDIATE', 'FAILED', 'PASSED'];

export const PENDING_STATE_UI: Record<PendingRowState, { label: string; chip: string; active: string; title: string }> = {
  IN_SIGNATURE: {
    label: 'En firma',
    chip: 'border-sky-200 bg-sky-50 text-sky-700',
    active: 'border-sky-600 bg-sky-600 text-white',
    title: 'Lista enviada al Buzón de firmas: faltan firmas para cerrarla',
  },
  DRAFT: {
    label: 'Borrador abierto',
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
    active: 'border-amber-500 bg-amber-500 text-white',
    title: 'Lista en captura: el supervisor aún no la envía a firma',
  },
  NO_LIST: {
    label: 'Sin lista',
    chip: 'border-slate-200 bg-slate-50 text-slate-600',
    active: 'border-slate-600 bg-slate-600 text-white',
    title: 'Aún no se abre la lista ANA-REG-060 de esta inscripción',
  },
  INTERMEDIATE: {
    label: 'Intermedia',
    chip: 'border-violet-200 bg-violet-50 text-violet-700',
    active: 'border-violet-600 bg-violet-600 text-white',
    title: 'Solo tiene supervisiones intermedias cerradas; falta la lista final',
  },
  FAILED: {
    label: 'No acreditó',
    chip: 'border-rose-200 bg-rose-50 text-rose-700',
    active: 'border-rose-600 bg-rose-600 text-white',
    title: 'La lista final quedó por debajo de 80 %: requiere nueva supervisión',
  },
  PASSED: {
    label: 'Acreditada',
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    active: 'border-emerald-600 bg-emerald-600 text-white',
    title: 'Fase 6 acreditada en este puesto',
  },
};

/** La lista en curso manda sobre el resultado previo: una acreditada con borrador abierto se ve como borrador. */
export const pendingRowState = (
  row: Pick<SupervisionPendingRow, 'draft_status' | 'draft_checklist_id' | 'evaluation_status' | 'closed_count'>,
): PendingRowState => {
  if (row.draft_status === 'PENDING_SIGNATURES') return 'IN_SIGNATURE';
  if (row.draft_checklist_id) return 'DRAFT';
  if (row.evaluation_status === 'passed') return 'PASSED';
  if (row.evaluation_status === 'failed') return 'FAILED';
  return row.closed_count > 0 ? 'INTERMEDIATE' : 'NO_LIST';
};

/** Cuantas inscripciones hay en cada estado (solo los que aparecen). */
export const countPendingStates = (
  rows: Array<Pick<SupervisionPendingRow, 'draft_status' | 'draft_checklist_id' | 'evaluation_status' | 'closed_count'>>,
): Partial<Record<PendingRowState, number>> => {
  const counts: Partial<Record<PendingRowState, number>> = {};
  for (const row of rows) {
    const state = pendingRowState(row);
    counts[state] = (counts[state] ?? 0) + 1;
  }
  return counts;
};
