import pool from '../config/db';
import { withTransaction } from '../utils/transaction';
import { employeeCanAccessHelpdeskAsset } from './helpdesk-asset.service';
import { getHelpdeskTicketById, getMyHelpdeskTicketById } from './helpdesk-ticket.read';
import {
  HelpdeskTicketPayload,
  HelpdeskTicketRecord,
  HelpdeskTicketSolutionPayload,
  HelpdeskTicketReturnPayload,
  HelpdeskTicketIsoRiskPayload,
  HelpdeskTicketTechnicalReleasePayload,
  assertTicketsTable,
  getDefaultStatusId,
  getDefaultPriorityId,
  getTicketStatusId,
  getOperationalStatusId,
  generateTicketCode,
  recordTicketHistory,
  updateAssetStatusAndHistory,
  normalizeOptionalText,
  getRequiredEmployeeByUserId,
  calculateDowntimeMinutes,
} from './helpdesk-ticket.shared';

export const createHelpdeskTicket = async (
  payload: HelpdeskTicketPayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord> => {
  await assertTicketsTable();

  const defaultStatusId = payload.status_id ?? await getDefaultStatusId();
  const defaultPriorityId = payload.priority_id ?? await getDefaultPriorityId();
  const ticketCode = await generateTicketCode();

  const ticketId = await withTransaction(async (client) => {
    const result = await client.query(
      `
        INSERT INTO public.helpdesk_tickets (
          ticket_code,
          asset_id,
          request_type_id,
          status_id,
          priority_id,
          requester_user_id,
          requester_employee_id,
          assigned_employee_id,
          title,
          description,
          operational_impact,
          affects_results,
          due_at,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $6, $6
        )
        RETURNING id;
      `,
      [
        ticketCode,
        payload.asset_id ?? null,
        payload.request_type_id ?? null,
        defaultStatusId,
        defaultPriorityId,
        userId ?? null,
        payload.requester_employee_id ?? null,
        payload.assigned_employee_id ?? null,
        payload.title.trim(),
        payload.description.trim(),
        normalizeOptionalText(payload.operational_impact),
        Boolean(payload.affects_results),
        normalizeOptionalText(payload.due_at),
      ],
    );

    const id = Number(result.rows[0]?.id);
    await recordTicketHistory(id, 'CREATE', 'Ticket creado en mesa de ayuda.', userId, null, payload, client);
    return id;
  });

  const created = await getHelpdeskTicketById(ticketId);
  if (!created) {
    const error = new Error('HELPDESK_TICKET_CREATION_FAILED');
    (error as any).code = 'HELPDESK_TICKET_CREATION_FAILED';
    throw error;
  }

  return created;
};

export const createMyHelpdeskTicket = async (
  payload: HelpdeskTicketPayload,
  userId: string,
): Promise<HelpdeskTicketRecord> => {
  const employee = await getRequiredEmployeeByUserId(userId);

  if (payload.asset_id) {
    const canAccessAsset = await employeeCanAccessHelpdeskAsset(employee.id, payload.asset_id);
    if (!canAccessAsset) {
      const error = new Error('HELPDESK_ASSET_NOT_ASSIGNED_TO_EMPLOYEE');
      (error as any).code = 'HELPDESK_ASSET_NOT_ASSIGNED_TO_EMPLOYEE';
      throw error;
    }
  }

  return createHelpdeskTicket(
    {
      ...payload,
      requester_employee_id: employee.id,
      assigned_employee_id: null,
      status_id: null,
    },
    userId,
  );
};

export const updateHelpdeskTicket = async (
  ticketId: number,
  payload: HelpdeskTicketPayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_tickets
        SET
          asset_id = $1,
          request_type_id = $2,
          status_id = $3,
          priority_id = $4,
          requester_employee_id = $5,
          assigned_employee_id = $6,
          title = $7,
          description = $8,
          operational_impact = $9,
          affects_results = $10,
          due_at = $11,
          updated_by_user_id = $12,
          updated_at = NOW()
        WHERE id = $13;
      `,
      [
        payload.asset_id ?? null,
        payload.request_type_id ?? null,
        payload.status_id ?? null,
        payload.priority_id ?? null,
        payload.requester_employee_id ?? null,
        payload.assigned_employee_id ?? null,
        payload.title.trim(),
        payload.description.trim(),
        normalizeOptionalText(payload.operational_impact),
        Boolean(payload.affects_results),
        normalizeOptionalText(payload.due_at),
        userId ?? null,
        ticketId,
      ],
    );

    await recordTicketHistory(ticketId, 'UPDATE', 'Ticket actualizado.', userId, current, payload, client);
  });

  return getHelpdeskTicketById(ticketId);
};

export const addHelpdeskTicketComment = async (
  ticketId: number,
  comment: string,
  isInternal: boolean,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO public.helpdesk_ticket_comments (
          ticket_id,
          comment,
          is_internal,
          created_by_user_id
        )
        VALUES ($1, $2, $3, $4);
      `,
      [ticketId, comment.trim(), isInternal, userId ?? null],
    );

    await client.query(
      `
        UPDATE public.helpdesk_tickets
        SET updated_by_user_id = $1, updated_at = NOW()
        WHERE id = $2;
      `,
      [userId ?? null, ticketId],
    );

    await recordTicketHistory(
      ticketId,
      'COMMENT',
      'Comentario agregado al ticket.',
      userId,
      null,
      { comment, is_internal: isInternal },
      client,
    );
  });

  return getHelpdeskTicketById(ticketId);
};

