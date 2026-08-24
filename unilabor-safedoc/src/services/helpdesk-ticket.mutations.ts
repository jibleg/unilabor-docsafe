import pool from '../config/db';
import { withTransaction } from '../utils/transaction';
import { decodeSignaturePng, writeSignaturePng } from '../utils/signature-image';
import { employeeCanAccessHelpdeskAsset } from './helpdesk-asset.service';
import { archiveTicketConstancia } from './helpdesk-ticket-document.service';
import { notifyTicketAssigned, notifyTicketSolved } from './helpdesk-ticket-notification.service';
import { getHelpdeskTicketById, getMyHelpdeskTicketById } from './helpdesk-ticket.read';
import {
  HelpdeskTicketPayload,
  HelpdeskTicketRecord,
  HelpdeskTicketSolutionPayload,
  HelpdeskTicketReturnPayload,
  HelpdeskTicketIsoRiskPayload,
  HelpdeskTicketTechnicalReleasePayload,
  HelpdeskTicketAssignPayload,
  HelpdeskTicketStatusChangePayload,
  HelpdeskTicketClosePayload,
  HelpdeskTicketCancelPayload,
  HelpdeskTicketConfirmFunctionalityPayload,
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
  resolveTicketDueAt,
  createTicketError,
  ticketHasClosureEvidence,
  TICKET_WORKING_STATUS_TRANSITIONS,
  TICKET_TERMINAL_STATUS_CODES,
} from './helpdesk-ticket.shared';

/**
 * Construye un error de "estado previo invalido" para transiciones de ticket.
 * El controller lo mapea a HTTP 409 usando `publicMessage`.
 */
const invalidTicketState = (message: string): Error => createTicketError('HELPDESK_TICKET_INVALID_STATE', message);

const writeTicketSignature = (dataUrl: string, prefix: string): string => {
  const buffer = decodeSignaturePng(dataUrl);
  if (!buffer) {
    throw createTicketError('HELPDESK_TICKET_INVALID_SIGNATURE', 'La firma electronica es invalida o esta vacia.');
  }
  return writeSignaturePng(buffer, prefix);
};

export const createHelpdeskTicket = async (
  payload: HelpdeskTicketPayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord> => {
  await assertTicketsTable();

  const defaultStatusId = payload.status_id ?? await getDefaultStatusId();
  const defaultPriorityId = payload.priority_id ?? await getDefaultPriorityId();
  // SLA: si el cliente no manda due_at, se deriva de la prioridad (response_hours).
  const dueAt = await resolveTicketDueAt(defaultPriorityId, payload.due_at);
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
          request_channel,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $6, $6
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
        dueAt,
        normalizeOptionalText(payload.request_channel) ?? 'PORTAL',
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
      request_channel: 'PORTAL',
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

  // El estado (status_id) ya NO se mueve aqui: /assign, /status, /solve,
  // /validate-return, /close y /cancel son los unicos caminos validos
  // (cada uno con su propia maquina de estados y reglas de negocio).
  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_tickets
        SET
          asset_id = $1,
          request_type_id = $2,
          priority_id = $3,
          requester_employee_id = $4,
          assigned_employee_id = $5,
          title = $6,
          description = $7,
          operational_impact = $8,
          affects_results = $9,
          due_at = $10,
          request_channel = $11,
          updated_by_user_id = $12,
          updated_at = NOW()
        WHERE id = $13;
      `,
      [
        payload.asset_id ?? null,
        payload.request_type_id ?? null,
        payload.priority_id ?? null,
        payload.requester_employee_id ?? null,
        payload.assigned_employee_id ?? null,
        payload.title.trim(),
        payload.description.trim(),
        normalizeOptionalText(payload.operational_impact),
        Boolean(payload.affects_results),
        normalizeOptionalText(payload.due_at),
        normalizeOptionalText(payload.request_channel) ?? current.request_channel ?? 'PORTAL',
        userId ?? null,
        ticketId,
      ],
    );

    await recordTicketHistory(ticketId, 'UPDATE', 'Ticket actualizado.', userId, current, payload, client);
  });

  return getHelpdeskTicketById(ticketId);
};

export const assignHelpdeskTicket = async (
  ticketId: number,
  payload: HelpdeskTicketAssignPayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  const currentCode = current.status?.code ?? null;
  if (currentCode && TICKET_TERMINAL_STATUS_CODES.includes(currentCode)) {
    throw invalidTicketState('No se puede reasignar un ticket cerrado o cancelado.');
  }

  // Si el ticket sigue sin trabajarse, asignar responsable lo avanza a
  // ASSIGNED automaticamente; en estados posteriores solo cambia la persona.
  const shouldAdvanceStatus = currentCode === 'NEW' || currentCode === 'IN_REVIEW';
  const assignedStatusId = shouldAdvanceStatus ? await getTicketStatusId('ASSIGNED') : null;

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_tickets
        SET
          assigned_employee_id = $1,
          status_id = COALESCE($2, status_id),
          updated_by_user_id = $3,
          updated_at = NOW()
        WHERE id = $4;
      `,
      [payload.assigned_employee_id, assignedStatusId, userId ?? null, ticketId],
    );

    await recordTicketHistory(ticketId, 'ASSIGN', 'Responsable asignado.', userId, current, payload, client);
  });

  void notifyTicketAssigned(ticketId);
  return getHelpdeskTicketById(ticketId);
};

