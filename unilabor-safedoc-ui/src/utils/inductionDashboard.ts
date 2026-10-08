import type {
  InductionAction,
  InductionAlert,
  InductionPositionEvaluationState,
  InductionStage,
  InductionTransitionBlockReason,
  InductionTransitionState,
  InductionTransitionTarget,
  InductionTransitionPositionStatus,
} from '../types/models';

/**
 * Metadatos de presentación del Tablero de Inducción (Fases 1-7): etapas,
 * alertas, acciones y grupos del embudo. Los colores de etapa se derivan de
 * cuatro grupos validados para daltonismo (violeta / azul marca / ámbar /
 * esmeralda) y siempre van acompañados de etiqueta y conteo.
 */

export type InductionStageGroup = 'ESPERA' | 'LECTURA' | 'EVALUACION' | 'APROBADA';

export const STAGE_GROUP_META: Record<InductionStageGroup, { label: string; color: string; soft: string; text: string }> = {
  ESPERA: { label: 'En espera', color: '#8b5cf6', soft: 'bg-violet-50', text: 'text-violet-700' },
  LECTURA: { label: 'Lectura', color: '#0069a6', soft: 'bg-sky-50', text: 'text-sky-800' },
  EVALUACION: { label: 'Evaluación', color: '#f59e0b', soft: 'bg-amber-50', text: 'text-amber-700' },
  APROBADA: { label: 'Aprobada', color: '#059669', soft: 'bg-emerald-50', text: 'text-emerald-700' },
};

export const STAGE_GROUP_ORDER: InductionStageGroup[] = ['ESPERA', 'LECTURA', 'EVALUACION', 'APROBADA'];

export const STAGE_META: Record<InductionStage, { label: string; short: string; group: InductionStageGroup; className: string }> = {
  EN_ESPERA_PUBLICACION: { label: 'En espera de publicación', short: 'Espera', group: 'ESPERA', className: 'bg-violet-100 text-violet-700' },
  EN_DESCANSO: { label: 'En periodo de descanso', short: 'Descanso', group: 'ESPERA', className: 'bg-violet-100 text-violet-700' },
  SIN_LECTURAS: { label: 'Sin lecturas asignadas', short: 'Sin lecturas', group: 'ESPERA', className: 'bg-violet-100 text-violet-700' },
  SIN_INICIAR: { label: 'Lectura sin iniciar', short: 'Sin iniciar', group: 'LECTURA', className: 'bg-sky-100 text-sky-800' },
  LEYENDO: { label: 'Leyendo documentos', short: 'Leyendo', group: 'LECTURA', className: 'bg-sky-100 text-sky-800' },
  LECTURA_VENCIDA: { label: 'Lectura vencida', short: 'Lectura vencida', group: 'LECTURA', className: 'bg-rose-100 text-rose-700' },
  LECTURA_COMPLETA: { label: 'Lectura completa, esperando cuestionario', short: 'Lectura completa', group: 'LECTURA', className: 'bg-sky-100 text-sky-800' },
  EVALUACION_DISPONIBLE: { label: 'Evaluación disponible', short: 'Eval. disponible', group: 'EVALUACION', className: 'bg-amber-100 text-amber-700' },
  EVALUACION_EN_CURSO: { label: 'Evaluación en curso', short: 'Eval. en curso', group: 'EVALUACION', className: 'bg-amber-100 text-amber-700' },
  EVALUACION_TRUNCADA: { label: 'Evaluación truncada', short: 'Truncada', group: 'EVALUACION', className: 'bg-rose-100 text-rose-700' },
  PRACTICA_PENDIENTE: { label: 'Práctica pendiente de captura', short: 'Práctica pendiente', group: 'EVALUACION', className: 'bg-amber-100 text-amber-700' },
  EN_CALIFICACION: { label: 'En calificación', short: 'Calificando', group: 'EVALUACION', className: 'bg-violet-100 text-violet-700' },
  EVALUACION_VENCIDA: { label: 'Evaluación vencida', short: 'Eval. vencida', group: 'EVALUACION', className: 'bg-slate-200 text-slate-700' },
  COMPETENCIA_EN_PROCESO: { label: 'Evaluación de competencia en proceso', short: 'Competencia en proceso', group: 'EVALUACION', className: 'bg-amber-100 text-amber-700' },
  COMPETENCIA_POR_AUTORIZAR: { label: 'Competente, pendiente de autorización', short: 'Por autorizar', group: 'EVALUACION', className: 'bg-violet-100 text-violet-700' },
  NO_ACREDITADA: { label: 'No acreditada', short: 'No acreditada', group: 'EVALUACION', className: 'bg-rose-100 text-rose-700' },
  SIGUIENTE_PUESTO: { label: 'Siguiente puesto en cola', short: 'Sig. puesto', group: 'ESPERA', className: 'bg-violet-100 text-violet-700' },
  APROBADA: { label: 'Fase aprobada', short: 'Aprobada', group: 'APROBADA', className: 'bg-emerald-100 text-emerald-700' },
};

