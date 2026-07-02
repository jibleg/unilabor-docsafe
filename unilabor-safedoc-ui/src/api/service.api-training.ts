import api from './axios';
import {
  asRecord,
  buildPageParams,
  extractPagination,
  getArrayFromPayload,
  getBoolean,
  getNumber,
  getString,
  unwrapPayload,
  type PageQuery,
  type PageResult,
} from './service.shared';
import type {
  CertificateSignature,
  CertificateTemplate,
  EvaluationAssignment,
  EvaluationAssignmentStatus,
  EvaluationGradingDetail,
  EvaluationQuestion,
  EvaluationQuestionOption,
  EvaluationQuestionType,
  EvaluationSelectionMode,
  EvaluationSubmitResult,
  EvaluationTakingQuestion,
  EvaluationTakingView,
  EvaluationTemplate,
  EvaluationType,
  EvaluationDashboard,
  EvaluationTemplateStatus,
  EvaluationResponsesDetail,
  EvaluationResponseOption,
  EvaluationQuestionResponse,
  NotificationLogEntry,
  OpenAnswerToGrade,
  TraceabilityRow,
  TrainingCourse,
} from '../types/models';

/**
 * Capa de API del modulo de Evaluaciones de capacitacion (ISO 15189).
 * Cubre capacitaciones, plantillas de evaluacion y banco de preguntas.
 */

export interface TrainingCoursePayload {
  code?: string | null;
  title: string;
  description?: string | null;
  certificate_validity_months?: number;
  is_active?: boolean;
}

export interface EvaluationTemplatePayload {
  title: string;
  instructions?: string | null;
  evaluation_type?: EvaluationType;
  passing_score?: number;
  window_hours?: number;
  selection_mode?: EvaluationSelectionMode;
  random_count?: number | null;
  status?: EvaluationTemplateStatus;
  is_active?: boolean;
}

export interface TemplateDetail {
  course: TrainingCourse;
  templates: EvaluationTemplate[];
}

// --- Normalizadores ---

const normalizeCourse = (input: unknown): TrainingCourse | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }
  const id = getNumber(source, ['id']);
  const title = getString(source, ['title']);
  if (!id || !title) {
    return null;
  }
  return {
    id,
    code: getString(source, ['code']),
    title,
    description: getString(source, ['description']) || null,
    certificate_validity_months: getNumber(source, ['certificate_validity_months']) ?? 12,
    is_active: getBoolean(source, ['is_active'], true),
    template_count: getNumber(source, ['template_count']) ?? 0,
    created_at: getString(source, ['created_at']),
    updated_at: getString(source, ['updated_at']),
  };
};

const normalizeOption = (input: unknown): EvaluationQuestionOption | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }
  const text = getString(source, ['text']);
  if (!text) {
    return null;
  }
  return {
    id: getNumber(source, ['id']) ?? undefined,
    text,
    is_correct: getBoolean(source, ['is_correct'], false),
    sort_order: getNumber(source, ['sort_order']) ?? undefined,
  };
};

const normalizeQuestion = (input: unknown): EvaluationQuestion | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }
  const text = getString(source, ['text']);
  const type = getString(source, ['type']) as EvaluationQuestionType;
  if (!text || !type) {
    return null;
  }
  const options = Array.isArray(source.options)
    ? source.options.map(normalizeOption).filter((option): option is EvaluationQuestionOption => option !== null)
    : [];
  return {
    id: getNumber(source, ['id']) ?? undefined,
    template_id: getNumber(source, ['template_id']) ?? undefined,
    type,
    text,
    points: getNumber(source, ['points']) ?? 1,
    sort_order: getNumber(source, ['sort_order']) ?? undefined,
    options,
  };
};

