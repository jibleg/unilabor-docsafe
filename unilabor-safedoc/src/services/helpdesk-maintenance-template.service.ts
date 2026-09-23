import pool from '../config/db';
import { withTransaction, type Queryable } from '../utils/transaction';
import { toIsoDateTime } from '../utils/date-serialization';
import { describeInterval, type MaintenanceExecutorKind, type MaintenanceIntervalUnit, type MaintenanceServiceKind } from './helpdesk-maintenance-recurrence';

/**
 * Plantillas de mantenimiento por categoria de activo. Las mantiene Help Desk
 * (HELPDESK.CATALOGS.MANAGE) y solo pre-llenan el programa de cada activo: el
 * programa real se personaliza con el plan del fabricante o del proveedor.
 */

export interface TemplateTaskInput {
  id?: number | null | undefined;
  task_text: string;
  is_required?: boolean | undefined;
}

export interface TemplateRoutineInput {
  id?: number | null | undefined;
  service_kind: MaintenanceServiceKind;
  title: string;
  description?: string | null | undefined;
  frequency_id?: number | null | undefined;
  custom_interval_value?: number | null | undefined;
  custom_interval_unit?: MaintenanceIntervalUnit | null | undefined;
  executor_kind: MaintenanceExecutorKind;
  window_before_days?: number | undefined;
  window_after_days?: number | undefined;
  checklist_required?: boolean | undefined;
  evidence_required?: boolean | undefined;
  tasks: TemplateTaskInput[];
}

export interface TemplatePayload {
  category_id?: number | null | undefined;
  name: string;
  description?: string | null | undefined;
  routines: TemplateRoutineInput[];
}

export interface TemplateTaskRecord {
  id: number;
  task_text: string;
  is_required: boolean;
  sort_order: number;
}

export interface TemplateRoutineRecord {
  id: number;
  template_id: number;
  service_kind: MaintenanceServiceKind;
  title: string;
  description: string | null;
  frequency_id: number | null;
  frequency_name: string | null;
  interval_months: number | null;
  custom_interval_value: number | null;
  custom_interval_unit: MaintenanceIntervalUnit | null;
  interval_label: string;
  executor_kind: MaintenanceExecutorKind;
  window_before_days: number;
  window_after_days: number;
  checklist_required: boolean;
  evidence_required: boolean;
  sort_order: number;
  tasks: TemplateTaskRecord[];
}

export interface TemplateRecord {
  id: number;
  category_id: number | null;
  category_code: string | null;
  category_name: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  routines: TemplateRoutineRecord[];
  assets_using: number;
  created_at?: string | undefined;
  updated_at?: string | undefined;
}

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const listTemplateTasks = async (routineId: number, executor: Queryable): Promise<TemplateTaskRecord[]> => {
  const result = await executor.query(
    `SELECT id, task_text, is_required, sort_order FROM public.helpdesk_maintenance_template_tasks WHERE routine_id = $1 ORDER BY sort_order, id;`,
    [routineId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    task_text: String(row.task_text),
    is_required: Boolean(row.is_required),
    sort_order: Number(row.sort_order ?? 0),
  }));
};

const listTemplateRoutines = async (templateId: number, executor: Queryable): Promise<TemplateRoutineRecord[]> => {
  const result = await executor.query(
    `
      SELECT r.*, f.name AS frequency_name, f.interval_months
        FROM public.helpdesk_maintenance_template_routines r
        LEFT JOIN public.helpdesk_maintenance_frequencies f ON f.id = r.frequency_id
       WHERE r.template_id = $1
       ORDER BY r.sort_order, r.id;
    `,
    [templateId],
  );
  return Promise.all(
    result.rows.map(async (row) => {
      const intervalMonths = row.interval_months ? Number(row.interval_months) : null;
      const customValue = row.custom_interval_value ? Number(row.custom_interval_value) : null;
      const customUnit = (row.custom_interval_unit as MaintenanceIntervalUnit | null) ?? null;
      return {
        id: Number(row.id),
        template_id: Number(row.template_id),
        service_kind: (row.service_kind ?? 'PREVENTIVE') as MaintenanceServiceKind,
        title: String(row.title),
        description: row.description ? String(row.description) : null,
        frequency_id: row.frequency_id ? Number(row.frequency_id) : null,
        frequency_name: row.frequency_name ? String(row.frequency_name) : null,
        interval_months: intervalMonths,
        custom_interval_value: customValue,
        custom_interval_unit: customUnit,
        interval_label: describeInterval({
          interval_months: intervalMonths,
          custom_interval_value: customValue,
          custom_interval_unit: customUnit,
          anchor_mode: 'FIXED',
          recurrence_end_on: null,
          recurrence_max_occurrences: null,
        }),
        executor_kind: (row.executor_kind ?? 'INTERNAL_TECH') as MaintenanceExecutorKind,
        window_before_days: Number(row.window_before_days ?? 0),
        window_after_days: Number(row.window_after_days ?? 0),
        checklist_required: Boolean(row.checklist_required),
        evidence_required: Boolean(row.evidence_required),
        sort_order: Number(row.sort_order ?? 0),
        tasks: await listTemplateTasks(Number(row.id), executor),
      };
    }),
  );
};

