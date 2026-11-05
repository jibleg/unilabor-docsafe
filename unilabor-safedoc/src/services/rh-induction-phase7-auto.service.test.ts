import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAuditEvent } from './audit.service';
import { resolveFallbackUserId } from './rh-induction-closure.service';
import { describePhase7AutoStart, tryAutoStartPhase7, type Phase7AutoStartOutcome } from './rh-induction-phase7-auto.service';
import {
  describePhase7Evaluator,
  loadTransitionRows,
  openPhase7Evaluation,
  type OpenedPhase7Evaluation,
  type TransitionRow,
} from './rh-induction-transition.service';
import { createCompetencyEvaluationSchema, updateCompetencyEvaluationSchema } from '../schemas/rh-competency-evaluation.schema';

// El arranque automatico no tiene logica propia de apertura: se prueba su orquestacion
// sobre la fila de la bandeja, sin base de datos ni avisos.
vi.mock('./audit.service', () => ({ registerAuditEvent: vi.fn(async () => undefined) }));
vi.mock('./rh-induction-closure.service', () => ({ resolveFallbackUserId: vi.fn(async () => 'fallback-admin') }));
vi.mock('./rh-induction-transition.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./rh-induction-transition.service')>()),
  loadTransitionRows: vi.fn(),
  openPhase7Evaluation: vi.fn(),
}));

const mockedRows = vi.mocked(loadTransitionRows);
const mockedOpen = vi.mocked(openPhase7Evaluation);
const mockedAudit = vi.mocked(registerAuditEvent);

const opened = (patch: Partial<OpenedPhase7Evaluation> = {}): OpenedPhase7Evaluation => ({
  evaluation_id: 40,
  position_code: 'QA',
  evaluator_name: 'Flor General',
  evaluator_employee_id: 62,
  evaluator_origin: 'PROPOSED',
  coordinator_was_supervisor: false,
  ...patch,
});

const result = (status: Phase7AutoStartOutcome['status'], patch: Partial<Phase7AutoStartOutcome> = {}): Phase7AutoStartOutcome => ({
  status,
  evaluation_id: null,
  position_code: 'QA',
  opened: null,
  detail: null,
  ...patch,
});

describe('Fase 7: con que evaluador quedo la evaluacion abierta', () => {
  it('elegido por RH desde la bandeja', () => {
    expect(describePhase7Evaluator(opened({ evaluator_origin: 'MANUAL', evaluator_name: 'Ana Ruiz' }))).toBe('Evaluador: Ana Ruiz.');
  });
  it('propuesto: el coordinador del area', () => {
    expect(describePhase7Evaluator(opened())).toBe('Evaluador propuesto: Flor General (coordinador del area).');
  });
  it('propuesto: el siguiente de la cadena porque el coordinador superviso la Fase 6', () => {
    expect(describePhase7Evaluator(opened({ coordinator_was_supervisor: true }))).toContain('superviso la Fase 6');
  });
  it('sin evaluador: explica por que y que RH debe asignarlo', () => {
    const none = { evaluator_origin: 'NONE' as const, evaluator_name: '', evaluator_employee_id: null };
    expect(describePhase7Evaluator(opened(none))).toContain('no tiene coordinador configurado');
    expect(describePhase7Evaluator(opened({ ...none, coordinator_was_supervisor: true }))).toContain('superviso la Fase 6');
    expect(describePhase7Evaluator(opened(none))).toContain('RH debe asignarlo');
  });
});

