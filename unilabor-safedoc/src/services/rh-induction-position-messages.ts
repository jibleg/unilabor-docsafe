// -----------------------------------------------------------------------------
// Textos de los SMS al colaborador en la ruta por puesto (Fases 5-7), puros y
// testeables. Un SMS por puesto al iniciarlo (decision RH 2026-10-07):
//   F5: sus lecturas del puesto (solo las pendientes) o, si ya las tenia
//       firmadas por otro puesto, que ya puede presentar la evaluacion;
//   F6: inicia la practica supervisada del puesto;
//   F7: se abrio su evaluacion de competencia (REH-REG-003) del puesto.
// Limite 160 caracteres: si el nombre del puesto no cabe se usa su codigo.
// -----------------------------------------------------------------------------

export const SMS_MAX_LENGTH = 160;

export interface PositionStepContext {
  phaseNumber: number;
  positionName: string;
  positionCode: string;
  /** Lugar del puesto en la ruta (1..total, sin contar puestos dados de baja). */
  ordinal: number;
  total: number;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "10 oct 2026, 13:04" en hora de Ciudad de Mexico (formato corto para el SMS). */
export const formatShortDeadline = (iso: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${Number(get('day'))} ${MONTHS[Number(get('month')) - 1]} ${get('year')}, ${get('hour')}:${get('minute')}`;
};

/** "Fase 5, puesto 2 de 3 (Almacen)"; con un solo puesto, "Fase 5 (Almacen)". */
const stepLabel = (ctx: PositionStepContext, useCode: boolean): string => {
  const name = useCode ? ctx.positionCode : ctx.positionName;
  return ctx.total > 1 ? `Fase ${ctx.phaseNumber}, puesto ${ctx.ordinal} de ${ctx.total} (${name})` : `Fase ${ctx.phaseNumber} (${name})`;
};

/** Arma el mensaje con el nombre del puesto y, si excede 160, con su codigo. */
const fit = (build: (label: string) => string, ctx: PositionStepContext): string => {
  const full = build(stepLabel(ctx, false));
  return full.length <= SMS_MAX_LENGTH ? full : build(stepLabel(ctx, true));
};

export const buildPositionReadingsSms = (
  ctx: PositionStepContext,
  pendingDocuments: number,
  readingDeadlineAt: string | null,
): { subject: string; body: string } => {
  if (pendingDocuments === 0) {
    return {
      subject: `Induccion - ${stepLabel(ctx, false)}: evaluacion disponible`,
      body: fit((label) => `SafeDoc: ${label}: tus documentos ya estan firmados; presenta tu evaluacion en SafeDoc > Mis evaluaciones.`, ctx),
    };
  }
  const docs = pendingDocuments === 1 ? '1 documento' : `${pendingDocuments} documentos`;
  const deadline = readingDeadlineAt ? ` Vence el ${formatShortDeadline(readingDeadlineAt)}.` : '';
  return {
    subject: `Induccion - ${stepLabel(ctx, false)}: ${docs} por leer y firmar`,
    body: fit((label) => `SafeDoc: ${label}: tienes ${docs} por leer y firmar.${deadline} Entra a SafeDoc > Mis lecturas.`, ctx),
  };
};

export const buildPracticalStartedSms = (ctx: PositionStepContext): { subject: string; body: string } => ({
  subject: `Induccion - ${stepLabel(ctx, false)}: inicia practica supervisada`,
  body: fit((label) => `SafeDoc: ${label}: inicia tu practica supervisada. El responsable de tu area te evaluara en sitio.`, ctx),
});

export const buildCompetencyOpenedSms = (ctx: PositionStepContext): { subject: string; body: string } => ({
  subject: `Induccion - ${stepLabel(ctx, false)}: evaluacion de competencia abierta`,
  body: fit((label) => `SafeDoc: ${label}: se abrio tu evaluacion de competencia (REH-REG-003). Tu evaluador te indicara fecha y hora.`, ctx),
});