const normalizeTemplate = (input: unknown): EvaluationTemplate | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }
  const id = getNumber(source, ['id']);
  const title = getString(source, ['title']);
  if (!id || !title) {
    return null;
  }
  const questions = Array.isArray(source.questions)
    ? source.questions.map(normalizeQuestion).filter((question): question is EvaluationQuestion => question !== null)
    : undefined;
  return {
    id,
    training_course_id: getNumber(source, ['training_course_id']) ?? 0,
    title,
    instructions: getString(source, ['instructions']) || null,
    evaluation_type: (getString(source, ['evaluation_type']) as EvaluationType) || 'quiz',
    passing_score: getNumber(source, ['passing_score']) ?? 80,
    window_hours: getNumber(source, ['window_hours']) ?? 72,
    selection_mode: (getString(source, ['selection_mode']) as EvaluationSelectionMode) || 'all',
    random_count: getNumber(source, ['random_count']) ?? null,
    status: (getString(source, ['status']) as EvaluationTemplateStatus) || 'draft',
    is_active: getBoolean(source, ['is_active'], true),
    requires_manual_grading: getBoolean(source, ['requires_manual_grading'], false),
    question_count: getNumber(source, ['question_count']) ?? undefined,
    questions,
    created_at: getString(source, ['created_at']),
    updated_at: getString(source, ['updated_at']),
  };
};

// --- Capacitaciones ---

export const listTrainingCoursesPaginated = async (
  query: PageQuery = {},
): Promise<PageResult<TrainingCourse>> => {
  const response = await api.get('/rh/trainings', { params: buildPageParams(query) });
  const data = getArrayFromPayload(response.data, ['data', 'courses', 'items'])
    .map(normalizeCourse)
    .filter((course): course is TrainingCourse => course !== null);
  return { data, pagination: extractPagination(response.data, data.length) };
};

export const getTrainingCourse = async (courseId: number): Promise<TemplateDetail | null> => {
  const response = await api.get(`/rh/trainings/${courseId}`);
  const payload = asRecord(unwrapPayload(response.data));
  const course = normalizeCourse(payload?.course);
  if (!course) {
    return null;
  }
  const templates = Array.isArray(payload?.templates)
    ? payload.templates.map(normalizeTemplate).filter((template): template is EvaluationTemplate => template !== null)
    : [];
  return { course, templates };
};

export const createTrainingCourse = async (payload: TrainingCoursePayload): Promise<TrainingCourse | null> => {
  const response = await api.post('/rh/trainings', payload);
  return normalizeCourse(asRecord(unwrapPayload(response.data))?.course);
};

export const updateTrainingCourse = async (
  courseId: number,
  payload: Partial<TrainingCoursePayload>,
): Promise<TrainingCourse | null> => {
  const response = await api.patch(`/rh/trainings/${courseId}`, payload);
  return normalizeCourse(asRecord(unwrapPayload(response.data))?.course);
};

export const deleteTrainingCourse = async (courseId: number): Promise<void> => {
  await api.delete(`/rh/trainings/${courseId}`);
};

// --- Plantillas de evaluacion ---

export const getEvaluationTemplate = async (templateId: number): Promise<EvaluationTemplate | null> => {
  const response = await api.get(`/rh/trainings/templates/${templateId}`);
  return normalizeTemplate(asRecord(unwrapPayload(response.data))?.template);
};

export const createEvaluationTemplate = async (
  courseId: number,
  payload: EvaluationTemplatePayload,
): Promise<EvaluationTemplate | null> => {
  const response = await api.post(`/rh/trainings/${courseId}/templates`, payload);
  return normalizeTemplate(asRecord(unwrapPayload(response.data))?.template);
};

export const updateEvaluationTemplate = async (
  templateId: number,
  payload: Partial<EvaluationTemplatePayload>,
): Promise<EvaluationTemplate | null> => {
  const response = await api.patch(`/rh/trainings/templates/${templateId}`, payload);
  return normalizeTemplate(asRecord(unwrapPayload(response.data))?.template);
};

