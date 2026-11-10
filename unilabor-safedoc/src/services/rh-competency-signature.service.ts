import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { withTransaction } from '../utils/transaction';
import { archiveGeneratedPdfToExpedient } from './employee-document-archive.service';
import { buildCompetencyEvaluationPdf } from './rh-competency-evaluation.pdf';
import {
  DICTAMEN_LABELS,
  KNOWLEDGE_ANSWERED_STATUSES,
  computeResults,
  effectiveScore,
  getEvaluationById,
  loadDraft,
  type CompetencyEvaluationRecord,
  type CompetencyEvaluationResults,
  type CompetencySection,
} from './rh-competency-evaluation.service';
import { assertEvaluatorAllowed } from './rh-competency-evaluator.service';
import {
  documentSignerIssues,
  pendingDocumentRoles,
  type DocumentSignerAssignment,
  type DocumentSignerRole,
} from './rh-document-signature.rules';
import {
  loadActiveDocumentSignatures,
  loadDocumentSigners,
  lockSignedDocument,
  markSignatureRequested,
  type DocumentSignature,
} from './rh-document-signature.service';

// -----------------------------------------------------------------------------
// REH-REG-003 en el Buzon de firmas. RH envia la evaluacion a firma (queda
// bloqueada) y firman los cinco roles desde su sesion: colaborador, evaluador
// tecnico, coordinador del area, coordinador de RH y Director General. Con la
// quinta firma se cierra sola: sella resultados, genera el PDF oficial con las
// cinco firmas y lo archiva en el expediente. La autorizacion (RH / Direccion)
// sigue siendo un paso aparte, posterior al cierre.
// -----------------------------------------------------------------------------

const KIND = 'COMPETENCY_EVALUATION' as const;

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
};

/** Lo que debe estar completo antes de pedir firmas (lo mismo que exigia el cierre presencial). */
export const assertEvaluationReadyToSign = async (record: CompetencyEvaluationRecord): Promise<CompetencyEvaluationResults> => {
  const items = record.items ?? [];
  if (!record.evaluator_name.trim()) {
    throwCoded('RH_COMP_EVAL_EVALUATOR_REQUIRED', 'La evaluacion no tiene evaluador; asignalo antes de enviarla a firma.');
  }
  await assertEvaluatorAllowed({
    evaluationType: record.evaluation_type,
    employeeId: record.employee_id,
    positionId: record.position_id,
    evaluator: { employee_id: record.evaluator_employee_id, name: record.evaluator_name },
  });
  if (record.knowledge_quiz && !KNOWLEDGE_ANSWERED_STATUSES.includes(record.knowledge_quiz.status)) {
    throwCoded(
      'RH_COMP_EVAL_KNOWLEDGE_PENDING',
      'El colaborador aun no contesta el cuestionario de Conocimiento (o esta vencido). Espera la respuesta, o cancela el cuestionario y reasignalo.',
    );
  }
  const bySection = (section: CompetencySection) => items.filter((item) => item.section === section);
  if (bySection('COMPETENCIA').length === 0 || bySection('DESEMPENO').length === 0 || bySection('CONOCIMIENTO').length === 0) {
    throwCoded('RH_COMP_EVAL_INCOMPLETE', 'Las tres secciones deben tener al menos un item antes de enviar a firma.');
  }
  const unscored = items.filter((item) => effectiveScore(item) === null);
  if (unscored.length > 0) {
    throwCoded('RH_COMP_EVAL_UNSCORED_ITEMS', `Hay ${unscored.length} item(s) sin calificar; captura todas las calificaciones antes de enviar a firma.`);
  }
  const results = computeResults(items);
  if (results.final_pct === null || !results.dictamen) {
    return throwCoded('RH_COMP_EVAL_INCOMPLETE', 'No se pudieron calcular los resultados.');
  }
  if (results.dictamen !== 'COMPETENTE_Y_AUTORIZADO' && (record.actions ?? []).length === 0) {
    throwCoded('RH_COMP_EVAL_ACTIONS_REQUIRED', 'El dictamen no es "Competente y autorizado": captura el plan de acciones antes de enviar a firma.');
  }
  return results;
};

/**
 * La autorizacion NO se da por hecha con el dictamen: la evaluacion competente
 * queda PENDIENTE y la ejecuta RH o Direccion General despues (ahi nacen la
 * vigencia y la constancia). Solo "No competente" se resuelve como NO AUTORIZADO.
 */
