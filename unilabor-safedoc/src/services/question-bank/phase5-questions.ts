// -----------------------------------------------------------------------------
// Prompt y validacion de las preguntas del banco de la Fase 5 (puro).
// -----------------------------------------------------------------------------
import { randomInt } from 'crypto';
import { z } from 'zod';
import { CLOSED_TYPES, type ClosedQuestionType, type TypeCounts } from './phase5-allocation';

export interface GeneratedOption {
  text: string;
  is_correct: boolean;
}

export interface GeneratedQuestion {
  type: ClosedQuestionType;
  text: string;
  options: GeneratedOption[];
}

/**
 * Bloque opcional con preguntas que ya existen para el documento (otros
 * puestos o la version anterior del cuestionario): las nuevas deben ser
 * distintas para que cada puesto tenga sus propias preguntas.
 */
const avoidBlock = (avoid: string[]): string =>
  avoid.length === 0
    ? ''
    : `\nYa existen estas preguntas sobre el documento; las nuevas deben ser DISTINTAS (otra idea u otro aspecto del contenido), no reformulaciones de ellas:\n${avoid
        .slice(0, 40)
        .map((text) => `- ${text}`)
        .join('\n')}\n`;

export const buildPhase5Prompt = (title: string, text: string, counts: TypeCounts, avoid: string[] = []): string => `Eres un experto en evaluacion de personal de un laboratorio clinico certificado bajo ISO 15189:2022 (Unilabor). Vas a redactar preguntas para la evaluacion de la Fase 5 de Induccion (induccion tecnica al puesto), a partir UNICAMENTE del documento institucional que aparece abajo.

Genera exactamente:
- ${counts.boolean} preguntas de Verdadero/Falso ("boolean")
- ${counts.multiple} preguntas de opcion multiple ("multiple"): exactamente 4 opciones, 2 o 3 correctas
- ${counts.single} preguntas de opcion unica ("single"): exactamente 4 opciones, 1 sola correcta

Criterios obligatorios:
- Complejidad baja o media: que la responda quien leyo el documento con atencion; nada rebuscado ni de memoria de cifras irrelevantes.
- Preguntas y respuestas claras, directas y objetivas, de UNA sola idea cada una (sin dobles negaciones, sin "todas/ninguna de las anteriores", sin preguntas compuestas).
- Contenido relevante para el trabajo diario: responsabilidades, pasos, requisitos, criterios, registros, tiempos y condiciones que el documento establece.
- PROHIBIDO preguntar datos de control del documento: quien lo elaboro, reviso o autorizo, nombres de personas, codigo o version del documento, fechas de emision o de revision, ni frecuencia de revision del propio documento.
- Todo debe poder verificarse en el documento; no inventes informacion.
- Las opciones incorrectas deben ser plausibles pero claramente incorrectas segun el documento.
- No repitas la misma idea en dos preguntas.
- Verdadero/Falso: exactamente 2 opciones con texto "Verdadero" y "Falso"; mezcla afirmaciones verdaderas y falsas.
- Responde en espanol, sin mencionar "el documento dice" ni el nombre del archivo dentro de la pregunta.
${avoidBlock(avoid)}
Responde UNICAMENTE con un objeto JSON valido, sin texto antes ni despues y sin bloques de codigo, con esta forma exacta:
{"questions":[{"type":"boolean|multiple|single","text":"...","options":[{"text":"...","is_correct":true}]}]}

Documento: ${title}

${text}`;

const responseSchema = z.object({
  questions: z.array(
    z.object({
      type: z.enum(['boolean', 'multiple', 'single', 'open']),
      text: z.string().trim().min(10).max(500),
      options: z
        .array(z.object({ text: z.string().trim().min(1).max(300), is_correct: z.boolean() }))
        .default([]),
    }),
  ),
});

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/** Valida una pregunta segun su tipo; devuelve null si no cumple las reglas. */
export const sanitizeQuestion = (raw: { type: string; text: string; options: GeneratedOption[] }): GeneratedQuestion | null => {
  if (!CLOSED_TYPES.includes(raw.type as ClosedQuestionType)) {
    return null;
  }
  const type = raw.type as ClosedQuestionType;
  const options = raw.options.map((option) => ({ text: option.text.trim(), is_correct: option.is_correct }));
  if (new Set(options.map((option) => normalize(option.text))).size !== options.length) {
    return null;
  }
  const correct = options.filter((option) => option.is_correct).length;

  if (type === 'boolean') {
    const truth = options.find((option) => normalize(option.text) === 'verdadero');
    const falsehood = options.find((option) => normalize(option.text) === 'falso');
    if (options.length !== 2 || !truth || !falsehood || correct !== 1) {
      return null;
    }
    // Orden fijo: Verdadero, Falso.
    return {
      type,
      text: raw.text.trim(),
      options: [
        { text: 'Verdadero', is_correct: truth.is_correct },
        { text: 'Falso', is_correct: falsehood.is_correct },
      ],
    };
  }
  if (type === 'single' && (options.length < 3 || options.length > 5 || correct !== 1)) {
    return null;
  }
  if (type === 'multiple' && (options.length < 3 || options.length > 5 || correct < 2 || correct === options.length)) {
    return null;
  }
  return { type, text: raw.text.trim(), options };
};

/** Parsea la respuesta del modelo y descarta lo que no cumpla las reglas estructurales. */
export const parsePhase5Response = (rawText: string): GeneratedQuestion[] => {
  const stripped = rawText.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error(`Respuesta sin JSON (${rawText.length} chars)`);
  }
  const parsed = responseSchema.parse(JSON.parse(stripped.slice(start, end + 1)));
  const seen = new Set<string>();
  const result: GeneratedQuestion[] = [];
  for (const raw of parsed.questions) {
    const question = sanitizeQuestion(raw);
    if (!question || seen.has(normalize(question.text))) {
      continue;
    }
    seen.add(normalize(question.text));
    result.push(question);
  }
  return result;
};

/** Baraja las opciones de las preguntas de opcion unica/multiple (V/F conserva su orden). */
export const shuffleOptions = (question: GeneratedQuestion): GeneratedQuestion => {
  if (question.type === 'boolean') {
    return question;
  }
  const options = [...question.options];
  for (let index = options.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [options[index], options[swap]] = [options[swap]!, options[index]!];
  }
  return { ...question, options };
};

/** Cuantas preguntas de cada tipo faltan para cubrir `needed` con lo que ya hay. */
export const missingCounts = (available: GeneratedQuestion[], needed: TypeCounts): TypeCounts => {
  const missing = { boolean: 0, multiple: 0, single: 0 };
  for (const type of CLOSED_TYPES) {
    const have = available.filter((question) => question.type === type).length;
    missing[type] = Math.max(0, needed[type] - have);
  }
  return missing;
};
