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

  it('Fase 6 y Fase 7: un aviso de inicio de fase con el total de puestos y el primero', () => {
    const f6 = buildPracticalStartedSms(ctx({ phaseNumber: 6, ordinal: 1 }));
    const f7 = buildCompetencyOpenedSms(ctx({ phaseNumber: 7, ordinal: 1, positionName: 'Flebotomista', positionCode: 'FLEB' }));
    // Fase 6: todos los puestos inician a la vez, no se nombra un primero.
    expect(f6.body).toBe('SafeDoc: Fase 6: inicia tu practica supervisada en tus 3 puestos a la vez. Te evaluaran en sitio en cada uno.');
    expect(f7.body).toBe(
      'SafeDoc: Fase 7: inicia tu evaluacion de competencia, puesto por puesto (3 en total); empiezas con Flebotomista. Tu evaluador te dira fecha y hora.',
    );
    expect(f6.body.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
    expect(f7.body.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
  });

  it('Fase 6 y Fase 7 con un solo puesto: texto por puesto, sin conteo', () => {
    const one = { total: 1, ordinal: 1 };
    expect(buildPracticalStartedSms(ctx({ phaseNumber: 6, ...one })).body).toBe(
      'SafeDoc: Fase 6 (Almacén): inicia tu practica supervisada. El responsable de tu area te evaluara en sitio.',
    );
    expect(buildCompetencyOpenedSms(ctx({ phaseNumber: 7, ...one })).body).toContain('Fase 7 (Almacén): se abrio tu evaluacion de competencia');
  });

  it('Fase 6 y Fase 7 con nombre de puesto largo: usa el codigo', () => {
    const long = { positionName: 'Coordinador de Procedimientos Preanalíticos y Postanalíticos', positionCode: 'CPP', ordinal: 1 };
    const f6 = buildPracticalStartedSms(ctx({ phaseNumber: 6, ...long }));
    const f7 = buildCompetencyOpenedSms(ctx({ phaseNumber: 7, ...long }));
    expect(f6.body).toContain('en tus 3 puestos a la vez');
    expect(f7.body).toContain('empiezas con CPP.');
    expect(f6.body.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
    expect(f7.body.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
  });
});
