import { describe, expect, it } from 'vitest';
import {
  mySupervisionSendSchema,
  sendToSignatureSchema,
  signatureInboxSignSchema,
  supervisionListQuerySchema,
  updateSupervisionChecklistSchema,
} from './rh-supervision-checklist.schema';

describe('ANA-REG-060: esquemas del envio a firma y del Buzon', () => {
  it('enviar a firma acepta el cuerpo vacio (la decision de lista final es opcional)', () => {
    expect(sendToSignatureSchema.safeParse({}).success).toBe(true);
    expect(sendToSignatureSchema.safeParse({ is_final: false }).success).toBe(true);
  });

  it('enviar a firma rechaza una decision de lista final que no sea booleana', () => {
    expect(sendToSignatureSchema.safeParse({ is_final: 'si' }).success).toBe(false);
  });

  it('el buzon exige una firma no vacia', () => {
    expect(signatureInboxSignSchema.safeParse({}).success).toBe(false);
    expect(signatureInboxSignSchema.safeParse({ signature: '   ' }).success).toBe(false);
    expect(signatureInboxSignSchema.safeParse({ signature: 'data:image/png;base64,AAAA' }).success).toBe(true);
  });

  it('el envio del supervisor solo lleva SGC y comentarios', () => {
    const parsed = mySupervisionSendSchema.safeParse({ sgc_follow_up_required: true, sgc_reference: ' TNC-12 ', supervisor_comments: null });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.sgc_reference).toBe('TNC-12');
  });

  it('la cabecera elige firmantes por colaborador (supervision de area) y permite quitarlos', () => {
    const parsed = updateSupervisionChecklistSchema.safeParse({ supervisor_employee_id: '12', area_responsible_employee_id: null });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.supervisor_employee_id).toBe(12);
    expect(parsed.success && parsed.data.area_responsible_employee_id).toBeNull();
    expect(updateSupervisionChecklistSchema.safeParse({ supervisor_employee_id: 0 }).success).toBe(false);
  });

  it('el filtro de estado conoce "en firma" y ya no el estado retirado', () => {
    expect(supervisionListQuerySchema.safeParse({ status: 'PENDING_SIGNATURES' }).success).toBe(true);
    expect(supervisionListQuerySchema.safeParse({ status: 'SUPERVISOR_SIGNED' }).success).toBe(false);
  });
});
