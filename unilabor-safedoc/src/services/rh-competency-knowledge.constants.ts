/**
 * Prefijo del codigo del training_course "oculto" que sostiene el cuestionario
 * de Conocimiento (seccion 3 del REH-REG-003) de cada puesto. Se usa para que
 * la emision de constancias y otros ganchos de Capacitaciones sepan que NO es
 * una capacitacion: el resultado vive en la evaluacion de competencia.
 */
export const COMPETENCY_KNOWLEDGE_COURSE_PREFIX = 'COMPETENCIA-';

export const isCompetencyKnowledgeCourseCode = (code: string | null | undefined): boolean =>
  typeof code === 'string' && code.toUpperCase().startsWith(COMPETENCY_KNOWLEDGE_COURSE_PREFIX);