describe('Fase 7 automatica: lo que se informa tras el evento que la dispara', () => {
  it('abierta: dice el puesto y el evaluador', () => {
    const message = describePhase7AutoStart(result('OPENED', { evaluation_id: 40, opened: opened() }));
    expect(message).toContain('Se abrio sola su evaluacion de competencia REH-REG-003 (Fase 7) del puesto QA');
    expect(message).toContain('Evaluador propuesto: Flor General');
  });
  it('ya estaba en proceso (otra ejecucion simultanea o RH la abrio antes)', () => {
    expect(describePhase7AutoStart(result('ALREADY_OPEN'))).toContain('Ya tiene en proceso');
  });
  it('bloqueada: da el motivo y remite a la bandeja de RH', () => {
    const message = describePhase7AutoStart(result('BLOCKED', { detail: 'El puesto QA no tiene competencias en el catalogo.' }));
    expect(message).toContain('El puesto QA no tiene competencias en el catalogo.');
    expect(message).toContain('bandeja de avance');
  });
  it('fallo la apertura: da el motivo y remite a la bandeja de RH', () => {
    const message = describePhase7AutoStart(result('FAILED', { detail: 'Error inesperado al abrir la evaluacion.' }));
    expect(message).toContain('No se pudo abrir sola');
    expect(message).toContain('bandeja de avance');
  });
  it('aun no le toca: sin texto, salvo que haya un motivo que explicar', () => {
    expect(describePhase7AutoStart(null)).toBe('');
    expect(describePhase7AutoStart(result('NOT_DUE'))).toBe('');
    expect(describePhase7AutoStart(result('NOT_DUE', { detail: 'Le falta acreditar la Fase 6 de: RX.' }))).toContain('RX');
  });
});

describe('esquemas del REH-REG-003: evaluador', () => {
  const base = { employee_id: 1, position_id: 2, evaluation_type: 'INICIAL', evaluation_date: '2026-11-05' };

  it('al crear exige evaluador: colaborador de la lista o nombre', () => {
    expect(createCompetencyEvaluationSchema.safeParse(base).success).toBe(false);
    expect(createCompetencyEvaluationSchema.safeParse({ ...base, evaluator_name: '  ' }).success).toBe(false);
    expect(createCompetencyEvaluationSchema.safeParse({ ...base, evaluator_name: 'Evaluador externo' }).success).toBe(true);
    expect(createCompetencyEvaluationSchema.parse({ ...base, evaluator_employee_id: '62' }).evaluator_employee_id).toBe(62);
  });

  it('al editar el evaluador es opcional, pero un colaborador invalido se rechaza', () => {
    expect(updateCompetencyEvaluationSchema.safeParse({ evaluation_date: '2026-11-06' }).success).toBe(true);
    expect(updateCompetencyEvaluationSchema.parse({ evaluator_employee_id: 62 }).evaluator_employee_id).toBe(62);
    expect(updateCompetencyEvaluationSchema.safeParse({ evaluator_employee_id: -1 }).success).toBe(false);
  });
});