export const addMyHelpdeskTicketComment = async (
  ticketId: number,
  comment: string,
  userId: string,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const employee = await getRequiredEmployeeByUserId(userId);
  const ticket = await getHelpdeskTicketById(ticketId);
  if (!ticket || ticket.requester_employee_id !== employee.id) {
    return null;
  }

  await addHelpdeskTicketComment(ticketId, comment, false, userId);
  // Devolver vía /me para NO exponer comentarios internos en la respuesta.
  return getMyHelpdeskTicketById(ticketId, userId);
};

export const confirmMyHelpdeskTicketFunctionality = async (
  ticketId: number,
  userId: string,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const employee = await getRequiredEmployeeByUserId(userId);
  const ticket = await getHelpdeskTicketById(ticketId);
  if (!ticket || ticket.requester_employee_id !== employee.id) {
    return null;
  }

  if (!ticket.solved_at) {
    const error = new Error('HELPDESK_TICKET_NOT_SOLVED');
    (error as any).code = 'HELPDESK_TICKET_NOT_SOLVED';
    throw error;
  }

  const returnAt = new Date().toISOString();
  await addHelpdeskTicketComment(ticketId, 'El colaborador confirma funcionamiento del equipo.', false, userId);

  await validateHelpdeskTicketReturn(
    ticketId,
    {
      return_to_operation_at: returnAt,
      equipment_status_after_solution_id: ticket.equipment_status_after_solution_id ?? null,
    },
    userId,
  );

  // Devolver vía /me para NO exponer comentarios internos en la respuesta.
  return getMyHelpdeskTicketById(ticketId, userId);
};

export const evaluateHelpdeskTicketIsoRisk = async (
  ticketId: number,
  payload: HelpdeskTicketIsoRiskPayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  const normalizedRisk = payload.risk_level.trim().toUpperCase();
  const operationalLock =
    payload.operational_lock ??
    (normalizedRisk === 'HIGH' || normalizedRisk === 'CRITICAL' || Boolean(current.affects_results));

  const outOfServiceStatusId =
    operationalLock && current.asset_id ? await getOperationalStatusId('OUT_OF_SERVICE') : null;

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_tickets
        SET
          risk_level = $1,
          impact_evaluation = $2,
          recent_analysis_usage = $3,
          alternate_equipment_used = $4,
          alternate_equipment_notes = $5,
          corrective_action_required = $6,
          corrective_action_notes = $7,
          impact_evaluated_by_user_id = $8,
          impact_evaluated_at = NOW(),
          technical_release_required = $9,
          quality_document_id = $10,
          operational_lock = $11,
          updated_by_user_id = $8,
          updated_at = NOW()
        WHERE id = $12;
      `,
      [
        normalizedRisk,
        payload.impact_evaluation.trim(),
        normalizeOptionalText(payload.recent_analysis_usage),
        Boolean(payload.alternate_equipment_used),
        normalizeOptionalText(payload.alternate_equipment_notes),
        Boolean(payload.corrective_action_required),
        normalizeOptionalText(payload.corrective_action_notes),
        userId ?? null,
        Boolean(payload.technical_release_required) || operationalLock,
        normalizeOptionalText(payload.quality_document_id),
        operationalLock,
        ticketId,
      ],
    );

    if (operationalLock && current.asset_id) {
      await updateAssetStatusAndHistory(
        current.asset_id,
        outOfServiceStatusId,
        ticketId,
        'Equipo bloqueado operativamente por evaluacion ISO/riesgo.',
        userId,
        client,
      );
    }

    await recordTicketHistory(
      ticketId,
      'ISO_RISK_EVALUATION',
      'Evaluacion ISO/riesgo registrada.',
      userId,
      current,
      payload,
      client,
    );
  });

  return getHelpdeskTicketById(ticketId);
};

export const releaseHelpdeskTicketTechnically = async (
  ticketId: number,
  payload: HelpdeskTicketTechnicalReleasePayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_tickets
        SET
          technical_release_summary = $1,
          technical_released_by_user_id = $2,
          technical_released_at = NOW(),
          equipment_status_after_solution_id = COALESCE($3, equipment_status_after_solution_id),
          operational_lock = FALSE,
          updated_by_user_id = $2,
          updated_at = NOW()
        WHERE id = $4;
      `,
      [
        payload.technical_release_summary.trim(),
        userId ?? null,
        payload.equipment_status_after_solution_id ?? null,
        ticketId,
      ],
    );

    if (current.asset_id && payload.equipment_status_after_solution_id) {
      await updateAssetStatusAndHistory(
        current.asset_id,
        payload.equipment_status_after_solution_id,
        ticketId,
        'Liberacion tecnica documentada desde ticket Helpdesk.',
        userId,
        client,
      );
    }

    await recordTicketHistory(
      ticketId,
      'TECHNICAL_RELEASE',
      'Liberacion tecnica documentada.',
      userId,
      current,
      payload,
      client,
    );
  });

  return getHelpdeskTicketById(ticketId);
};

