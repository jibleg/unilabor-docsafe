/**
 * Banco de preguntas de la Fase 5 de Induccion (cuestionario por puesto),
 * generado con la API de Claude segun los criterios de RH (2026-10-06):
 *   - solo cerradas: 40 % V/F, 10 % opcion multiple, 50 % opcion unica;
 *   - < 20 documentos vigentes: 20 preguntas (al menos 1 por documento);
 *     >= 20: una pregunta por documento;
 *   - complejidad baja/media; preguntas claras, de una sola idea;
 *   - entrega "todo el banco" (selection_mode = 'all'), 2 min por pregunta, publicado;
 *   - un cuestionario que ya tiene preguntas NO se toca.
 *
 * Tres pasos (idempotentes; la generacion se cachea por documento en disco):
 *   node dist/scripts/generate-phase5-question-banks.js plan
 *   node dist/scripts/generate-phase5-question-banks.js generate [--concurrency 4]
 *   node dist/scripts/generate-phase5-question-banks.js load [--dry-run]
 * Opciones: --cache <dir> (default ./phase5-question-bank-cache), --only CODE,CODE
 */
import fs from 'fs';
import path from 'path';
import type { PoolClient } from 'pg';
import pool from '../config/db';
import { getAnthropicConfig } from '../config/env';
import {
  CLOSED_TYPES,
  MINUTES_PER_QUESTION,
  allocateSlots,
  documentNeeds,
  emptyCounts,
  type DocumentSlot,
  type TypeCounts,
} from '../services/question-bank/phase5-allocation';
import { generatePhase5DocumentQuestions } from '../services/question-bank/phase5-generator';
import { writePhase5Quiz } from '../services/question-bank/phase5-quiz-writer';
import { missingCounts, shuffleOptions, type GeneratedQuestion } from '../services/question-bank/phase5-questions';


interface Args {
  command: 'plan' | 'generate' | 'load';
  dryRun: boolean;
  cacheDir: string;
  only: string[] | null;
  concurrency: number;
}

interface CourseDocument {
  documentId: string;
  code: string | null;
  title: string;
  filePath: string;
}

interface CoursePlan {
  positionId: number;
  positionCode: string;
  positionName: string;
  templateId: number;
  activeQuestions: number;
  documents: CourseDocument[];
  slots: DocumentSlot[];
}

interface CacheEntry {
  document_id: string;
  title: string;
  model: string;
  generated_at: string;
  questions: GeneratedQuestion[];
}

const parseArgs = (): Args => {
  const args = process.argv.slice(2);
  const value = (flag: string): string | null => {
    const index = args.indexOf(flag);
    return index >= 0 ? (args[index + 1] ?? null) : null;
  };
  const command = args[0];
  if (command !== 'plan' && command !== 'generate' && command !== 'load') {
    throw new Error('Uso: generate-phase5-question-banks.js plan|generate|load [--dry-run] [--cache DIR] [--only A,B]');
  }
  return {
    command,
    dryRun: args.includes('--dry-run'),
    cacheDir: path.resolve(value('--cache') ?? './phase5-question-bank-cache'),
    only: value('--only') ? value('--only')!.split(',').map((code) => code.trim().toUpperCase()) : null,
    concurrency: Math.max(1, Number.parseInt(value('--concurrency') ?? '4', 10) || 4),
  };
};

// --- Plan ----------------------------------------------------------------------