export const deleteEvaluationTemplate = async (templateId: number): Promise<void> => {
  await api.delete(`/rh/trainings/templates/${templateId}`);
};

export const replaceTemplateQuestions = async (
  templateId: number,
  questions: EvaluationQuestion[],
): Promise<EvaluationTemplate | null> => {
  const response = await api.put(`/rh/trainings/templates/${templateId}/questions`, { questions });
  return normalizeTemplate(asRecord(unwrapPayload(response.data))?.template);
};

// --- Asignaciones ---

const normalizeAssignment = (input: unknown): EvaluationAssignment | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }
  const id = getNumber(source, ['id']);
  if (!id) {
    return null;
  }
  return {
    id,
    template_id: getNumber(source, ['template_id']) ?? 0,
    employee_id: getNumber(source, ['employee_id']) ?? 0,
    status: (getString(source, ['status']) as EvaluationAssignmentStatus) || 'pending',
    available_at: getString(source, ['available_at']),
    deadline_at: getString(source, ['deadline_at']),
    started_at: getString(source, ['started_at']) || null,
    submitted_at: getString(source, ['submitted_at']) || null,
    graded_at: getString(source, ['graded_at']) || null,
    score: getNumber(source, ['score']) ?? null,
    max_score: getNumber(source, ['max_score']) ?? null,
    percentage: getNumber(source, ['percentage']) ?? null,
    attempt_no: getNumber(source, ['attempt_no']) ?? 1,
    template_title: getString(source, ['template_title']) || undefined,
    course_id: getNumber(source, ['course_id']) ?? undefined,
    course_title: getString(source, ['course_title']) || undefined,
    passing_score: getNumber(source, ['passing_score']) ?? undefined,
    window_hours: getNumber(source, ['window_hours']) ?? undefined,
    question_count: getNumber(source, ['question_count']) ?? undefined,
    employee_name: getString(source, ['employee_name']) || undefined,
    employee_code: getString(source, ['employee_code']) || undefined,
    certificate_document_id: getNumber(source, ['certificate_document_id']) ?? null,
    late_requested_at: getString(source, ['late_requested_at']) || null,
  };
};

export interface AssignmentSummary {
  created: number;
  skipped: number;
}

export const assignEvaluation = async (
  templateId: number,
  employeeIds: number[],
): Promise<AssignmentSummary> => {
  const response = await api.post(`/rh/trainings/templates/${templateId}/assign`, {
    employee_ids: employeeIds,
  });
  const summary = asRecord(asRecord(unwrapPayload(response.data))?.summary);
  return {
    created: Number(summary?.created ?? 0),
    skipped: Number(summary?.skipped ?? 0),
  };
};

// --- Evaluacion practica: captura directa por RH ---

export interface PracticalResultInput {
  employee_id: number;
  score: number; // 0-10
}

export interface PracticalCaptureRow {
  employee_id: number;
  assignment_id: number;
  status: 'passed' | 'failed';
  score: number;
  percentage: number;
  certificate_document_id: number | null;
}

export interface PracticalCaptureSummary {
  acreditados: number;
  no_acreditados: number;
  constancias_emitidas: number;
  reemplazados: number;
  results: PracticalCaptureRow[];
}

