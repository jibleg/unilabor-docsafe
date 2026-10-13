import { z } from 'zod';
import { DEVICE_NUMBER_MESSAGE, DEVICE_NUMBER_PATTERN } from '../../services/attendance/device-number';
import { isoDateSchema } from './holidays.schema';

export const deviceNumberSchema = z
  .string()
  .trim()
  .regex(DEVICE_NUMBER_PATTERN, DEVICE_NUMBER_MESSAGE);

const boolText = z.enum(['true', 'false']).transform((text) => text === 'true');

export const employeesQuerySchema = z.object({
  branch_id: z.coerce.number().int().positive().optional(),
  enabled: boolText.optional(),
  search: z.string().trim().max(100).optional(),
  sync_status: z.enum(['not_applicable', 'pending', 'synced', 'error']).optional(),
  without_schedule: boolText.optional(),
  include_inactive: boolText.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export const employeesSummaryQuerySchema = z.object({
  branch_id: z.coerce.number().int().positive().optional(),
});

export const employeeIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateEmployeeProfileSchema = z
  .object({
    is_enabled: z.boolean().optional(),
    device_employee_number: deviceNumberSchema.nullable().optional(),
    branch_id: z.number().int().positive().nullable().optional(),
    hire_date: isoDateSchema.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'No hay cambios que guardar.');

export const bulkEnableSchema = z.object({
  rows: z
    .array(
      z.object({
        employee_id: z.number().int().positive(),
        device_employee_number: deviceNumberSchema,
        branch_id: z.number().int().positive().optional(),
      }),
    )
    .min(1, 'Indica al menos un colaborador.')
    .max(500, 'Maximo 500 colaboradores por lote.'),
  default_branch_id: z.number().int().positive().optional(),
});

export type UpdateEmployeeProfileInput = z.infer<typeof updateEmployeeProfileSchema>;
export type EmployeesQuery = z.infer<typeof employeesQuerySchema>;
export type BulkEnableInput = z.infer<typeof bulkEnableSchema>;