const loadPlan = async (only: string[] | null): Promise<CoursePlan[]> => {
  const courses = await pool.query(
    `SELECT rp.id AS position_id, rp.code, rp.name, t.id AS template_id,
            (SELECT COUNT(*)::int FROM public.evaluation_questions q WHERE q.template_id = t.id AND q.is_active) AS active_questions
       FROM public.rh_induction_phase_positions pp
       INNER JOIN public.rh_induction_phases ph ON ph.id = pp.phase_id AND ph.phase_number = 5
       INNER JOIN public.rh_positions rp ON rp.id = pp.position_id
       INNER JOIN public.evaluation_templates t
               ON t.training_course_id = pp.training_course_id AND t.evaluation_type = 'quiz' AND t.is_active
      ORDER BY rp.code;`,
  );
  const plans: CoursePlan[] = [];
  for (const row of courses.rows) {
    if (only && !only.includes(String(row.code).toUpperCase())) {
      continue;
    }
    const docs = await pool.query(
      `SELECT d.id, d.code, d.title, d.file_path
         FROM public.rh_position_documents pd
         INNER JOIN public.documents d ON d.id = pd.document_id
        WHERE pd.position_id = $1 AND d.status = 'active'
        ORDER BY pd.sort_order, pd.id;`,
      [row.position_id],
    );
    const documents: CourseDocument[] = docs.rows.map((doc) => ({
      documentId: String(doc.id),
      code: doc.code ? String(doc.code) : null,
      title: String(doc.title),
      filePath: String(doc.file_path),
    }));
    plans.push({
      positionId: Number(row.position_id),
      positionCode: String(row.code),
      positionName: String(row.name),
      templateId: Number(row.template_id),
      activeQuestions: Number(row.active_questions),
      documents,
      slots: allocateSlots(documents.map((doc) => doc.documentId)),
    });
  }
  return plans;
};

const pendingCourses = (plans: CoursePlan[]): CoursePlan[] =>
  plans.filter((plan) => plan.activeQuestions === 0 && plan.documents.length > 0);

const summarizeTypes = (slots: DocumentSlot[]): TypeCounts => {
  const counts = emptyCounts();
  for (const slot of slots) counts[slot.type] += 1;
  return counts;
};

const printPlan = (plans: CoursePlan[]): void => {
  let total = 0;
  for (const plan of plans) {
    if (plan.activeQuestions > 0) {
      console.log(`${plan.positionCode.padEnd(5)} OMITIDO: ya tiene ${plan.activeQuestions} preguntas`);
      continue;
    }
    if (plan.documents.length === 0) {
      console.log(`${plan.positionCode.padEnd(5)} OMITIDO: sin documentos vigentes`);
      continue;
    }
    const types = summarizeTypes(plan.slots);
    total += plan.slots.length;
    console.log(
      `${plan.positionCode.padEnd(5)} docs=${String(plan.documents.length).padStart(3)} preguntas=${String(plan.slots.length).padStart(3)} ` +
        `V/F=${types.boolean} mult=${types.multiple} unica=${types.single} tiempo=${plan.slots.length * MINUTES_PER_QUESTION} min (tpl ${plan.templateId})`,
    );
  }
  const needs = documentNeeds(pendingCourses(plans).map((plan) => plan.slots));
  console.log(`\nTotal preguntas a cargar: ${total}; documentos unicos a generar: ${needs.size}`);
};

// --- Generacion ------------------------------------------------------------------

const cachePath = (cacheDir: string, documentId: string): string => path.join(cacheDir, `${documentId}.json`);

const readCache = (cacheDir: string, documentId: string): CacheEntry | null => {
  const file = cachePath(cacheDir, documentId);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as CacheEntry) : null;
};

const generateForDocument = async (
  document: CourseDocument,
  needed: TypeCounts,
  cacheDir: string,
): Promise<{ ok: boolean; detail: string }> => {
  const cached = readCache(cacheDir, document.documentId);
  const entry: CacheEntry = cached ?? {
    document_id: document.documentId,
    title: document.title,
    model: getAnthropicConfig()?.model ?? 'desconocido',
    generated_at: new Date().toISOString(),
    questions: [],
  };
  if (CLOSED_TYPES.every((type) => missingCounts(entry.questions, needed)[type] === 0)) {
    return { ok: true, detail: 'cache' };
  }
  const save = (questions: GeneratedQuestion[]) => {
    entry.questions = questions;
    entry.generated_at = new Date().toISOString();
    fs.writeFileSync(cachePath(cacheDir, document.documentId), JSON.stringify(entry, null, 2));
  };
  const questions = await generatePhase5DocumentQuestions(document, needed, entry.questions, [], save);
  const missing = missingCounts(questions, needed);
  if (CLOSED_TYPES.every((type) => missing[type] === 0)) {
    return { ok: true, detail: `${questions.length} preguntas` };
  }
  return { ok: false, detail: `faltan V/F=${missing.boolean} mult=${missing.multiple} unica=${missing.single}` };
};