export const capturePracticalResults = async (
  templateId: number,
  results: PracticalResultInput[],
  capturedAt?: string | null,
): Promise<PracticalCaptureSummary> => {
  const response = await api.post('/rh/trainings/practical/capture', {
    template_id: templateId,
    ...(capturedAt ? { captured_at: capturedAt } : {}),
    results,
  });
  const summary = asRecord(asRecord(unwrapPayload(response.data))?.summary);
  const results_out: PracticalCaptureRow[] = Array.isArray(summary?.results)
    ? (summary!.results as unknown[])
        .map((raw): PracticalCaptureRow | null => {
          const r = asRecord(raw);
          if (!r) return null;
          return {
            employee_id: getNumber(r, ['employee_id']) ?? 0,
            assignment_id: getNumber(r, ['assignment_id']) ?? 0,
            status: (getString(r, ['status']) as 'passed' | 'failed') || 'failed',
            score: getNumber(r, ['score']) ?? 0,
            percentage: getNumber(r, ['percentage']) ?? 0,
            certificate_document_id: getNumber(r, ['certificate_document_id']) ?? null,
          };
        })
        .filter((r): r is PracticalCaptureRow => r !== null)
    : [];
  return {
    acreditados: Number(summary?.acreditados ?? 0),
    no_acreditados: Number(summary?.no_acreditados ?? 0),
    constancias_emitidas: Number(summary?.constancias_emitidas ?? 0),
    reemplazados: Number(summary?.reemplazados ?? 0),
    results: results_out,
  };
};

export const listTemplateAssignments = async (
  templateId: number,
  query: PageQuery = {},
): Promise<PageResult<EvaluationAssignment>> => {
  const response = await api.get(`/rh/trainings/templates/${templateId}/assignments`, {
    params: buildPageParams(query),
  });
  const data = getArrayFromPayload(response.data, ['data', 'assignments', 'items'])
    .map(normalizeAssignment)
    .filter((assignment): assignment is EvaluationAssignment => assignment !== null);
  return { data, pagination: extractPagination(response.data, data.length) };
};

export const listMyEvaluations = async (query: PageQuery = {}): Promise<PageResult<EvaluationAssignment>> => {
  const response = await api.get('/rh/me/evaluations', { params: buildPageParams(query) });
  const data = getArrayFromPayload(response.data, ['data', 'assignments', 'items'])
    .map(normalizeAssignment)
    .filter((assignment): assignment is EvaluationAssignment => assignment !== null);
  return { data, pagination: extractPagination(response.data, data.length) };
};

export const getMyPendingEvaluationsCount = async (): Promise<number> => {
  const response = await api.get('/rh/me/evaluations/pending-count');
  return Number(asRecord(unwrapPayload(response.data))?.count ?? 0);
};

// --- Realizar evaluacion (colaborador) ---

const normalizeTakingView = (input: unknown): EvaluationTakingView | null => {
  const source = asRecord(input);
  const assignment = asRecord(source?.assignment);
  if (!assignment) {
    return null;
  }
  const questions = Array.isArray(source?.questions)
    ? (source!.questions as unknown[])
        .map((raw): EvaluationTakingQuestion | null => {
          const q = asRecord(raw);
          if (!q) return null;
          const id = getNumber(q, ['id']);
          const type = getString(q, ['type']) as EvaluationQuestionType;
          if (!id || !type) return null;
          const options = Array.isArray(q.options)
            ? q.options
                .map((rawOption) => {
                  const o = asRecord(rawOption);
                  const oid = o ? getNumber(o, ['id']) : null;
                  if (!o || !oid) return null;
                  return { id: oid, text: getString(o, ['text']), sort_order: getNumber(o, ['sort_order']) ?? 0 };
                })
                .filter((o): o is { id: number; text: string; sort_order: number } => o !== null)
            : [];
          return {
            id,
            type,
            text: getString(q, ['text']),
            points: getNumber(q, ['points']) ?? 1,
            sort_order: getNumber(q, ['sort_order']) ?? 0,
            options,
          };
        })
        .filter((q): q is EvaluationTakingQuestion => q !== null)
    : [];

  return {
    assignment: {
      id: getNumber(assignment, ['id']) ?? 0,
      status: (getString(assignment, ['status']) as EvaluationAssignmentStatus) || 'pending',
      deadline_at: getString(assignment, ['deadline_at']),
      started_at: getString(assignment, ['started_at']) || null,
      template_title: getString(assignment, ['template_title']),
      course_title: getString(assignment, ['course_title']),
      instructions: getString(assignment, ['instructions']) || null,
      passing_score: getNumber(assignment, ['passing_score']) ?? 80,
      window_hours: getNumber(assignment, ['window_hours']) ?? 72,
    },
    questions,
  };
};

