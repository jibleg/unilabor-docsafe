/**
 * Traduce los errores del SDK de Anthropic (APIError y derivados) a un codigo
 * del banco de preguntas + mensaje claro para RH. Sin esto, cualquier falla de
 * la API (sin saldo, llave invalida, saturacion...) llegaba a la UI como el
 * generico "No se pudo generar el banco de preguntas." y solo se podia
 * diagnosticar leyendo el log de pm2.
 *
 * Nunca devuelve 401/403 al frontend: el interceptor de la SPA los trataria
 * como sesion vencida del usuario, cuando el problema es la llave del servidor.
 */

export type AiApiErrorCode = 'QUESTION_BANK_AI_UNAVAILABLE' | 'QUESTION_BANK_AI_BUSY' | 'QUESTION_BANK_AI_REJECTED';

export interface MappedAiApiError {
  code: AiApiErrorCode;
  publicMessage: string;
  /** Detalle tecnico (status + mensaje de la API) para rh_question_bank_batches.error_message. */
  detail: string;
}

const CONTACT_SYSTEMS = 'Contacta a Sistemas.';

/** Mensaje que devuelve la API: { error: { type, message } }. */
const apiMessageOf = (error: any): string => {
  const body = error?.error;
  return String(body?.error?.message ?? body?.message ?? error?.message ?? '').trim();
};

const isConnectionError = (error: any): boolean =>
  error?.name === 'APIConnectionError' || error?.name === 'APIConnectionTimeoutError';

/** True si el error proviene del SDK de Anthropic (tiene status HTTP o es de conexion). */
const isAnthropicApiError = (error: any): boolean =>
  isConnectionError(error) || (typeof error?.status === 'number' && error?.error !== undefined);

export const mapAiApiError = (error: unknown): MappedAiApiError | null => {
  if (!isAnthropicApiError(error)) {
    return null;
  }
  const err = error as any;
  const status: number | undefined = typeof err.status === 'number' ? err.status : undefined;
  const apiMessage = apiMessageOf(err);
  const detail = `Anthropic API${status ? ` ${status}` : ''}: ${apiMessage || err?.name || 'error sin detalle'}`;

  if (isConnectionError(err)) {
    return {
      code: 'QUESTION_BANK_AI_BUSY',
      publicMessage: 'No se pudo conectar con el servicio de IA (red o tiempo de espera agotado). Intenta de nuevo en unos minutos.',
      detail,
    };
  }
  if (/credit balance/i.test(apiMessage)) {
    return {
      code: 'QUESTION_BANK_AI_UNAVAILABLE',
      publicMessage: `La cuenta del servicio de IA no tiene saldo disponible. ${CONTACT_SYSTEMS}`,
      detail,
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: 'QUESTION_BANK_AI_UNAVAILABLE',
      publicMessage: `La llave del servicio de IA del servidor es invalida o no tiene permisos. ${CONTACT_SYSTEMS}`,
      detail,
    };
  }
  if (status === 404) {
    return {
      code: 'QUESTION_BANK_AI_UNAVAILABLE',
      publicMessage: `El modelo de IA configurado en el servidor no esta disponible. ${CONTACT_SYSTEMS}`,
      detail,
    };
  }
  if (status === 413 || /prompt is too long|too many tokens/i.test(apiMessage)) {
    return {
      code: 'QUESTION_BANK_AI_REJECTED',
      publicMessage: 'Los documentos seleccionados exceden el tamano que acepta la IA. Selecciona menos documentos por lote.',
      detail,
    };
  }
  if (status === 429) {
    return {
      code: 'QUESTION_BANK_AI_BUSY',
      publicMessage: 'Se alcanzo el limite de uso del servicio de IA. Espera unos minutos e intenta de nuevo.',
      detail,
    };
  }
  if (status === 529 || (status !== undefined && status >= 500)) {
    return {
      code: 'QUESTION_BANK_AI_BUSY',
      publicMessage: 'El servicio de IA esta saturado o con falla temporal. Intenta de nuevo en unos minutos.',
      detail,
    };
  }
  return {
    code: 'QUESTION_BANK_AI_REJECTED',
    publicMessage: `El servicio de IA rechazo la solicitud${apiMessage ? `: ${apiMessage}` : '.'}`,
    detail,
  };
};