const sealResults = (results: CompetencyEvaluationResults): CompetencyEvaluationResults => ({
  ...results,
  authorization_result: results.dictamen !== 'NO_COMPETENTE' ? 'PENDIENTE' : 'NO_AUTORIZADO',
});

// --- Envio a firma ---------------------------------------------------------------

export interface SendEvaluationToSignatureInput {
  evaluationId: number;
  areaEmployeeId: number;
  rhEmployeeId: number;
  directorEmployeeId: number;
  userId: string;
}

const assignmentOf = (record: CompetencyEvaluationRecord, input?: SendEvaluationToSignatureInput): DocumentSignerAssignment => ({
  EMPLOYEE: record.employee_id,
  EVALUATOR: record.evaluator_employee_id,
  AREA: input ? input.areaEmployeeId : record.area_signatory_employee_id,
  RH: input ? input.rhEmployeeId : record.rh_signatory_employee_id,
  DIRECTOR: input ? input.directorEmployeeId : record.director_signatory_employee_id,
});

/**
 * Bloquea la evaluacion y la deja esperando las cinco firmas. No se envia si
 * falta calificar algo o si algun firmante no existe, esta de baja o no tiene
 * usuario: asi ninguna evaluacion queda atorada en un buzon que nadie puede abrir.
 */
export const sendEvaluationToSignature = async (input: SendEvaluationToSignatureInput): Promise<CompetencyEvaluationRecord> => {
  const record = await loadDraft(input.evaluationId);
  await assertEvaluationReadyToSign(record);
  if (!record.evaluator_employee_id) {
    throwCoded(
      'RH_COMP_EVAL_EVALUATOR_NOT_EMPLOYEE',
      `El evaluador "${record.evaluator_name}" se capturo como texto. Eligelo de la lista de colaboradores en la cabecera para que pueda firmar en su Buzon.`,
    );
  }
  const assignment = assignmentOf(record, input);
  const signers = await loadDocumentSigners(KIND, record.id, assignment);
  const issues = documentSignerIssues(KIND, signers);
  if (issues.length > 0) {
    throwCoded('RH_COMP_EVAL_SIGNERS_NOT_READY', `No se envio a firma. ${issues.join(' ')}`);
  }
  const nameOf = (role: DocumentSignerRole): string => signers.find((signer) => signer.role === role)?.name ?? '';
  await withTransaction(async (client) => {
    const locked = await lockSignedDocument(client, KIND, record.id);
    if (locked.status !== 'DRAFT') throwCoded('RH_COMP_EVAL_ALREADY_CLOSED', 'La evaluacion ya esta cerrada.');
    if (locked.in_signature) throwCoded('RH_COMP_EVAL_IN_SIGNATURE', 'La evaluacion ya esta en firma.');
    await client.query(
      `UPDATE public.rh_competency_evaluations
          SET area_signatory_employee_id = $2, area_signatory_name = $3,
              rh_signatory_employee_id = $4, rh_signatory_name = $5,
              director_signatory_employee_id = $6, director_signatory_name = $7
        WHERE id = $1;`,
      [record.id, assignment.AREA, nameOf('AREA'), assignment.RH, nameOf('RH'), assignment.DIRECTOR, nameOf('DIRECTOR')],
    );
    await markSignatureRequested(client, KIND, record.id, input.userId);
  });
  return (await getEvaluationById(record.id)) as CompetencyEvaluationRecord;
};

// --- Cierre automatico -------------------------------------------------------------

const readPng = (storedPath: string | null): Buffer | null => {
  if (!storedPath) return null;
  const absolute = path.isAbsolute(storedPath) ? storedPath : path.resolve(process.cwd(), storedPath);
  try {
    return fs.existsSync(absolute) ? fs.readFileSync(absolute) : null;
  } catch {
    return null;
  }
};

const ROLE_KEYS: Record<DocumentSignerRole, 'collaborator' | 'evaluator' | 'area' | 'rh' | 'director'> = {
  EMPLOYEE: 'collaborator',
  EVALUATOR: 'evaluator',
  AREA: 'area',
  RH: 'rh',
  DIRECTOR: 'director',
};