describe('tryAutoStartPhase7: orquestacion sobre la fila de la bandeja', () => {
  const row = (patch: Partial<TransitionRow> = {}): TransitionRow => ({
    employee_id: 3,
    employee_name: 'Colaborador de prueba',
    employee_code: 'E-3',
    user_linked: true,
    area: null,
    branch_name: 'CIDE',
    position_id: 11,
    position_code: 'QA',
    position_name: 'Quimico analista',
    previous_enrollment_id: 500,
    previous_passed_at: '2026-11-05T10:00:00.000Z',
    previous_percentage: 90,
    previous_certificate_document_id: null,
    target_course_id: null,
    documents_total: 0,
    competencies_total: 8,
    evaluation_state: 'READY',
    competency: null,
    positions: [],
    pending_positions: [],
    target: 7,
    state: 'READY',
    blocks: [],
    waiting_hours: 0,
    ...patch,
  });
  const silenced = () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    silenced();
  });

  it('fila LISTA: abre con la misma apertura que RH, sin evaluador elegido, y deja auditoria de apertura automatica', async () => {
    const ready = row();
    mockedRows.mockResolvedValue([ready]);
    mockedOpen.mockResolvedValue(opened());
    const outcome = await tryAutoStartPhase7(3, 'rh-user', 'PHASE6_COMPLETED');
    expect(mockedRows).toHaveBeenCalledWith(7, [3]);
    expect(mockedOpen).toHaveBeenCalledWith(ready, { actorUserId: 'rh-user' });
    expect(outcome).toMatchObject({ status: 'OPENED', evaluation_id: 40, position_code: 'QA' });
    expect(mockedAudit).toHaveBeenCalledTimes(1);
    expect(mockedAudit.mock.calls[0]?.[0]).toMatchObject({
      user_id: 'rh-user',
      action: 'RH_INDUCTION_COMPETENCY_AUTO_STARTED:40',
      employee_id: 3,
      metadata: { source: 'AUTO_START', trigger: 'PHASE6_COMPLETED', evaluator_origin: 'PROPOSED' },
    });
  });

  it('sin usuario que dispare el evento usa el usuario de respaldo del motor', async () => {
    mockedRows.mockResolvedValue([row()]);
    mockedOpen.mockResolvedValue(opened());
    await tryAutoStartPhase7(3, null, 'COMPETENCY_AUTHORIZED');
    expect(resolveFallbackUserId).toHaveBeenCalled();
    expect(mockedOpen.mock.calls[0]?.[1]).toEqual({ actorUserId: 'fallback-admin' });
  });

  it('idempotente: con una evaluacion en proceso no abre otra', async () => {
    const snapshot = { evaluation_id: 77, status: 'DRAFT' as const, evaluation_date: null, evaluator_name: '', final_pct: null, dictamen: null, authorization_result: null, closed_at: null };
    mockedRows.mockResolvedValue([row({ state: 'STARTED', competency: snapshot })]);
    expect(await tryAutoStartPhase7(3, 'rh-user', 'PHASE6_COMPLETED')).toMatchObject({ status: 'ALREADY_OPEN', evaluation_id: 77 });
    expect(mockedOpen).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it('dos ejecuciones a la vez: la que pierde el indice unico informa "ya abierta", sin error', async () => {
    mockedRows.mockResolvedValue([row()]);
    mockedOpen.mockRejectedValue(Object.assign(new Error('dup'), { code: 'RH_COMP_EVAL_INICIAL_ALREADY_OPEN' }));
    expect(await tryAutoStartPhase7(3, 'rh-user', 'PHASE6_COMPLETED')).toMatchObject({ status: 'ALREADY_OPEN' });
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it('aun le faltan puestos de la Fase 6: no es su momento y no abre nada', async () => {
    const blocks = [{ reason: 'PUESTOS_PENDIENTES' as const, detail: 'Le falta acreditar la Fase 6 de: RX.' }];
    mockedRows.mockResolvedValue([row({ state: 'BLOCKED', blocks })]);
    expect(await tryAutoStartPhase7(3, 'rh-user', 'PHASE6_COMPLETED')).toMatchObject({ status: 'NOT_DUE' });
    expect(mockedOpen).not.toHaveBeenCalled();
  });

  it('puesto sin competencias en el catalogo: no abre y devuelve el motivo (queda bloqueado en la bandeja)', async () => {
    const blocks = [{ reason: 'PUESTO_SIN_COMPETENCIAS' as const, detail: 'El puesto QA no tiene competencias en el catalogo.' }];
    mockedRows.mockResolvedValue([row({ state: 'BLOCKED', blocks })]);
    expect(await tryAutoStartPhase7(3, 'rh-user', 'PHASE6_COMPLETED')).toMatchObject({
      status: 'BLOCKED',
      detail: 'El puesto QA no tiene competencias en el catalogo.',
    });
    expect(mockedOpen).not.toHaveBeenCalled();
  });

  it('no es candidato (sin Fase 6 acreditada o Fase 7 concluida): no hace nada', async () => {
    mockedRows.mockResolvedValue([]);
    expect(await tryAutoStartPhase7(3, 'rh-user', 'COMPETENCY_AUTHORIZED')).toMatchObject({ status: 'NOT_DUE', detail: null });
  });

  it('nunca lanza: un fallo de la apertura o de la carga regresa como FAILED con su motivo', async () => {
    mockedRows.mockResolvedValue([row()]);
    mockedOpen.mockRejectedValue(Object.assign(new Error('x'), { code: 'RH_COMP_EVAL_POSITION_NOT_FOUND', publicMessage: 'El puesto indicado no existe o esta inactivo.' }));
    expect(await tryAutoStartPhase7(3, 'rh-user', 'PHASE6_COMPLETED')).toMatchObject({
      status: 'FAILED',
      detail: 'El puesto indicado no existe o esta inactivo.',
    });
    mockedRows.mockRejectedValue(new Error('sin conexion'));
    expect(await tryAutoStartPhase7(3, 'rh-user', 'PHASE6_COMPLETED')).toMatchObject({ status: 'FAILED' });
  });
});
