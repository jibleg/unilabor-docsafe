import type { InductionAction, InductionAlert, InductionStage } from '../types/models';

/**
 * Metadatos de presentación del Tablero de Inducción (Fases 1-4): etapas,
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
  EN_CALIFICACION: { label: 'En calificación', short: 'Calificando', group: 'EVALUACION', className: 'bg-violet-100 text-violet-700' },
  EVALUACION_VENCIDA: { label: 'Evaluación vencida', short: 'Eval. vencida', group: 'EVALUACION', className: 'bg-slate-200 text-slate-700' },
  NO_ACREDITADA: { label: 'No acreditada', short: 'No acreditada', group: 'EVALUACION', className: 'bg-rose-100 text-rose-700' },
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
  'EN_CALIFICACION',
  'EVALUACION_VENCIDA',
  'NO_ACREDITADA',
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
  SIN_CUESTIONARIO: { label: 'Esperando cuestionario publicado', severity: 'warning' },
  AVANCE_PENDIENTE: { label: 'Aprobó y no ha avanzado', severity: 'warning' },
  SIN_CONSTANCIA: { label: 'Sin constancia emitida', severity: 'warning' },
  DATOS_CONSTANCIA: { label: 'Faltan datos para la constancia', severity: 'info' },
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
  RESEND_NOTICE: { label: 'Reenviar aviso SMS', tone: 'neutral' },
  RESET_ATTEMPT: { label: 'Reabrir intento truncado', tone: 'danger' },
  AUTHORIZE_RETRY: { label: 'Autorizar nuevo intento', tone: 'warning' },
  GRADE: { label: 'Calificar', tone: 'primary' },
  ADVANCE: { label: 'Avanzar a la siguiente fase', tone: 'success' },
  ISSUE_CERTIFICATE: { label: 'Emitir constancia', tone: 'success' },
  COMPLETE_DATA: { label: 'Completar datos de constancia', tone: 'neutral' },
  START_NOW: { label: 'Terminar descanso e iniciar lectura', tone: 'primary' },
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
