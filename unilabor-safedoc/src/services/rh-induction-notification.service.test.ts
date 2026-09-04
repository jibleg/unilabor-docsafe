import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/db', () => ({
  default: { query: vi.fn() },
}));
vi.mock('./notification.service', () => ({
  sendGenericNotification: vi.fn(),
  sendWhatsAppNotification: vi.fn(),
}));

import { buildInductionReadingsAssignedMessages } from './rh-induction-notification.service';

describe('buildInductionReadingsAssignedMessages', () => {
  it('incluye total de documentos, fase y fecha limite en correo y SMS', () => {
    const { subject, emailBody, smsBody } = buildInductionReadingsAssignedMessages({
      employeeName: 'Ada Lovelace',
      phaseNumber: 1,
      phaseName: 'Bienvenida institucional',
      documentsTotal: 6,
      readingDeadlineAt: '2026-09-07T15:24:00.000Z', // 09:24 hora de Ciudad de Mexico
    });
    expect(subject).toBe('Induccion - Fase 1: tienes 6 documentos por leer y firmar');
    expect(emailBody).toContain('Hola Ada Lovelace');
    expect(emailBody).toContain('"Bienvenida institucional"');
    expect(emailBody).toContain('Fecha limite de lectura: 7 de septiembre de 2026, 09:24.');
    expect(smsBody).toBe(
      'SafeDoc: tienes 6 documentos de Induccion (Fase 1) por leer y firmar. Vence el 7 de septiembre de 2026, 09:24. Entra a SafeDoc > Mis lecturas.',
    );
    expect(smsBody.length).toBeLessThanOrEqual(160);
  });

  it('sin limite de lectura omite la fecha y usa singular para un documento', () => {
    const { subject, emailBody, smsBody } = buildInductionReadingsAssignedMessages({
      employeeName: 'Ada',
      phaseNumber: 2,
      phaseName: 'Sistema de gestion',
      documentsTotal: 1,
      readingDeadlineAt: null,
    });
    expect(subject).toContain('tienes 1 documento por leer');
    expect(emailBody).toContain('Al terminar la lectura se abre el cuestionario');
    expect(emailBody).not.toContain('Fecha limite');
    expect(smsBody).not.toContain('Vence');
  });
});