export const solveHelpdeskTicket = async (
  ticketId: number,
  payload: HelpdeskTicketSolutionPayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  const solvedStatusId = await getTicketStatusId('SOLVED');

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_tickets
        SET
          solved_at = $1,
          solution_summary = $2,
          equipment_status_after_solution_id = $3,
          status_id = COALESCE($4, status_id),
          updated_by_user_id = $5,
          updated_at = NOW()
        WHERE id = $6;
      `,
      [
        payload.solved_at,
        payload.solution_summary.trim(),
        payload.equipment_status_after_solution_id ?? null,
        solvedStatusId,
        userId ?? null,
        ticketId,
      ],
    );

    await updateAssetStatusAndHistory(
      current.asset_id,
      payload.equipment_status_after_solution_id,
      ticketId,
      'Solucion tecnica registrada desde ticket Helpdesk.',
      userId,
      client,
    );

    await recordTicketHistory(ticketId, 'SOLVE', 'Solucion tecnica registrada.', userId, current, payload, client);
  });

  return getHelpdeskTicketById(ticketId);
};

export const validateHelpdeskTicketReturn = async (
  ticketId: number,
  payload: HelpdeskTicketReturnPayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  const validatedStatusId = await getTicketStatusId('VALIDATED');
  const requiresRelease =
    Boolean(current.technical_release_required) ||
    Boolean(current.operational_lock) ||
    Boolean(current.affects_results) ||
    current.risk_level === 'HIGH' ||
    current.risk_level === 'CRITICAL';

  if (requiresRelease && !current.technical_released_at) {
    const error = new Error('HELPDESK_TECHNICAL_RELEASE_REQUIRED');
    (error as any).code = 'HELPDESK_TECHNICAL_RELEASE_REQUIRED';
    throw error;
  }

  const downtimeMinutes = calculateDowntimeMinutes(current.reported_at, payload.return_to_operation_at);
  const nextStatusId =
    payload.equipment_status_after_solution_id ?? current.equipment_status_after_solution_id ?? null;

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_tickets
        SET
          return_to_operation_at = $1,
          validated_by_user_id = $2,
          validated_at = NOW(),
          downtime_minutes = $3,
          equipment_status_after_solution_id = COALESCE($4, equipment_status_after_solution_id),
          status_id = COALESCE($5, status_id),
          updated_by_user_id = $2,
          updated_at = NOW()
        WHERE id = $6;
      `,
      [
        payload.return_to_operation_at,
        userId ?? null,
        downtimeMinutes,
        payload.equipment_status_after_solution_id ?? null,
        validatedStatusId,
        ticketId,
      ],
    );

    await updateAssetStatusAndHistory(
      current.asset_id,
      nextStatusId,
      ticketId,
      'Retorno a operacion validado desde ticket Helpdesk.',
      userId,
      client,
    );

    await recordTicketHistory(ticketId, 'VALIDATE_RETURN', 'Retorno a operacion validado.', userId, current, {
      ...payload,
      downtime_minutes: downtimeMinutes,
    }, client);
  });

  return getHelpdeskTicketById(ticketId);
};
