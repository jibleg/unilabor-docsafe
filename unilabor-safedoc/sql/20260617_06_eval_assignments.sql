-- Sprint 32 (EVAL-16) - Asignaciones de evaluacion (evaluation_assignments).
-- Una asignacion es la instancia de una plantilla para un colaborador, con su
-- ventana de tiempo (72h) y el ciclo de vida de la evaluacion.
BEGIN;

CREATE TABLE IF NOT EXISTS public.evaluation_assignments (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES public.evaluation_templates(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NULL,
  submitted_at TIMESTAMPTZ NULL,
  graded_at TIMESTAMPTZ NULL,
  score INTEGER NULL,
  max_score INTEGER NULL,
  percentage NUMERIC(5, 2) NULL,
  attempt_no INTEGER NOT NULL DEFAULT 1,
  notified_email_at TIMESTAMPTZ NULL,
  notified_sms_at TIMESTAMPTZ NULL,
  reminder_sent_at TIMESTAMPTZ NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_eval_assignments_status CHECK (
    status IN ('pending', 'in_progress', 'submitted', 'grading', 'passed', 'failed', 'expired', 'authorized_late')
  ),
  CONSTRAINT chk_eval_assignments_attempt CHECK (attempt_no >= 1)
);

CREATE INDEX IF NOT EXISTS idx_eval_assignments_template
  ON public.evaluation_assignments (template_id);

CREATE INDEX IF NOT EXISTS idx_eval_assignments_employee
  ON public.evaluation_assignments (employee_id);

CREATE INDEX IF NOT EXISTS idx_eval_assignments_status
  ON public.evaluation_assignments (status);

CREATE INDEX IF NOT EXISTS idx_eval_assignments_deadline
  ON public.evaluation_assignments (deadline_at);

-- Idempotencia: a lo sumo una asignacion VIGENTE por (plantilla, colaborador).
-- Los estados terminales (passed/failed/expired/authorized_late) no bloquean
-- una eventual reasignacion (recapacitacion).
CREATE UNIQUE INDEX IF NOT EXISTS ux_eval_assignments_active
  ON public.evaluation_assignments (template_id, employee_id)
  WHERE status IN ('pending', 'in_progress', 'submitted', 'grading');

COMMIT;