export interface SubmitAnswerPayload {
  question_id: number;
  selected_option_ids?: number[];
  text_answer?: string | null;
}

export const getMyEvaluation = async (assignmentId: number): Promise<EvaluationTakingView | null> => {
  const response = await api.get(`/rh/me/evaluations/${assignmentId}`);
  return normalizeTakingView(unwrapPayload(response.data));
};

export const startMyEvaluation = async (assignmentId: number): Promise<EvaluationTakingView | null> => {
  const response = await api.post(`/rh/me/evaluations/${assignmentId}/start`);
  return normalizeTakingView(unwrapPayload(response.data));
};

export const submitMyEvaluation = async (
  assignmentId: number,
  answers: SubmitAnswerPayload[],
): Promise<EvaluationSubmitResult> => {
  const response = await api.post(`/rh/me/evaluations/${assignmentId}/submit`, { answers });
  return normalizeSubmitResult(asRecord(unwrapPayload(response.data))?.result, assignmentId);
};

const normalizeSubmitResult = (raw: unknown, fallbackId: number): EvaluationSubmitResult => {
  const result = asRecord(raw);
  return {
    assignment_id: Number(result?.assignment_id ?? fallbackId),
    status: (String(result?.status ?? 'submitted')) as EvaluationAssignmentStatus,
    score: Number(result?.score ?? 0),
    max_score: Number(result?.max_score ?? 0),
    percentage: result?.percentage !== null && result?.percentage !== undefined ? Number(result.percentage) : null,
    passing_score: Number(result?.passing_score ?? 80),
    passed: Boolean(result?.passed),
    requires_manual_grading: Boolean(result?.requires_manual_grading),
    certificate_document_id:
      result?.certificate_document_id !== null && result?.certificate_document_id !== undefined
        ? Number(result.certificate_document_id)
        : null,
  };
};

