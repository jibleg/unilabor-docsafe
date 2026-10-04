import type { EvaluationTemplate, TrainingCourse } from '../types/models';

/**
 * Cursos del Programa de Induccion (INDUCCION-FASE-N e INDUCCION-FASE-N-PUESTO): sus
 * evaluaciones NO se asignan a mano, las abre el programa al inscribir en /rh/induction
 * (el backend tambien lo rechaza con 409).
 */
export const isInductionCourse = (course: TrainingCourse): boolean =>
  course.code.toUpperCase().startsWith('INDUCCION-FASE-');

/** Numero de fase de un curso de Induccion (null si no lo es). */
export const inductionPhaseOf = (course: TrainingCourse): number | null => {
  const match = /^INDUCCION-FASE-(\d+)/i.exec(course.code);
  return match ? Number(match[1]) : null;
};

/**
 * Titulo corto para la tarjeta: en Induccion la fase ya va en un chip, asi que se
 * muestra solo lo que distingue al curso ("... — Almacen" -> "Almacen";
 * "Fase 1 - Bienvenida ..." -> "Bienvenida ...").
 */
export const courseDisplayTitle = (course: TrainingCourse): string => {
  if (!isInductionCourse(course)) {
    return course.title;
  }
  const dashIndex = course.title.lastIndexOf(' — ');
  if (dashIndex >= 0) {
    return course.title.slice(dashIndex + 3).trim() || course.title;
  }
  return course.title.replace(/^Fase\s+\d+\s*-\s*/i, '').trim() || course.title;
};

/** Vigencia compacta de la constancia: "12 m" o "∞". */
export const validityShortLabel = (months: number): string => (months === 0 ? '∞' : `${months} m`);

export const validityLongLabel = (months: number): string =>
  months === 0 ? 'Constancia sin vencimiento' : `Constancia vigente ${months} meses`;

/** Evaluaciones sin publicar del curso (las practicas nacen publicadas). */
export const draftTemplateCount = (course: TrainingCourse): number =>
  Math.max(0, (course.template_count ?? 0) - (course.published_template_count ?? 0));

export const isPracticalTemplate = (template: EvaluationTemplate): boolean =>
  template.evaluation_type === 'practical';

/** Fases del Programa de Induccion para el filtro secundario. */
export const INDUCTION_PHASES = [1, 2, 3, 4, 5, 6, 7] as const;