export const changeHelpdeskTicketWorkingStatus = async (
  ticketId: number,
  payload: HelpdeskTicketStatusChangePayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  const currentCode = current.status?.code ?? null;
  const targetCode = payload.status_code.trim().toUpperCase();
  const allowedTargets = currentCode ? TICKET_WORKING_STATUS_TRANSITIONS[currentCode] ?? [] : [];

  if (!allowedTargets.includes(targetCode)) {
    throw invalidTicketState(
      `No se puede mover el ticket de "${currentCode ?? 'sin estado'}" a "${targetCode}". Transiciones permitidas: ${allowedTargets.join(', ') || 'ninguna'}.`,
    );
  }

  const targetStatusId = await getTicketStatusId(targetCode);
  if (!targetStatusId) {
    throw createTicketError('HELPDESK_TICKET_STATUS_NOT_FOUND', 'El estado destino no existe en el catalogo.');
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_tickets
        SET status_id = $1, updated_by_user_id = $2, updated_at = NOW()
        WHERE id = $3;
      `,
      [targetStatusId, userId ?? null, ticketId],
    );

    await recordTicketHistory(
      ticketId,
      'STATUS_CHANGE',
      `Estado movido de "${currentCode}" a "${targetCode}".`,
      userId,
      current,
      payload,
      client,
    );
  });

  return getHelpdeskTicketById(ticketId);
};

export const closeHelpdeskTicket = async (
  ticketId: number,
  payload: HelpdeskTicketClosePayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  const currentCode = current.status?.code ?? null;
  if (currentCode && TICKET_TERMINAL_STATUS_CODES.includes(currentCode)) {
    throw invalidTicketState('Este ticket ya esta cerrado o cancelado.');
  }
  if (!current.validated_at) {
    throw invalidTicketState('No se puede cerrar un ticket sin validar antes el retorno a operacion.');
  }

  const hasEvidence = await ticketHasClosureEvidence(current);
  if (!hasEvidence) {
    throw createTicketError(
      'HELPDESK_TICKET_EVIDENCE_REQUIRED',
      'Para cerrar el ticket adjunta al menos un documento de evidencia, o registra la bitacora completa de llamada (si la atencion fue telefonica).',
    );
  }

  const closerSignaturePath = writeTicketSignature(payload.closer_signature, 'SIGN-TCK-CLOSE');
  const closedStatusId = await getTicketStatusId('CLOSED');

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_tickets
        SET
          status_id = COALESCE($1, status_id),
          closed_at = NOW(),
          closed_by_user_id = $2,
          closure_notes = $3,
          closer_signature_path = $4,
          updated_by_user_id = $2,
          updated_at = NOW()
        WHERE id = $5;
      `,
      [closedStatusId, userId ?? null, payload.closure_notes.trim(), closerSignaturePath, ticketId],
    );

    await recordTicketHistory(ticketId, 'CLOSE', 'Ticket cerrado.', userId, current, payload, client);
  });

  const closed = await getHelpdeskTicketById(ticketId);
  if (closed) {
    // Best-effort: la constancia PDF no bloquea el cierre ya confirmado si falla.
    await archiveTicketConstancia(closed, userId);
  }
  return closed;
};

