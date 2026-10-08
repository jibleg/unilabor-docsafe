import pool from '../config/db';
import { getAnthropicConfig } from '../config/env';
import { withTransaction } from '../utils/transaction';
import { allocateSlots, CLOSED_TYPES, emptyCounts, type TypeCounts } from './question-bank/phase5-allocation';
import { generatePhase5DocumentQuestions, type Phase5DocumentSource } from './question-bank/phase5-generator';
import { missingCounts, shuffleOptions, type GeneratedQuestion } from './question-bank/phase5-questions';
import { writePhase5Quiz, type PlacedQuestion } from './question-bank/phase5-quiz-writer';

// -----------------------------------------------------------------------------
// "Regenerar preguntas propias del puesto" (Fase 5). Los puestos que comparten
// documentos comparten preguntas (el banco masivo genero una vez por
// documento); RH puede pedir para un puesto preguntas PROPIAS con los mismos
// criterios (40/10/50, 1+ por documento, baja/media, una sola idea), distintas
// de las que ya usan otros puestos. Corre en segundo plano (puestos grandes
// tardan minutos); el estado vive en rh_question_bank_batches. Las preguntas
// previas se desactivan (no se borran) y solo si la generacion completa se
// logro: si falla, el cuestionario queda intacto.
// -----------------------------------------------------------------------------

const CONCURRENCY = 3;
const STALE_RUNNING_HOURS = 2;

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  (error as any).publicMessage = publicMessage;
  throw error;
};

export interface PositionQuizRegeneration {
  batch_id: number;
  position_id: number;
  status: 'running' | 'completed' | 'failed';
  question_count: number;
  documents: number;
  error_message: string | null;
  created_at: string;
}

const mapBatch = (row: any): PositionQuizRegeneration => ({
  batch_id: Number(row.id),
  position_id: Number(row.position_id),
  status: String(row.status) as PositionQuizRegeneration['status'],
  question_count: Number(row.question_count ?? 0),
  documents: Array.isArray(row.document_ids) ? row.document_ids.length : 0,
  error_message: row.error_message ? String(row.error_message) : null,
  created_at: new Date(row.created_at).toISOString(),
});

interface PositionQuizContext {
  templateId: number;
  documents: Phase5DocumentSource[];
}

const loadContext = async (positionId: number): Promise<PositionQuizContext> => {
  const template = await pool.query(
    `SELECT t.id
       FROM public.rh_induction_phase_positions pp
       JOIN public.rh_induction_phases ph ON ph.id = pp.phase_id AND ph.phase_number = 5
       JOIN public.evaluation_templates t ON t.training_course_id = pp.training_course_id
                                         AND t.evaluation_type = 'quiz' AND t.is_active = TRUE
      WHERE pp.position_id = $1
      ORDER BY (t.status = 'published') DESC, t.created_at DESC
      LIMIT 1;`,
    [positionId],
  );
  if (template.rows.length === 0) {
    return throwCoded(
      'RH_POSITION_QUIZ_NOT_FOUND',
      'El puesto no esta habilitado en la Fase 5 o no tiene cuestionario; habilitalo primero en Fases de induccion.',
    );
  }
  const docs = await pool.query(
    `SELECT d.id, d.title, d.file_path
       FROM public.rh_position_documents pd
       JOIN public.documents d ON d.id = pd.document_id
      WHERE pd.position_id = $1 AND d.status = 'active'
      ORDER BY pd.sort_order, pd.id;`,
    [positionId],
  );
  if (docs.rows.length === 0) {
    return throwCoded('RH_POSITION_WITHOUT_DOCUMENTS', 'El puesto no tiene documentos vigentes para generar preguntas.');
  }
  return {
    templateId: Number(template.rows[0].id),
    documents: docs.rows.map((row) => ({ documentId: String(row.id), title: String(row.title), filePath: String(row.file_path) })),
  };
};

/** Ultima regeneracion (o generacion) del banco del puesto. */
export const getPositionQuizRegeneration = async (positionId: number): Promise<PositionQuizRegeneration | null> => {
  const result = await pool.query(
    `SELECT id, position_id, status, question_count, document_ids, error_message, created_at
       FROM public.rh_question_bank_batches WHERE position_id = $1 ORDER BY created_at DESC LIMIT 1;`,
    [positionId],
  );
  return result.rows.length > 0 ? mapBatch(result.rows[0]) : null;
};