export const STAGE_ORDER: InductionStage[] = [
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
  'PRACTICA_PENDIENTE',
  'EN_CALIFICACION',
  'EVALUACION_VENCIDA',
  'NO_ACREDITADA',
  'SIGUIENTE_PUESTO',
  'APROBADA',
];

export const ALERT_META: Record<InductionAlert, { label: string; severity: 'critical' | 'warning' | 'info' }> = {
  LECTURA_VENCIDA: { label: 'Lectura vencida', severity: 'critical' },
  LECTURA_POR_VENCER: { label: 'Lectura por vencer (24 h)', severity: 'warning' },
  EVALUACION_TRUNCADA: { label: 'Evaluación truncada', severity: 'critical' },
  EVALUACION_VENCIDA: { label: 'Evaluación vencida', severity: 'critical' },
  EVALUACION_POR_VENCER: { label: 'Evaluación por vencer (24 h)', severity: 'warning' },
  NO_ACREDITADA: { label: 'No acreditada', severity: 'critical' },
  EN_CALIFICACION: { label: 'Pendiente de calificar', severity: 'warning' },
  SIN_CUESTIONARIO: { label: 'Esperando evaluación publicada', severity: 'warning' },
  AVANCE_PENDIENTE: { label: 'Aprobó y no ha avanzado', severity: 'warning' },
  SIN_CONSTANCIA: { label: 'Sin constancia emitida', severity: 'warning' },
  DATOS_CONSTANCIA: { label: 'Faltan datos para la constancia', severity: 'info' },
  FIRMAS_PENDIENTES: { label: 'Aprobó con documentos sin firmar', severity: 'warning' },
};

export const ALERT_ORDER: InductionAlert[] = [
  'LECTURA_VENCIDA',
  'EVALUACION_TRUNCADA',
  'EVALUACION_VENCIDA',
  'NO_ACREDITADA',
  'EN_CALIFICACION',
  'SIN_CUESTIONARIO',
  'AVANCE_PENDIENTE',
  'LECTURA_POR_VENCER',
  'EVALUACION_POR_VENCER',
  'SIN_CONSTANCIA',
  'FIRMAS_PENDIENTES',
  'DATOS_CONSTANCIA',
];

export const ALERT_SEVERITY_CLASS: Record<'critical' | 'warning' | 'info', string> = {
  critical: 'border-rose-200 bg-rose-50 text-rose-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
};

export const ACTION_META: Record<InductionAction, { label: string; tone: 'primary' | 'warning' | 'danger' | 'neutral' | 'success' }> = {
  REOPEN_READING: { label: 'Reabrir lectura', tone: 'danger' },
  EXTEND_READING: { label: 'Ampliar lectura', tone: 'primary' },
  REOPEN_SIGNATURES: { label: 'Reabrir firmas pendientes', tone: 'warning' },
  RESEND_NOTICE: { label: 'Reenviar aviso SMS', tone: 'neutral' },
  RESET_ATTEMPT: { label: 'Reabrir intento truncado', tone: 'danger' },
  AUTHORIZE_RETRY: { label: 'Autorizar nuevo intento', tone: 'warning' },
  GRADE: { label: 'Calificar', tone: 'primary' },
  ADVANCE: { label: 'Avanzar a la siguiente fase', tone: 'success' },
  ISSUE_CERTIFICATE: { label: 'Emitir constancia', tone: 'success' },
  COMPLETE_DATA: { label: 'Completar datos de constancia', tone: 'neutral' },
  START_NOW: { label: 'Terminar descanso e iniciar lectura', tone: 'primary' },
  CAPTURE_PRACTICAL: { label: 'Capturar evaluación práctica', tone: 'primary' },
  UNENROLL: { label: 'Dar de baja de la fase', tone: 'danger' },
};