export const cancelHelpdeskTicket = async (
  ticketId: number,
  payload: HelpdeskTicketCancelPayload,
  userId?: string | null,
): Promise<HelpdeskTicketRecord | null> => {
  await assertTicketsTable();

  const current = await getHelpdeskTicketById(ticketId);
  if (!current) {
    return null;
  }

  const currentCode = current.status?.code ?? null;
  if (currentCode && TICKET_TERMINAL_STATUS_CODES.includes(currentCode)) {
    throw invalidTicketState('Este ticket ya esta cerrado o cancelado.');
  }

  const cancelledStatusId = await getTicketStatusId('CANCELLED');

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_tickets
        SET
          status_id = COALESCE($1, status_id),
          cancelled_at = NOW(),
          cancelled_by_user_id = $2,
          cancellation_reason = $3,
          updated_by_user_id = $2,
          updated_at = NOW()
        WHERE id = $4;
      `,
      [cancelledStatusId, userId ?? null, payload.cancellation_reason.trim(), ticketId],
    );

    await recordTicketHistory(ticketId, 'CANCEL', 'Ticket cancelado.', userId, current, payload, client);
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
  payload: HelpdeskTicketConfirmFunctionalityPayload,
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

  const signaturePath = writeTicketSignature(payload.requester_signature, 'SIGN-TCK-REQ');
  await pool.query(
    `UPDATE public.helpdesk_tickets SET requester_signature_path = $1 WHERE id = $2;`,
    [signaturePath, ticketId],
  );
  await recordTicketHistory(
    ticketId,
    'REQUESTER_SIGNATURE',
    'El colaborador firmo la conformidad de funcionamiento del equipo.',
    userId,
    null,
    null,
  );

  const returnAt = new Date().toISOString();
  await addHelpdeskTicketComment(ticketId, 'El colaborador confirma funcionamiento del equipo (firmado).', false, userId);

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

  if (current.validated_at) {
    throw invalidTicketState('No se puede evaluar el riesgo de un ticket que ya fue validado.');
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

  if (current.validated_at) {
    throw invalidTicketState('No se puede registrar la liberacion tecnica de un ticket ya validado.');
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

  if (current.validated_at) {
    throw invalidTicketState('Este ticket ya fue validado; no admite una nueva solucion.');
  }
  if (current.solved_at) {
    throw invalidTicketState('Este ticket ya tiene una solucion registrada.');
  }

  const supportChannel = normalizeOptionalText(payload.support_channel);
  if (supportChannel === 'REMOTE_PHONE') {
    const hasCompleteCallLog =
      normalizeOptionalText(payload.provider_name) &&
      normalizeOptionalText(payload.provider_contact) &&
      payload.onsite_responsible_employee_id &&
      normalizeOptionalText(payload.call_at);

    if (!hasCompleteCallLog) {
      throw createTicketError(
        'HELPDESK_TICKET_PHONE_LOG_INCOMPLETE',
        'Cuando la atencion fue por llamada telefonica, captura proveedor, contacto, responsable tecnico in situ y fecha/hora de la llamada: sustituyen la evidencia documental.',
      );
    }
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
          support_channel = $5,
          provider_name = $6,
          provider_contact = $7,
          onsite_responsible_employee_id = $8,
          call_at = $9,
          updated_by_user_id = $10,
          updated_at = NOW()
        WHERE id = $11;
      `,
      [
        payload.solved_at,
        payload.solution_summary.trim(),
        payload.equipment_status_after_solution_id ?? null,
        solvedStatusId,
        supportChannel,
        normalizeOptionalText(payload.provider_name),
        normalizeOptionalText(payload.provider_contact),
        payload.onsite_responsible_employee_id ?? null,
        normalizeOptionalText(payload.call_at),
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

  void notifyTicketSolved(ticketId);
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

  if (current.validated_at) {
    throw invalidTicketState('Este ticket ya fue validado.');
  }
  if (!current.solved_at) {
    throw invalidTicketState('No se puede validar el retorno antes de registrar una solucion tecnica.');
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