const pngsBy = (signatures: Map<DocumentSignerRole, string | null>) => ({
  collaborator: readPng(signatures.get('EMPLOYEE') ?? null),
  evaluator: readPng(signatures.get('EVALUATOR') ?? null),
  area: readPng(signatures.get('AREA') ?? null),
  rh: readPng(signatures.get('RH') ?? null),
  director: readPng(signatures.get('DIRECTOR') ?? null),
});

/**
 * Cierra la evaluacion con sus cinco firmas. Devuelve null cuando no procede (no
 * esta en firma o faltan firmas). El candado de la fila serializa dos firmas
 * simultaneas: la segunda espera y encuentra la evaluacion ya cerrada. Si algo
 * falla antes de sellarla, la transaccion se revierte y sigue en firma con sus
 * firmas intactas para reintentar.
 */
export const closeFullySignedEvaluation = async (evaluationId: number, triggeredByUserId: string): Promise<CompetencyEvaluationRecord | null> => {
  // Fuera del candado: la lectura puede volcar el cuestionario de Conocimiento sobre la
  // misma fila (con el candado tomado se bloquearia). En firma los items ya no cambian.
  const record = await getEvaluationById(evaluationId);
  if (!record || !record.in_signature) return null;
  const closed = await withTransaction(async (client) => {
    const locked = await lockSignedDocument(client, KIND, evaluationId);
    if (!locked.in_signature) return false;
    const signatures = await loadActiveDocumentSignatures(client, KIND, evaluationId);
    if (pendingDocumentRoles(KIND, signatures.map((signature) => signature.role)).length > 0) return false;
    const results = computeResults(record.items ?? []);
    if (results.final_pct === null || !results.dictamen) {
      return throwCoded('RH_COMP_EVAL_INCOMPLETE', 'No se pudieron calcular los resultados.');
    }
    const byRole = new Map<DocumentSignerRole, DocumentSignature>(signatures.map((signature) => [signature.role, signature]));
    const pngs = pngsBy(new Map(signatures.map((signature) => [signature.role, signature.signature_path])));
    for (const [role, key] of Object.entries(ROLE_KEYS) as Array<[DocumentSignerRole, keyof typeof pngs]>) {
      if (!pngs[key]) {
        throwCoded(
          'RH_COMP_EVAL_SIGNATURE_FILE_MISSING',
          `No se encontro la imagen de la firma de ${byRole.get(role)?.signer_name || role}; cancela el envio a firma y vuelve a recabarla.`,
        );
      }
    }
    // Responsable del cierre: quien envio a firma (el ultimo firmante puede ser el propio evaluado).
    const actorUserId = locked.signature_requested_by_user_id ?? triggeredByUserId;
    const closedAt = new Date();
    const sealed = sealResults(results);
    const authorizedAt = sealed.authorization_result === 'NO_AUTORIZADO' ? closedAt : null;
    const names = {
      collaboratorName: byRole.get('EMPLOYEE')!.signer_name || record.employee_name,
      evaluatorName: byRole.get('EVALUATOR')!.signer_name || record.evaluator_name,
      areaName: byRole.get('AREA')!.signer_name,
      rhName: byRole.get('RH')!.signer_name,
      directorName: byRole.get('DIRECTOR')!.signer_name,
    };
    const pdf = await buildCompetencyEvaluationPdf({
      record: { ...record, results: sealed, area_signatory_name: names.areaName, rh_signatory_name: names.rhName, director_signatory_name: names.directorName },
      items: record.items ?? [],
      actions: record.actions ?? [],
      closedAt,
      authorizedAt,
      validUntil: null,
      signatories: names,
      signaturePngs: pngs,
    });
    const documentId = await archiveGeneratedPdfToExpedient({
      employeeId: record.employee_id,
      documentTypeCode: 'COMPETENCY_EVALUATION',
      referenceKey: `competency_evaluation:${record.id}`,
      title: `REH-REG-003 Evaluación de competencia - ${DICTAMEN_LABELS[results.dictamen]}`,
      description: `Puesto: ${record.position_name}. Resultado final: ${results.final_pct}%.${results.veto_applied ? ' VETO aplicado por competencia critica.' : ''}`,
      pdf,
      uploadedByUserId: actorUserId,
      expiryDate: null,
    });
    await client.query(
      `UPDATE public.rh_competency_evaluations
          SET status = 'CLOSED',
              competency_pct = $1, performance_pct = $2, knowledge_pct = $3, final_pct = $4,
              veto_applied = $5, dictamen = $6, authorization_result = $7, authorized_at = $8, valid_until = NULL,
              collaborator_signature_path = $9, evaluator_signature_path = $10,
              area_signature_path = $11, rh_signature_path = $12, director_signature_path = $13,
              area_signatory_name = $14, rh_signatory_name = $15, director_signatory_name = $16,
              document_id = $17, closed_at = $18, updated_at = NOW()
        WHERE id = $19 AND status = 'DRAFT';`,
      [
        results.competency_pct,
        results.performance_pct,
        results.knowledge_pct,
        results.final_pct,
        results.veto_applied,
        results.dictamen,
        sealed.authorization_result,
        authorizedAt,
        byRole.get('EMPLOYEE')!.signature_path,
        byRole.get('EVALUATOR')!.signature_path,
        byRole.get('AREA')!.signature_path,
        byRole.get('RH')!.signature_path,
        byRole.get('DIRECTOR')!.signature_path,
        names.areaName,
        names.rhName,
        names.directorName,
        documentId,
        closedAt,
        record.id,
      ],
    );
    return true;
  });
  return closed ? ((await getEvaluationById(evaluationId)) as CompetencyEvaluationRecord) : null;
};