/** Preguntas vigentes de cualquier cuestionario de Fase 5 sobre esos documentos: las nuevas deben ser distintas. */
const loadQuestionsToAvoid = async (documentIds: string[]): Promise<Map<string, string[]>> => {
  const result = await pool.query(
    `SELECT q.source_document_id, q.text
       FROM public.evaluation_questions q
       JOIN public.evaluation_templates t ON t.id = q.template_id AND t.evaluation_type = 'quiz'
       JOIN public.rh_induction_phase_positions pp ON pp.training_course_id = t.training_course_id
       JOIN public.rh_induction_phases ph ON ph.id = pp.phase_id AND ph.phase_number = 5
      WHERE q.is_active = TRUE AND q.source_document_id = ANY($1::uuid[]);`,
    [documentIds],
  );
  const avoid = new Map<string, string[]>();
  for (const row of result.rows) {
    const key = String(row.source_document_id);
    avoid.set(key, [...(avoid.get(key) ?? []), String(row.text)]);
  }
  return avoid;
};

const runRegeneration = async (batchId: number, positionId: number, context: PositionQuizContext): Promise<void> => {
  try {
    const slots = allocateSlots(context.documents.map((doc) => doc.documentId));
    const needs = new Map<string, TypeCounts>();
    for (const slot of slots) {
      const counts = needs.get(slot.documentId) ?? emptyCounts();
      counts[slot.type] += 1;
      needs.set(slot.documentId, counts);
    }
    const avoid = await loadQuestionsToAvoid(context.documents.map((doc) => doc.documentId));
    const generated = new Map<string, GeneratedQuestion[]>();
    const short: string[] = [];
    const queue = [...context.documents];
    const worker = async () => {
      for (let doc = queue.shift(); doc; doc = queue.shift()) {
        const needed = needs.get(doc.documentId) ?? emptyCounts();
        const questions = await generatePhase5DocumentQuestions(doc, needed, [], avoid.get(doc.documentId) ?? []);
        generated.set(doc.documentId, questions);
        if (CLOSED_TYPES.some((type) => missingCounts(questions, needed)[type] > 0)) short.push(doc.title);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (short.length > 0) {
      throw new Error(`No se completaron preguntas de ${short.length} documento(s): ${short.slice(0, 5).join('; ')}`);
    }

    const used = new Map<string, number>();
    const placed: PlacedQuestion[] = slots.map((slot) => {
      const key = `${slot.documentId}:${slot.type}`;
      const index = used.get(key) ?? 0;
      used.set(key, index + 1);
      const question = (generated.get(slot.documentId) ?? []).filter((item) => item.type === slot.type)[index]!;
      return { ...shuffleOptions(question), documentId: slot.documentId };
    });

    await withTransaction(async (client) => {
      await writePhase5Quiz(client, { templateId: context.templateId, positionId, batchId, questions: placed });
      await client.query(`UPDATE public.rh_question_bank_batches SET status = 'completed', question_count = $2 WHERE id = $1;`, [
        batchId,
        placed.length,
      ]);
    });
    console.info(`Banco F5: preguntas propias del puesto ${positionId} regeneradas (${placed.length}, lote ${batchId}).`);
  } catch (error: any) {
    console.error(`Banco F5: fallo la regeneracion del puesto ${positionId} (lote ${batchId}):`, error);
    await pool
      .query(`UPDATE public.rh_question_bank_batches SET status = 'failed', error_message = $2 WHERE id = $1;`, [
        batchId,
        String(error?.message ?? error).slice(0, 1000),
      ])
      .catch(() => undefined);
  }
};

/**
 * Arranca la regeneracion en segundo plano y devuelve su lote (status
 * 'running'). Rechaza si ya hay una en curso para el puesto.
 */
export const startPositionQuizRegeneration = async (
  positionId: number,
  actorUserId: string,
): Promise<PositionQuizRegeneration> => {
  const config = getAnthropicConfig();
  if (!config) {
    return throwCoded('QUESTION_BANK_NOT_CONFIGURED', 'La generacion con IA no esta configurada (falta ANTHROPIC_API_KEY en el servidor).');
  }
  const context = await loadContext(positionId);
  const running = await pool.query(
    `SELECT 1 FROM public.rh_question_bank_batches
      WHERE position_id = $1 AND status = 'running' AND created_at > NOW() - make_interval(hours => $2::int) LIMIT 1;`,
    [positionId, STALE_RUNNING_HOURS],
  );
  if (running.rows.length > 0) {
    return throwCoded('RH_POSITION_QUIZ_REGENERATION_RUNNING', 'Ya hay una generacion de preguntas en curso para este puesto.');
  }
  const batch = await pool.query(
    `INSERT INTO public.rh_question_bank_batches (position_id, document_ids, requested_by_user_id, model, status)
     VALUES ($1, $2::uuid[], $3, $4, 'running')
     RETURNING id, position_id, status, question_count, document_ids, error_message, created_at;`,
    [positionId, context.documents.map((doc) => doc.documentId), actorUserId, config.model],
  );
  const record = mapBatch(batch.rows[0]);
  void runRegeneration(record.batch_id, positionId, context);
  return record;
};