/** Descarga un documento del expediente (constancia) como blob y devuelve object URL. */
export const getEmployeeDocumentUrl = async (documentId: number): Promise<string> => {
  const response = await api.get(`/rh/documents/${documentId}/view`, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};

export const getEvaluationDashboard = async (): Promise<EvaluationDashboard> => {
  const response = await api.get('/rh/evaluations/dashboard');
  const payload = asRecord(unwrapPayload(response.data));
  const totals = asRecord(payload?.totals) ?? {};
  const num = (source: Record<string, unknown>, key: string) => Number(source[key] ?? 0);
  const courses = Array.isArray(payload?.courses)
    ? (payload!.courses as unknown[]).map((raw) => {
        const c = asRecord(raw) ?? {};
        return {
          course_id: num(c, 'course_id'),
          course_title: String(c.course_title ?? ''),
          total: num(c, 'total'),
          passed: num(c, 'passed'),
          failed: num(c, 'failed'),
          pending: num(c, 'pending'),
          in_progress: num(c, 'in_progress'),
          grading: num(c, 'grading'),
          expired: num(c, 'expired'),
          authorized_late: num(c, 'authorized_late'),
          compliance_pct: num(c, 'compliance_pct'),
        };
      })
    : [];
  return {
    totals: {
      total: num(totals, 'total'),
      passed: num(totals, 'passed'),
      failed: num(totals, 'failed'),
      in_progress: num(totals, 'in_progress'),
      pending: num(totals, 'pending'),
      grading: num(totals, 'grading'),
      expired: num(totals, 'expired'),
      compliance_pct: num(totals, 'compliance_pct'),
    },
    courses,
  };
};

export const getTraceabilityReport = async (
  query: PageQuery & { course_id?: number; status?: string } = {},
): Promise<PageResult<TraceabilityRow>> => {
  const params: Record<string, string | number> = { ...buildPageParams(query) };
  if (query.course_id) {
    params.course_id = query.course_id;
  }
  if (query.status) {
    params.status = query.status;
  }
  const response = await api.get('/rh/evaluations/report', { params });
  const data = getArrayFromPayload(response.data, ['data', 'items'])
    .map((raw): TraceabilityRow | null => {
      const r = asRecord(raw);
      if (!r) return null;
      return {
        assignment_id: getNumber(r, ['assignment_id']) ?? 0,
        employee_name: getString(r, ['employee_name']),
        employee_code: getString(r, ['employee_code']),
        course_title: getString(r, ['course_title']),
        template_title: getString(r, ['template_title']),
        status: (getString(r, ['status']) as TraceabilityRow['status']) || 'pending',
        percentage: getNumber(r, ['percentage']) ?? null,
        passing_score: getNumber(r, ['passing_score']) ?? 0,
        submitted_at: getString(r, ['submitted_at']) || null,
        graded_at: getString(r, ['graded_at']) || null,
        certificate_issue_date: getString(r, ['certificate_issue_date']) || null,
        certificate_expiry_date: getString(r, ['certificate_expiry_date']) || null,
      };
    })
    .filter((row): row is TraceabilityRow => row !== null);
  return { data, pagination: extractPagination(response.data, data.length) };
};

export const requestLateAuthorization = async (assignmentId: number): Promise<void> => {
  await api.post(`/rh/me/evaluations/${assignmentId}/request-late`);
};

export const listExpiredAssignments = async (query: PageQuery = {}): Promise<PageResult<EvaluationAssignment>> => {
  const response = await api.get('/rh/evaluations/expired', { params: buildPageParams(query) });
  const data = getArrayFromPayload(response.data, ['data', 'assignments', 'items'])
    .map(normalizeAssignment)
    .filter((assignment): assignment is EvaluationAssignment => assignment !== null);
  return { data, pagination: extractPagination(response.data, data.length) };
};

export const authorizeLateAttempt = async (assignmentId: number, reopenHours?: number): Promise<void> => {
  await api.post(
    `/rh/evaluations/${assignmentId}/authorize-late`,
    reopenHours ? { reopen_hours: reopenHours } : {},
  );
};

export const listNotificationLog = async (
  filters: {
    limit?: number;
    channel?: 'email' | 'sms';
    status?: 'sent' | 'failed' | 'skipped';
    from?: string;
    to?: string;
  } = {},
): Promise<NotificationLogEntry[]> => {
  const params: Record<string, string | number> = { limit: filters.limit ?? 200 };
  if (filters.channel) params.channel = filters.channel;
  if (filters.status) params.status = filters.status;
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  const response = await api.get('/rh/evaluations/notifications', { params });
  return getArrayFromPayload(response.data, ['data', 'items'])
    .map((raw): NotificationLogEntry | null => {
      const r = asRecord(raw);
      if (!r) return null;
      return {
        id: getNumber(r, ['id']) ?? 0,
        channel: (getString(r, ['channel']) as 'email' | 'sms') || 'email',
        recipient: getString(r, ['recipient']),
        subject: getString(r, ['subject']) || null,
        body: getString(r, ['body']) || null,
        template: getString(r, ['template']),
        assignment_id: getNumber(r, ['assignment_id']) ?? null,
        status: (getString(r, ['status']) as 'sent' | 'failed' | 'skipped') || 'sent',
        error: getString(r, ['error']) || null,
        sent_at: getString(r, ['sent_at']),
        employee_name: getString(r, ['employee_name']) || null,
        course_title: getString(r, ['course_title']) || null,
      };
    })
    .filter((entry): entry is NotificationLogEntry => entry !== null);
};

// --- Calificacion manual (RH) ---

export const listGradingQueue = async (query: PageQuery = {}): Promise<PageResult<EvaluationAssignment>> => {
  const response = await api.get('/rh/evaluations/grading', { params: buildPageParams(query) });
  const data = getArrayFromPayload(response.data, ['data', 'assignments', 'items'])
    .map(normalizeAssignment)
    .filter((assignment): assignment is EvaluationAssignment => assignment !== null);
  return { data, pagination: extractPagination(response.data, data.length) };
};

export const getGradingDetail = async (assignmentId: number): Promise<EvaluationGradingDetail | null> => {
  const response = await api.get(`/rh/evaluations/${assignmentId}/grading`);
  const payload = asRecord(unwrapPayload(response.data));
  const assignment = asRecord(payload?.assignment);
  if (!assignment) {
    return null;
  }
  const openAnswers: OpenAnswerToGrade[] = Array.isArray(payload?.open_answers)
    ? (payload!.open_answers as unknown[])
        .map((raw): OpenAnswerToGrade | null => {
          const o = asRecord(raw);
          const questionId = o ? getNumber(o, ['question_id']) : null;
          if (!o || !questionId) return null;
          return {
            question_id: questionId,
            text: getString(o, ['text']),
            points: getNumber(o, ['points']) ?? 0,
            text_answer: getString(o, ['text_answer']) || null,
            points_awarded: getNumber(o, ['points_awarded']) ?? 0,
          };
        })
        .filter((o): o is OpenAnswerToGrade => o !== null)
    : [];
  return {
    assignment: {
      id: getNumber(assignment, ['id']) ?? assignmentId,
      status: (getString(assignment, ['status']) as EvaluationAssignmentStatus) || 'grading',
      employee_name: getString(assignment, ['employee_name']),
      employee_code: getString(assignment, ['employee_code']),
      course_title: getString(assignment, ['course_title']),
      template_title: getString(assignment, ['template_title']),
      passing_score: getNumber(assignment, ['passing_score']) ?? 80,
      objective_score: getNumber(assignment, ['objective_score']) ?? 0,
      max_score: getNumber(assignment, ['max_score']) ?? 0,
    },
    open_answers: openAnswers,
  };
};

export const getEvaluationResponses = async (
  assignmentId: number,
): Promise<EvaluationResponsesDetail | null> => {
  const response = await api.get(`/rh/evaluations/${assignmentId}/responses`);
  const payload = asRecord(unwrapPayload(response.data));
  const assignment = asRecord(payload?.assignment);
  if (!assignment) {
    return null;
  }
  const questions: EvaluationQuestionResponse[] = getArrayFromPayload(payload, ['questions'])
    .map((raw): EvaluationQuestionResponse | null => {
      const q = asRecord(raw);
      const questionId = q ? getNumber(q, ['question_id']) : null;
      if (!q || !questionId) return null;
      const options: EvaluationResponseOption[] = getArrayFromPayload(q, ['options'])
        .map((rawOption): EvaluationResponseOption | null => {
          const o = asRecord(rawOption);
          const optionId = o ? getNumber(o, ['id']) : null;
          if (!o || !optionId) return null;
          return {
            id: optionId,
            text: getString(o, ['text']),
            is_correct: getBoolean(o, ['is_correct']),
            selected: getBoolean(o, ['selected']),
          };
        })
        .filter((o): o is EvaluationResponseOption => o !== null);
      return {
        question_id: questionId,
        type: (getString(q, ['type']) as EvaluationQuestionType) || 'single',
        text: getString(q, ['text']),
        points: getNumber(q, ['points']) ?? 0,
        points_awarded: getNumber(q, ['points_awarded']) ?? 0,
        is_correct: getBoolean(q, ['is_correct']),
        answered: getBoolean(q, ['answered']),
        text_answer: getString(q, ['text_answer']) || null,
        options,
      };
    })
    .filter((q): q is EvaluationQuestionResponse => q !== null);

  return {
    assignment: {
      id: getNumber(assignment, ['id']) ?? assignmentId,
      employee_name: getString(assignment, ['employee_name']),
      employee_code: getString(assignment, ['employee_code']),
      course_title: getString(assignment, ['course_title']),
      template_title: getString(assignment, ['template_title']),
      status: (getString(assignment, ['status']) as EvaluationAssignmentStatus) || 'submitted',
      score: getNumber(assignment, ['score']),
      max_score: getNumber(assignment, ['max_score']),
      percentage: getNumber(assignment, ['percentage']),
      passing_score: getNumber(assignment, ['passing_score']) ?? 80,
      submitted_at: getString(assignment, ['submitted_at']) || null,
      graded_at: getString(assignment, ['graded_at']) || null,
    },
    questions,
  };
};

export const gradeEvaluation = async (
  assignmentId: number,
  grades: { question_id: number; points_awarded: number }[],
): Promise<EvaluationSubmitResult> => {
  const response = await api.post(`/rh/evaluations/${assignmentId}/grade`, { grades });
  return normalizeSubmitResult(asRecord(unwrapPayload(response.data))?.result, assignmentId);
};

// --- Plantilla de constancia ---

const normalizeCertificateTemplate = (input: unknown, courseId: number): CertificateTemplate => {
  const source = asRecord(input);
  const signatures: CertificateSignature[] = Array.isArray(source?.signatures)
    ? (source!.signatures as unknown[])
        .map((raw): CertificateSignature | null => {
          const s = asRecord(raw);
          if (!s) return null;
          return {
            id: getNumber(s, ['id']) ?? undefined,
            signatory_name: getString(s, ['signatory_name']),
            role: getString(s, ['role']) || null,
            signature_image_path: getString(s, ['signature_image_path']) || null,
            sort_order: getNumber(s, ['sort_order']) ?? undefined,
          };
        })
        .filter((s): s is CertificateSignature => s !== null)
    : [];
  return {
    id: source ? getNumber(source, ['id']) ?? null : null,
    training_course_id: source ? getNumber(source, ['training_course_id']) ?? courseId : courseId,
    title_text: getString(source ?? {}, ['title_text']) || 'Constancia de capacitación',
    body_text: getString(source ?? {}, ['body_text']),
    logo_path: getString(source ?? {}, ['logo_path']) || null,
    orientation: (getString(source ?? {}, ['orientation']) as 'landscape' | 'portrait') || 'landscape',
    signatures,
  };
};

export interface CertificateTemplatePayload {
  title_text?: string;
  body_text?: string;
  logo_path?: string | null;
  orientation?: 'landscape' | 'portrait';
  signatures?: Array<{ signatory_name: string; role?: string | null; signature_image_path?: string | null }>;
}

export const getCertificateTemplate = async (courseId: number): Promise<CertificateTemplate> => {
  const response = await api.get(`/rh/trainings/${courseId}/certificate`);
  return normalizeCertificateTemplate(asRecord(unwrapPayload(response.data))?.template, courseId);
};

export const saveCertificateTemplate = async (
  courseId: number,
  payload: CertificateTemplatePayload,
): Promise<CertificateTemplate> => {
  const response = await api.put(`/rh/trainings/${courseId}/certificate`, payload);
  return normalizeCertificateTemplate(asRecord(unwrapPayload(response.data))?.template, courseId);
};

export const uploadCertificateImage = async (courseId: number, file: File): Promise<string> => {
  const form = new FormData();
  form.append('file', file);
  const response = await api.post(`/rh/trainings/${courseId}/certificate/image`, form);
  return getString(asRecord(unwrapPayload(response.data)) ?? {}, ['path']);
};

/** Descarga el preliminar como blob y devuelve un object URL para el visor. */
export const getCertificatePreviewUrl = async (courseId: number): Promise<string> => {
  const response = await api.get(`/rh/trainings/${courseId}/certificate/preview`, {
    responseType: 'blob',
  });
  return URL.createObjectURL(response.data as Blob);
};
