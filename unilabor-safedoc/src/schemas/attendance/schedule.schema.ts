import { z } from 'zod';
import { isDateString } from '../../services/attendance/engine/time';

export const dateText = z
  .string()
  .trim()
  .refine(isDateString, { message: 'La fecha debe tener formato YYYY-MM-DD y ser valida' });

export const booleanQuery = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const positiveId = z.number().int().positive();

const weekdaysField = z
  .array(z.number().int().min(1).max(7))
  .max(7)
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

/** Alta de asignaciones: una por colaborador y por turno (sin turnos = descanso). */
export const createAssignmentsSchema = z
  .object({
    employee_ids: z.array(positiveId).min(1, 'Elige al menos un colaborador').max(200),
    shift_ids: z.array(positiveId).max(10),
    start_date: dateText,
    end_date: dateText.nullable().optional(),
    repeats_weekly: z.boolean(),
    week_interval: z.number().int().min(1).max(8).default(1),
    weekdays: weekdaysField.optional(),
    notes: z.string().trim().max(500).nullish(),
    keep_existing: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.employee_ids).size !== value.employee_ids.length) {
      ctx.addIssue({ code: 'custom', path: ['employee_ids'], message: 'Hay colaboradores repetidos' });
    }
    if (new Set(value.shift_ids).size !== value.shift_ids.length) {
      ctx.addIssue({ code: 'custom', path: ['shift_ids'], message: 'Hay turnos repetidos' });
    }
    if (value.repeats_weekly && (!value.weekdays || value.weekdays.length === 0)) {
      ctx.addIssue({ code: 'custom', path: ['weekdays'], message: 'Indica los dias de la semana en que se repite' });
    }
    if (value.end_date && value.end_date < value.start_date) {
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'La fecha fin no puede ser anterior al inicio' });
    }
  });

/** Edicion de una asignacion: campos opcionales; shift_id null = descanso. */
export const updateAssignmentSchema = z
  .object({
    shift_id: positiveId.nullable().optional(),
    start_date: dateText.optional(),
    end_date: dateText.nullable().optional(),
    repeats_weekly: z.boolean().optional(),
    week_interval: z.number().int().min(1).max(8).optional(),
    weekdays: weekdaysField.optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Indica al menos un campo a actualizar',
  });

export const assignmentIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const deleteAssignmentQuerySchema = z.object({
  date: dateText.optional(),
  from_date_only: booleanQuery.optional(),
});

export const scheduleQuerySchema = z.object({
  week: dateText.optional(),
  branch_id: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(100).optional(),
  only_enabled: booleanQuery.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const copyScheduleSchema = z.object({
  source_employee_id: positiveId,
  source_date: dateText,
  target_employee_ids: z.array(positiveId).max(200).default([]),
  same_week: z.boolean().default(false),
  weeks: z.number().int().min(1).max(12).default(1),
  replace: z.boolean().default(false),
});

export const scheduleLogQuerySchema = z.object({
  from: dateText.optional(),
  to: dateText.optional(),
  employee_id: z.coerce.number().int().positive().optional(),
  action: z.enum(['schedule', 'edit', 'remove', 'end', 'copy']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const employeeScheduleParamsSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
});

export const employeeScheduleQuerySchema = z.object({
  from: dateText.optional(),
  to: dateText.optional(),
});

export type CreateAssignmentsInput = z.infer<typeof createAssignmentsSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type CopyScheduleInput = z.infer<typeof copyScheduleSchema>;
export type ScheduleQuery = z.infer<typeof scheduleQuerySchema>;
export type ScheduleLogQuery = z.infer<typeof scheduleLogQuerySchema>;