const mapTemplateRow = async (row: any, executor: Queryable): Promise<TemplateRecord> => ({
  id: Number(row.id),
  category_id: row.category_id ? Number(row.category_id) : null,
  category_code: row.category_code ? String(row.category_code) : null,
  category_name: row.category_name ? String(row.category_name) : null,
  name: String(row.name),
  description: row.description ? String(row.description) : null,
  is_active: Boolean(row.is_active),
  routines: await listTemplateRoutines(Number(row.id), executor),
  assets_using: Number(row.assets_using ?? 0),
  created_at: row.created_at ? toIsoDateTime(row.created_at) : undefined,
  updated_at: row.updated_at ? toIsoDateTime(row.updated_at) : undefined,
});

const TEMPLATE_QUERY = `
  SELECT t.*, c.code AS category_code, c.name AS category_name,
         (SELECT COUNT(*)::int FROM public.helpdesk_asset_maintenance_programs g WHERE g.template_id = t.id AND g.status = 'ACTIVE') AS assets_using
    FROM public.helpdesk_maintenance_templates t
    LEFT JOIN public.helpdesk_asset_categories c ON c.id = t.category_id
`;

export const listMaintenanceTemplates = async (options: { includeInactive?: boolean; categoryId?: number | null } = {}): Promise<TemplateRecord[]> => {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (!options.includeInactive) {
    clauses.push('t.is_active = TRUE');
  }
  if (options.categoryId) {
    values.push(options.categoryId);
    clauses.push(`t.category_id = $${values.length}`);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(`${TEMPLATE_QUERY} ${where} ORDER BY c.name NULLS LAST, t.name;`, values);
  return Promise.all(result.rows.map((row) => mapTemplateRow(row, pool)));
};

export const getMaintenanceTemplateById = async (templateId: number, executor: Queryable = pool): Promise<TemplateRecord | null> => {
  const result = await executor.query(`${TEMPLATE_QUERY} WHERE t.id = $1 LIMIT 1;`, [templateId]);
  return result.rows[0] ? mapTemplateRow(result.rows[0], executor) : null;
};

const saveRoutines = async (templateId: number, routines: TemplateRoutineInput[], executor: Queryable): Promise<void> => {
  const keepRoutineIds: number[] = [];
  for (const [index, routine] of routines.entries()) {
    const values = [
      templateId,
      routine.service_kind,
      routine.title.trim(),
      normalizeText(routine.description),
      routine.frequency_id ?? null,
      routine.custom_interval_value ?? null,
      routine.custom_interval_unit ?? null,
      routine.executor_kind,
      Math.max(Number(routine.window_before_days ?? 0), 0),
      Math.max(Number(routine.window_after_days ?? 0), 0),
      routine.checklist_required ?? true,
      routine.evidence_required ?? true,
      (index + 1) * 10,
    ];
    let routineId: number;
    if (routine.id) {
      const updated = await executor.query(
        `
          UPDATE public.helpdesk_maintenance_template_routines
             SET service_kind = $2, title = $3, description = $4, frequency_id = $5, custom_interval_value = $6,
                 custom_interval_unit = $7, executor_kind = $8, window_before_days = $9, window_after_days = $10,
                 checklist_required = $11, evidence_required = $12, sort_order = $13, updated_at = NOW()
           WHERE id = $14 AND template_id = $1
           RETURNING id;
        `,
        [...values, routine.id],
      );
      if (!updated.rows[0]) {
        continue;
      }
      routineId = Number(updated.rows[0].id);
    } else {
      const inserted = await executor.query(
        `
          INSERT INTO public.helpdesk_maintenance_template_routines (
            template_id, service_kind, title, description, frequency_id, custom_interval_value, custom_interval_unit,
            executor_kind, window_before_days, window_after_days, checklist_required, evidence_required, sort_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id;
        `,
        values,
      );
      routineId = Number(inserted.rows[0].id);
    }
    keepRoutineIds.push(routineId);

    const keepTaskIds: number[] = [];
    for (const [taskIndex, task] of routine.tasks.entries()) {
      const text = normalizeText(task.task_text);
      if (!text) {
        continue;
      }
      if (task.id) {
        const updatedTask = await executor.query(
          `UPDATE public.helpdesk_maintenance_template_tasks SET task_text = $2, is_required = $3, sort_order = $4 WHERE id = $1 AND routine_id = $5 RETURNING id;`,
          [task.id, text, task.is_required ?? true, (taskIndex + 1) * 10, routineId],
        );
        if (updatedTask.rows[0]) {
          keepTaskIds.push(Number(updatedTask.rows[0].id));
          continue;
        }
      }
      const insertedTask = await executor.query(
        `INSERT INTO public.helpdesk_maintenance_template_tasks (routine_id, task_text, is_required, sort_order) VALUES ($1, $2, $3, $4) RETURNING id;`,
        [routineId, text, task.is_required ?? true, (taskIndex + 1) * 10],
      );
      keepTaskIds.push(Number(insertedTask.rows[0].id));
    }
    await executor.query(
      `DELETE FROM public.helpdesk_maintenance_template_tasks WHERE routine_id = $1 AND NOT (id = ANY($2::bigint[]));`,
      [routineId, keepTaskIds],
    );
  }
  // Las rutinas de plantilla no son evidencia: los planes que las referencian quedan con template_routine_id NULL.
  await executor.query(
    `DELETE FROM public.helpdesk_maintenance_template_routines WHERE template_id = $1 AND NOT (id = ANY($2::bigint[]));`,
    [templateId, keepRoutineIds],
  );
};

export const createMaintenanceTemplate = async (payload: TemplatePayload, userId?: string | null): Promise<TemplateRecord> => {
  const templateId = await withTransaction(async (client) => {
    const result = await client.query(
      `
        INSERT INTO public.helpdesk_maintenance_templates (category_id, name, description, created_by_user_id, updated_by_user_id)
        VALUES ($1, $2, $3, $4, $4) RETURNING id;
      `,
      [payload.category_id ?? null, payload.name.trim(), normalizeText(payload.description), userId ?? null],
    );
    const id = Number(result.rows[0].id);
    await saveRoutines(id, payload.routines, client);
    return id;
  });
  const created = await getMaintenanceTemplateById(templateId);
  if (!created) {
    throw new Error('HELPDESK_MAINTENANCE_TEMPLATE_CREATION_FAILED');
  }
  return created;
};

export const updateMaintenanceTemplate = async (
  templateId: number,
  payload: TemplatePayload,
  userId?: string | null,
): Promise<TemplateRecord | null> => {
  const current = await getMaintenanceTemplateById(templateId);
  if (!current) {
    return null;
  }
  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_maintenance_templates
           SET category_id = $2, name = $3, description = $4, updated_by_user_id = $5, updated_at = NOW()
         WHERE id = $1;
      `,
      [templateId, payload.category_id ?? null, payload.name.trim(), normalizeText(payload.description), userId ?? null],
    );
    await saveRoutines(templateId, payload.routines, client);
  });
  return getMaintenanceTemplateById(templateId);
};

export const setMaintenanceTemplateActive = async (templateId: number, isActive: boolean, userId?: string | null): Promise<boolean> => {
  const result = await pool.query(
    `UPDATE public.helpdesk_maintenance_templates SET is_active = $2, updated_by_user_id = $3, updated_at = NOW() WHERE id = $1;`,
    [templateId, isActive, userId ?? null],
  );
  return (result.rowCount ?? 0) > 0;
};
