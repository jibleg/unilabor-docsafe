import { z } from 'zod';

/**
 * Esquemas del Tablero de Induccion (Fases 1-4): consulta del roster por fase
 * y acciones de gestion por inscrito.
 */

const STAGES = [
  'EN_ESPERA_PUBLICACION',
  'EN_DESCANSO',
  'SIN_LECTURAS',
  'SIN_INICIAR',
  'LEYENDO',
  'LECTURA_VENCIDA',
  'LECTURA_COMPLETA',
  'EVALUACION_DISPONIBLE',
  'EVALUACION_EN_CURSO',
  'EVALUACION_TRUNCADA',
  'EN_CALIFICACION',
  'EVALUACION_VENCIDA',
  'NO_ACREDITADA',
  'APROBADA',
] as const;

const ALERTS = [
  'LECTURA_VENCIDA',
  'LECTURA_POR_VENCER',
  'EVALUACION_TRUNCADA',
  'EVALUACION_VENCIDA',
  'EVALUACION_POR_VENCER',
  'NO_ACREDITADA',
  'EN_CALIFICACION',
  'SIN_CUESTIONARIO',
  'AVANCE_PENDIENTE',
  'SIN_CONSTANCIA',
  'DATOS_CONSTANCIA',
] as const;

/** "a,b,c" o array -> array de valores validos (los desconocidos se descartan). */
const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((raw) => {
      const list = Array.isArray(raw) ? raw : (raw ?? '').split(',');
      const allowed = new Set<string>(values);
      const filtered = list.map((v) => v.trim()).filter((v) => allowed.has(v));
      return filtered.length > 0 ? (filtered as unknown as Array<T[number]>) : undefined;
    });

export const rosterQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  stage: csvEnum(STAGES),
  alert: csvEnum(ALERTS),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(5).max(200).default(30),
});

export type RosterQueryInput = z.infer<typeof rosterQuerySchema>;

const optionalNote = z
  .string()
  .trim()
  .max(500, 'La nota no puede exceder 500 caracteres')
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

/** Reabrir intento truncado (cronometro agotado / sin preguntas / iniciado sin enviar). */
export const resetTruncatedAttemptSchema = z.object({
  note: optionalNote,
});
export type ResetTruncatedAttemptInput = z.infer<typeof resetTruncatedAttemptSchema>;

/** Interruptor por fase "Avanzar automaticamente al aprobar". */
export const updatePhaseAutoAdvanceSchema = z.object({
  enabled: z.boolean({ error: 'Indica si el avance automatico queda encendido.' }),
});
export type UpdatePhaseAutoAdvanceInput = z.infer<typeof updatePhaseAutoAdvanceSchema>;

/** Reglas del cuestionario de la fase editables desde el tablero. */
export const updatePhaseEvaluationRulesSchema = z
  .object({
    window_hours: z.coerce.number().int().min(1, 'Minimo 1 hora').max(720, 'Maximo 720 horas').optional(),
    attempt_time_limit_minutes: z
      .union([z.coerce.number().int().min(1, 'Minimo 1 minuto').max(600, 'Maximo 600 minutos'), z.null()])
      .optional(),
    passing_score: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay reglas que actualizar.' });
export type UpdatePhaseEvaluationRulesInput = z.infer<typeof updatePhaseEvaluationRulesSchema>;

/** Periodo de descanso antes de iniciar la fase (horas); null/0 = no aplica. */
export const updatePhaseAdvanceGraceSchema = z.object({
  hours: z.union([z.coerce.number().int().min(0, 'Minimo 0').max(720, 'Maximo 720 horas (30 dias)'), z.null()]),
});
export type UpdatePhaseAdvanceGraceInput = z.infer<typeof updatePhaseAdvanceGraceSchema>;
