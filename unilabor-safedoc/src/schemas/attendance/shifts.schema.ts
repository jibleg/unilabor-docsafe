import { z } from 'zod';

const timeText = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora debe tener formato HH:MM');

const shiftFields = {
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(80, 'El nombre admite hasta 80 caracteres'),
  start_time: timeText,
  end_time: timeText,
  break_minutes: z.number().int().min(0).max(480),
  shift_type: z.enum(['fixed', 'flexible']),
  color_hex: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, 'El color debe tener formato #RRGGBB'),
  is_active: z.boolean(),
  entry_before_min: z.number().int().min(0).max(720),
  entry_after_min: z.number().int().min(0).max(720),
  exit_before_min: z.number().int().min(0).max(720),
  exit_after_min: z.number().int().min(0).max(720),
};

/** Alta de turno: break_minutes, shift_type y color_hex tienen valor por defecto. */
export const createShiftSchema = z.object({
  name: shiftFields.name,
  start_time: shiftFields.start_time,
  end_time: shiftFields.end_time,
  break_minutes: shiftFields.break_minutes.default(0),
  shift_type: shiftFields.shift_type.default('fixed'),
  color_hex: shiftFields.color_hex.default('#034898'),
  is_active: shiftFields.is_active.optional(),
  entry_before_min: shiftFields.entry_before_min.default(20),
  entry_after_min: shiftFields.entry_after_min.default(30),
  exit_before_min: shiftFields.exit_before_min.default(1),
  exit_after_min: shiftFields.exit_after_min.default(20),
});

/** Edicion parcial de turno (al menos un campo). */
export const updateShiftSchema = z
  .object({
    name: shiftFields.name.optional(),
    start_time: shiftFields.start_time.optional(),
    end_time: shiftFields.end_time.optional(),
    break_minutes: shiftFields.break_minutes.optional(),
    shift_type: shiftFields.shift_type.optional(),
    color_hex: shiftFields.color_hex.optional(),
    is_active: shiftFields.is_active.optional(),
    entry_before_min: shiftFields.entry_before_min.optional(),
    entry_after_min: shiftFields.entry_after_min.optional(),
    exit_before_min: shiftFields.exit_before_min.optional(),
    exit_after_min: shiftFields.exit_after_min.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Indica al menos un campo a actualizar',
  });

export const shiftIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const booleanQuery = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

export const listShiftsQuerySchema = z.object({
  include_inactive: booleanQuery.optional(),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
