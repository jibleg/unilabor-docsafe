import fs from 'fs';
import { getAnthropicConfig } from '../../config/env';
import { resolveStoredDocumentPath } from '../document.service';
import { CLOSED_TYPES, emptyCounts, type TypeCounts } from './phase5-allocation';
import { buildPhase5Prompt, missingCounts, parsePhase5Response, type GeneratedQuestion } from './phase5-questions';

// -----------------------------------------------------------------------------
// Generador de preguntas de la Fase 5 (criterios RH 2026-10-06) con la API de
// Claude: una llamada por documento, varias rondas hasta cubrir lo pedido.
// Lo usan el script masivo (generate-phase5-question-banks) y la regeneracion
// de "preguntas propias del puesto".
// -----------------------------------------------------------------------------

const MAX_CHARS_PER_DOCUMENT = 40_000;
const MAX_PER_TYPE_PER_CALL = 15;
const MAX_ROUNDS = 3;

export interface Phase5DocumentSource {
  documentId: string;
  title: string;
  filePath: string;
}

export const extractDocumentText = async (filePath: string): Promise<string> => {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: fs.readFileSync(resolveStoredDocumentPath(filePath)) });
  try {
    return ((await parser.getText()).text || '').trim();
  } finally {
    await parser.destroy();
  }
};

/** Contenido del mensaje: texto plano, o el PDF completo (escaneos sin capa de texto, leidos por vision). */
type ModelInput = { prompt: string; pdfBase64?: string | undefined };

export const callPhase5Model = async ({ prompt, pdfBase64 }: ModelInput): Promise<string> => {
  const config = getAnthropicConfig();
  if (!config) {
    throw new Error('Falta ANTHROPIC_API_KEY');
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: config.apiKey,
    defaultHeaders: config.workspaceId ? { 'anthropic-workspace-id': config.workspaceId } : undefined,
  });
  const message = await client.messages
    .stream({
      model: config.model,
      max_tokens: 16_000,
      messages: [
        {
          role: 'user',
          content: pdfBase64
            ? [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
                { type: 'text', text: prompt },
              ]
            : prompt,
        },
      ],
    })
    .finalMessage();
  const block = message.content.find((item) => item.type === 'text');
  if (!block || block.type !== 'text') {
    throw new Error('El modelo no devolvio texto');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Respuesta truncada por longitud');
  }
  return block.text;
};

/**
 * Completa `existing` hasta cubrir `needed` por tipo, generando con el modelo
 * a partir del documento. `avoid` = textos que las nuevas no deben repetir.
 * Devuelve las preguntas acumuladas (puede quedarse corto si el modelo no
 * alcanza en MAX_ROUNDS; el llamador decide).
 */
export const generatePhase5DocumentQuestions = async (
  document: Phase5DocumentSource,
  needed: TypeCounts,
  existing: GeneratedQuestion[] = [],
  avoid: string[] = [],
  onRound?: (questions: GeneratedQuestion[]) => void,
): Promise<GeneratedQuestion[]> => {
  const questions = [...existing];
  let missing = missingCounts(questions, needed);
  if (CLOSED_TYPES.every((type) => missing[type] === 0)) {
    return questions;
  }
  const text = (await extractDocumentText(document.filePath)).slice(0, MAX_CHARS_PER_DOCUMENT);
  // Escaneo sin capa de texto: se manda el PDF para que el modelo lo lea por vision.
  const pdfBase64 =
    text.length < 200 ? fs.readFileSync(resolveStoredDocumentPath(document.filePath)).toString('base64') : undefined;
  const body = pdfBase64 ? '(El contenido del documento va adjunto como PDF.)' : text;
  const avoidKeys = new Set(avoid.map((item) => item.trim().toLowerCase()));

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    // Margen de 1 por tipo faltante: las que no pasan validacion se descartan.
    const request = emptyCounts();
    for (const type of CLOSED_TYPES) {
      request[type] = missing[type] > 0 ? Math.min(MAX_PER_TYPE_PER_CALL, missing[type] + 1) : 0;
    }
    try {
      const prompt = buildPhase5Prompt(document.title, body, request, [...avoid, ...questions.map((q) => q.text)]);
      const generated = parsePhase5Response(await callPhase5Model({ prompt, pdfBase64 }));
      const known = new Set([...avoidKeys, ...questions.map((q) => q.text.trim().toLowerCase())]);
      questions.push(...generated.filter((question) => !known.has(question.text.trim().toLowerCase())));
      onRound?.(questions);
    } catch (error: any) {
      console.warn(`Banco F5: ${document.title.slice(0, 40)} ronda ${round} fallo -> ${error?.message ?? error}`);
    }
    missing = missingCounts(questions, needed);
    if (CLOSED_TYPES.every((type) => missing[type] === 0)) {
      break;
    }
  }
  return questions;
};