const runGenerate = async (plans: CoursePlan[], args: Args): Promise<void> => {
  fs.mkdirSync(args.cacheDir, { recursive: true });
  const pending = pendingCourses(plans);
  const needs = documentNeeds(pending.map((plan) => plan.slots));
  const documents = new Map<string, CourseDocument>();
  for (const plan of pending) for (const doc of plan.documents) documents.set(doc.documentId, doc);

  const queue = [...needs.entries()];
  const failures: string[] = [];
  let done = 0;
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [documentId, needed] = next;
      const document = documents.get(documentId)!;
      const result = await generateForDocument(document, needed, args.cacheDir).catch((error) => ({
        ok: false,
        detail: String(error?.message ?? error),
      }));
      done += 1;
      console.log(`[${done}/${needs.size}] ${result.ok ? 'OK ' : 'ERR'} ${document.code ?? ''} ${document.title.slice(0, 60)} — ${result.detail}`);
      if (!result.ok) failures.push(`${document.title}: ${result.detail}`);
    }
  };
  await Promise.all(Array.from({ length: args.concurrency }, worker));
  console.log(`\nGeneracion terminada: ${needs.size - failures.length}/${needs.size} documentos completos.`);
  failures.forEach((failure) => console.log(`  - ${failure}`));
};

// --- Carga -----------------------------------------------------------------------

/** Toma, por documento y tipo, las primeras preguntas del cache en el orden de los slots. */
const pickQuestions = (plan: CoursePlan, cacheDir: string): (GeneratedQuestion & { documentId: string })[] => {
  const used = new Map<string, number>();
  return plan.slots.map((slot) => {
    const entry = readCache(cacheDir, slot.documentId);
    const key = `${slot.documentId}:${slot.type}`;
    const index = used.get(key) ?? 0;
    const question = entry?.questions.filter((item) => item.type === slot.type)[index];
    if (!question) {
      throw new Error(`Falta pregunta ${slot.type} #${index + 1} del documento ${slot.documentId}`);
    }
    used.set(key, index + 1);
    return { ...shuffleOptions(question), documentId: slot.documentId };
  });
};

const loadCourse = async (client: PoolClient, plan: CoursePlan, cacheDir: string): Promise<number> => {
  const template = await client.query(
    `SELECT t.instructions,
            (SELECT COUNT(*)::int FROM public.evaluation_questions q WHERE q.template_id = t.id AND q.is_active) AS active_questions
       FROM public.evaluation_templates t WHERE t.id = $1 FOR UPDATE;`,
    [plan.templateId],
  );
  if (Number(template.rows[0].active_questions) > 0) {
    return 0; // Ya tiene preguntas: no se toca.
  }
  const questions = pickQuestions(plan, cacheDir);
  const model = getAnthropicConfig()?.model ?? 'claude';
  const batch = await client.query(
    `INSERT INTO public.rh_question_bank_batches (position_id, document_ids, model, status, question_count)
     VALUES ($1, $2::uuid[], $3, 'completed', $4) RETURNING id;`,
    [plan.positionId, [...new Set(questions.map((question) => question.documentId))], model, questions.length],
  );
  return writePhase5Quiz(client, {
    templateId: plan.templateId,
    positionId: plan.positionId,
    batchId: Number(batch.rows[0].id),
    questions,
  });
};

const runLoad = async (plans: CoursePlan[], args: Args): Promise<void> => {
  for (const plan of pendingCourses(plans)) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const loaded = await loadCourse(client, plan, args.cacheDir);
      await client.query(args.dryRun ? 'ROLLBACK' : 'COMMIT');
      console.log(`${plan.positionCode.padEnd(5)} ${args.dryRun ? '[dry-run] ' : ''}${loaded} preguntas cargadas y publicado (tpl ${plan.templateId})`);
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.log(`${plan.positionCode.padEnd(5)} ERROR (sin cambios): ${error?.message ?? error}`);
    } finally {
      client.release();
    }
  }
};

const main = async () => {
  const args = parseArgs();
  const plans = await loadPlan(args.only);
  if (args.command === 'plan') printPlan(plans);
  if (args.command === 'generate') await runGenerate(plans, args);
  if (args.command === 'load') await runLoad(plans, args);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