// --- Consulta --------------------------------------------------------------------

/** PDF de consulta: en firma con marca de agua y las firmas ya recabadas; cerrada con las suyas. */
export const renderCompetencyEvaluationPdf = async (evaluationId: number): Promise<{ record: CompetencyEvaluationRecord; pdf: Buffer }> => {
  const record = await getEvaluationById(evaluationId);
  if (!record) return throwCoded('RH_COMP_EVAL_NOT_FOUND', 'La evaluacion indicada no existe.');
  if (record.status === 'CLOSED') {
    const row = (
      await pool.query(
        `SELECT collaborator_signature_path, evaluator_signature_path, area_signature_path, rh_signature_path, director_signature_path
           FROM public.rh_competency_evaluations WHERE id = $1;`,
        [evaluationId],
      )
    ).rows[0] ?? {};
    const pdf = await buildCompetencyEvaluationPdf({
      record,
      items: record.items ?? [],
      actions: record.actions ?? [],
      closedAt: record.closed_at ? new Date(record.closed_at) : new Date(),
      authorizedAt: record.authorized_at ? new Date(record.authorized_at) : null,
      validUntil: record.valid_until ? new Date(record.valid_until) : null,
      signatories: {
        collaboratorName: record.employee_name,
        evaluatorName: record.evaluator_name,
        areaName: record.area_signatory_name ?? '',
        rhName: record.rh_signatory_name ?? '',
        directorName: record.director_signatory_name ?? '',
      },
      signaturePngs: {
        collaborator: readPng(row.collaborator_signature_path ?? null),
        evaluator: readPng(row.evaluator_signature_path ?? null),
        area: readPng(row.area_signature_path ?? null),
        rh: readPng(row.rh_signature_path ?? null),
        director: readPng(row.director_signature_path ?? null),
      },
    });
    return { record, pdf };
  }
  if (!record.in_signature) {
    // Un borrador editable todavia no es de nadie mas que de RH.
    return throwCoded('RH_COMP_EVAL_NOT_IN_SIGNATURE', 'La evaluacion no esta en firma.');
  }
  const signers = await loadDocumentSigners(KIND, evaluationId);
  const nameOf = (role: DocumentSignerRole): string => signers.find((signer) => signer.role === role)?.name ?? '';
  const signatures = await loadActiveDocumentSignatures(pool, KIND, evaluationId);
  const pdf = await buildCompetencyEvaluationPdf({
    record: { ...record, results: sealResults(record.results) },
    items: record.items ?? [],
    actions: record.actions ?? [],
    closedAt: new Date(),
    authorizedAt: null,
    validUntil: null,
    signatories: {
      collaboratorName: nameOf('EMPLOYEE') || record.employee_name,
      evaluatorName: nameOf('EVALUATOR') || record.evaluator_name,
      areaName: nameOf('AREA'),
      rhName: nameOf('RH'),
      directorName: nameOf('DIRECTOR'),
    },
    signaturePngs: pngsBy(new Map(signatures.map((signature) => [signature.role, signature.signature_path]))),
    draft: true,
  });
  return { record, pdf };
};
