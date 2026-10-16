// -----------------------------------------------------------------------------
// Reglas puras de la Lista de verificacion de Supervision ANA-REG-060 — sin
// BD, testeables.
//
// ANA-PRC-005 §5.4: % cumplimiento = (respuestas "Si" / items evaluados) x 100,
// excluyendo los N/A. Bandas: >= 85 Conforme; 80-84 Conforme con
// observaciones; < 80 Requiere seguimiento.
// REH-MAN-002 §6.2.2.12 (Fase 6): minimo 80 % para aprobar la fase. Ambas
// escalas coinciden: aprobada = Conforme o Conforme con observaciones.
// -----------------------------------------------------------------------------

export type SupervisionResult = 'SI' | 'NO' | 'NA';
export type SupervisionConclusion = 'CONFORME' | 'CONFORME_CON_OBSERVACIONES' | 'REQUIERE_SEGUIMIENTO';

export const SUPERVISION_PASS_PCT = 80;
export const SUPERVISION_CONFORME_PCT = 85;

export const SUPERVISION_CONCLUSION_LABELS: Record<SupervisionConclusion, string> = {
  CONFORME: 'Conforme',
  CONFORME_CON_OBSERVACIONES: 'Conforme con observaciones',
  REQUIERE_SEGUIMIENTO: 'Requiere seguimiento',
};

export interface SupervisionSummary {
  /** Items con respuesta SI o NO (los N/A no cuentan). */
  evaluated: number;
  compliant: number;
  non_compliant: number;
  not_applicable: number;
  /** Items todavia sin respuesta (solo en borrador). */
  pending: number;
  /** Porcentaje con 2 decimales; null si no hay items evaluados. */
  compliance_pct: number | null;
  conclusion: SupervisionConclusion | null;
  /** Aprueba la Fase 6 (>= 80 %). null mientras no haya items evaluados. */
  passed: boolean | null;
}

export const conclusionFor = (pct: number): SupervisionConclusion => {
  if (pct >= SUPERVISION_CONFORME_PCT) return 'CONFORME';
  if (pct >= SUPERVISION_PASS_PCT) return 'CONFORME_CON_OBSERVACIONES';
  return 'REQUIERE_SEGUIMIENTO';
};

export const summarizeSupervisionResults = (results: Array<SupervisionResult | null>): SupervisionSummary => {
  let compliant = 0;
  let nonCompliant = 0;
  let notApplicable = 0;
  let pending = 0;
  for (const result of results) {
    if (result === 'SI') compliant += 1;
    else if (result === 'NO') nonCompliant += 1;
    else if (result === 'NA') notApplicable += 1;
    else pending += 1;
  }
  const evaluated = compliant + nonCompliant;
  if (evaluated === 0) {
    return { evaluated, compliant, non_compliant: nonCompliant, not_applicable: notApplicable, pending, compliance_pct: null, conclusion: null, passed: null };
  }
  const pct = Math.round((compliant / evaluated) * 10000) / 100;
  return {
    evaluated,
    compliant,
    non_compliant: nonCompliant,
    not_applicable: notApplicable,
    pending,
    compliance_pct: pct,
    conclusion: conclusionFor(pct),
    passed: pct >= SUPERVISION_PASS_PCT,
  };
};

/**
 * Calificacion 0-10 que se captura en la evaluacion practica de la Fase 6
 * (escala del motor existente, un decimal). Se trunca, no se redondea, para
 * que 79.6 % NO pase a 8.0 (que acreditaria contra el 80 % del manual).
 */
export const practicalScoreFromPct = (pct: number): number => Math.floor(pct) / 10;

/** Folio legible del registro: ANA-REG-060 + consecutivo de 5 digitos. */
export const supervisionFolio = (id: number): string => `ANA-REG-060-${String(id).padStart(5, '0')}`;