export const ORIGIN_META: Record<string, { label: string; className: string }> = {
  MANUAL: { label: 'Inscripción manual', className: 'bg-slate-100 text-slate-600' },
  BULK: { label: 'Inscripción masiva', className: 'bg-slate-100 text-slate-600' },
  AUTO_ADVANCE: { label: 'Avance automático', className: 'bg-emerald-50 text-emerald-700' },
  RECONCILE: { label: 'Sincronización', className: 'bg-emerald-50 text-emerald-700' },
  ADVANCE: { label: 'Avance manual', className: 'bg-emerald-50 text-emerald-700' },
};

export const formatDateTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const formatDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : '—';

export const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '0 min';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
};

export const formatHours = (hours: number | null): string => {
  if (hours === null) return '—';
  if (hours < 24) return `${Math.round(hours)} h`;
  const days = hours / 24;
  return `${days.toFixed(days >= 10 ? 0 : 1)} días`;
};

export const formatRelative = (iso: string | null): string => {
  if (!iso) return '—';
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  const label =
    minutes < 60 ? `${minutes} min` : minutes < 60 * 48 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes / 1440)} días`;
  return diffMs >= 0 ? `en ${label}` : `hace ${label}`;
};

export const percent = (value: number | null | undefined, digits = 0): string =>
  value === null || value === undefined ? '—' : `${value.toFixed(digits)} %`;

/** Acciones que se atienden con "Reabrir lectura" (individual o "Mandar a lectura" en lote). */
export const READING_REOPEN_ACTIONS: InductionAction[] = ['REOPEN_READING', 'EXTEND_READING', 'REOPEN_SIGNATURES'];

export const canReopenReading = (row: { actions: InductionAction[] }): boolean =>
  row.actions.some((action) => READING_REOPEN_ACTIONS.includes(action));

// --- Fases por puesto (5-7): bandeja de avance y preparación por puesto -------

export const TRANSITION_TARGETS: InductionTransitionTarget[] = [5, 6, 7];

export const TRANSITION_TARGET_META: Record<InductionTransitionTarget, { label: string; action: string; hint: string }> = {
  5: { label: 'Fase 4 → 5', action: 'Inscribir en Fase 5', hint: 'Aprobaron la Fase 4 y esperan su inducción técnica por puesto.' },
  6: { label: 'Fase 5 → 6', action: 'Inscribir en Fase 6', hint: 'Aprobaron la Fase 5 y esperan su práctica supervisada.' },
  7: { label: 'Fase 6 → 7', action: 'Abrir evaluación de competencia', hint: 'Aprobaron la Fase 6 y esperan su evaluación de competencia inicial (REH-REG-003).' },
};

export const TRANSITION_STATE_META: Record<InductionTransitionState, { label: string; className: string }> = {
  READY: { label: 'Listo', className: 'bg-emerald-100 text-emerald-700' },
  BLOCKED: { label: 'Bloqueado', className: 'bg-rose-100 text-rose-700' },
  STARTED: { label: 'En evaluación', className: 'bg-amber-100 text-amber-700' },
};

/** Motivo de bloqueo con la pantalla donde RH lo resuelve. */
export const TRANSITION_REASON_META: Record<InductionTransitionBlockReason, { label: string; fix: string; path: (positionId: number | null) => string }> = {
  SIN_USUARIO: { label: 'Sin usuario vinculado', fix: 'Vincular usuario en Expedientes', path: () => '/rh/expedients' },
  SIN_PUESTO: { label: 'Sin puesto activo', fix: 'Asignar puesto en Puestos', path: () => '/rh/positions' },
  FASE_EN_BORRADOR: { label: 'Fase en borrador', fix: 'Publicar la fase', path: () => '/rh/induction' },
  PUESTO_NO_HABILITADO: { label: 'Puesto no habilitado en la fase', fix: 'Habilitar el puesto en la fase', path: () => '/rh/induction' },
  PUESTO_SIN_DOCUMENTOS: { label: 'Puesto sin documentos', fix: 'Cargar documentos del puesto', path: (id) => (id ? `/rh/positions?position=${id}` : '/rh/positions') },
  EVALUACION_NO_LISTA: { label: 'Evaluación del puesto no lista', fix: 'Publicar la evaluación en Capacitaciones', path: () => '/rh/trainings' },
  PUESTO_SIN_COMPETENCIAS: { label: 'Puesto sin competencias', fix: 'Capturar competencias del puesto', path: (id) => (id ? `/rh/positions?position=${id}` : '/rh/positions') },
  PUESTOS_PENDIENTES: { label: 'Puestos por acreditar', fix: 'Esperar a que acredite todos sus puestos', path: () => '/rh/induction/dashboard' },
};

export const TRANSITION_REASON_ORDER: InductionTransitionBlockReason[] = [
  'EVALUACION_NO_LISTA',
  'PUESTO_SIN_DOCUMENTOS',
  'PUESTO_NO_HABILITADO',
  'FASE_EN_BORRADOR',
  'SIN_PUESTO',
  'SIN_USUARIO',
  'PUESTO_SIN_COMPETENCIAS',
  'PUESTOS_PENDIENTES',
];

export const EVALUATION_STATE_META: Record<InductionPositionEvaluationState, { label: string; className: string }> = {
  MISSING: { label: 'Sin crear', className: 'bg-slate-100 text-slate-600' },
  DRAFT: { label: 'Borrador', className: 'bg-amber-100 text-amber-700' },
  NO_QUESTIONS: { label: 'Sin preguntas', className: 'bg-rose-100 text-rose-700' },
  READY: { label: 'Publicada', className: 'bg-emerald-100 text-emerald-700' },
};

export const COMPETENCY_DICTAMEN_LABEL: Record<string, string> = {
  COMPETENTE_Y_AUTORIZADO: 'Competente y autorizado',
  COMPETENTE_CON_OBSERVACIONES: 'Competente con observaciones',
  COMPETENTE_BAJO_SUPERVISION: 'Competente bajo supervisión',
  NO_COMPETENTE: 'No competente',
};

/** Etapa del tablero para la evaluación de competencia inicial (Fase 7), espejo del backend. */
export const competencyStage = (competency: { status: 'DRAFT' | 'CLOSED'; dictamen: string | null; authorization_result: string | null }): InductionStage => {
  if (competency.status === 'DRAFT') return 'COMPETENCIA_EN_PROCESO';
  if (competency.dictamen === 'NO_COMPETENTE' || competency.authorization_result === 'NO_AUTORIZADO') return 'NO_ACREDITADA';
  if (competency.authorization_result === 'AUTORIZADO' || competency.authorization_result === 'AUTORIZADO_CON_SEGUIMIENTO') return 'APROBADA';
  return 'COMPETENCIA_POR_AUTORIZAR';
};

export const competencyLink = (evaluationId: number): string => `/rh/competency-evaluations?evaluation=${evaluationId}`;

export const todayIsoDate = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

/** Estado de cada puesto en la ruta por puesto (Fases 5-7): color y texto corto. */
export const POSITION_STATUS_META: Record<InductionTransitionPositionStatus, { label: string; className: string }> = {
  LISTO: { label: 'Listo', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  BLOQUEADO: { label: 'Bloqueado', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  APROBADO: { label: 'Acreditado', className: 'border-emerald-300 bg-emerald-100 text-emerald-800' },
  EN_CURSO: { label: 'En curso', className: 'border-sky-200 bg-sky-50 text-sky-800' },
  EN_COLA: { label: 'En cola', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  PENDIENTE: { label: 'Pendiente', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  EN_EVALUACION: { label: 'En evaluación', className: 'border-violet-200 bg-violet-50 text-violet-700' },
};
