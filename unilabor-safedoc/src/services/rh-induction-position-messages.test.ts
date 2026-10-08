import { describe, expect, it } from 'vitest';
import {
  buildCompetencyOpenedSms,
  buildPositionReadingsSms,
  buildPracticalStartedSms,
  formatShortDeadline,
  SMS_MAX_LENGTH,
  type PositionStepContext,
} from './rh-induction-position-messages';

const ctx = (overrides: Partial<PositionStepContext> = {}): PositionStepContext => ({
  phaseNumber: 5,
  positionName: 'Almacén',
  positionCode: 'ALM',
  ordinal: 2,
  total: 3,
  ...overrides,
});

describe('SMS de la ruta por puesto', () => {
  it('Fase 5: puesto, pendientes y fecha corta', () => {
    expect(formatShortDeadline('2026-10-10T19:04:00.000Z')).toBe('10 oct 2026, 13:04');
    const sms = buildPositionReadingsSms(ctx(), 2, '2026-10-10T19:04:00.000Z');
    expect(sms.body).toBe(
      'SafeDoc: Fase 5, puesto 2 de 3 (Almacén): tienes 2 documentos por leer y firmar. Vence el 10 oct 2026, 13:04. Entra a SafeDoc > Mis lecturas.',
    );
    expect(sms.body.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
  });

  it('Fase 5 sin pendientes: avisa que ya puede presentar', () => {
    expect(buildPositionReadingsSms(ctx(), 0, null).body).toContain('presenta tu evaluacion');
  });

  it('un solo puesto omite "puesto N de M"', () => {
    expect(buildPositionReadingsSms(ctx({ total: 1, ordinal: 1 }), 1, null).body).toContain('Fase 5 (Almacén): tienes 1 documento');
  });

  it('nombre de puesto largo: usa el codigo para no pasar de 160', () => {
    const long = ctx({ positionName: 'Coordinador de Procedimientos Preanalíticos y Postanalíticos', positionCode: 'CPP' });
    const sms = buildPositionReadingsSms(long, 207, '2026-10-10T19:04:00.000Z');
    expect(sms.body).toContain('(CPP)');
    expect(sms.body.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
  });

  it('Fase 6 y Fase 7', () => {
    const f6 = buildPracticalStartedSms(ctx({ phaseNumber: 6, ordinal: 1 }));
    const f7 = buildCompetencyOpenedSms(ctx({ phaseNumber: 7, ordinal: 3, positionName: 'Flebotomista', positionCode: 'FLEB' }));
    expect(f6.body).toBe('SafeDoc: Fase 6, puesto 1 de 3 (Almacén): inicia tu practica supervisada. El responsable de tu area te evaluara en sitio.');
    expect(f7.body).toContain('Fase 7, puesto 3 de 3 (Flebotomista): se abrio tu evaluacion de competencia');
    expect(f6.body.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
    expect(f7.body.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
  });
});
