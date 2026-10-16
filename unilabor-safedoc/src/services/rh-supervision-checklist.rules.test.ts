import { describe, expect, it } from 'vitest';
import { conclusionFor, practicalScoreFromPct, summarizeSupervisionResults, supervisionFolio } from './rh-supervision-checklist.rules';

describe('ANA-REG-060: resumen y bandas', () => {
  it('excluye los N/A del denominador y redondea a 2 decimales', () => {
    const summary = summarizeSupervisionResults(['SI', 'SI', 'NO', 'NA', 'NA', 'SI', 'SI', 'SI', 'SI']);
    expect(summary.evaluated).toBe(7);
    expect(summary.compliant).toBe(6);
    expect(summary.non_compliant).toBe(1);
    expect(summary.not_applicable).toBe(2);
    expect(summary.compliance_pct).toBe(85.71);
    expect(summary.conclusion).toBe('CONFORME');
    expect(summary.passed).toBe(true);
  });

  it('sin items evaluados no hay porcentaje ni dictamen', () => {
    const summary = summarizeSupervisionResults(['NA', null, 'NA']);
    expect(summary.evaluated).toBe(0);
    expect(summary.pending).toBe(1);
    expect(summary.compliance_pct).toBeNull();
    expect(summary.conclusion).toBeNull();
    expect(summary.passed).toBeNull();
  });

  it('bandas del ANA-PRC-005 y minimo 80 % del REH-MAN-002', () => {
    expect(conclusionFor(85)).toBe('CONFORME');
    expect(conclusionFor(84.99)).toBe('CONFORME_CON_OBSERVACIONES');
    expect(conclusionFor(80)).toBe('CONFORME_CON_OBSERVACIONES');
    expect(conclusionFor(79.99)).toBe('REQUIERE_SEGUIMIENTO');
    expect(summarizeSupervisionResults(['SI', 'SI', 'SI', 'SI', 'NO']).passed).toBe(true); // 80 %
    expect(summarizeSupervisionResults(['SI', 'SI', 'SI', 'NO', 'NO']).passed).toBe(false); // 60 %
  });

  it('la nota practica se trunca a un decimal sin cruzar el 80 %', () => {
    expect(practicalScoreFromPct(79.6)).toBe(7.9);
    expect(practicalScoreFromPct(80)).toBe(8);
    expect(practicalScoreFromPct(85.71)).toBe(8.5);
    expect(practicalScoreFromPct(100)).toBe(10);
  });

  it('folio con consecutivo de 5 digitos', () => {
    expect(supervisionFolio(7)).toBe('ANA-REG-060-00007');
    expect(supervisionFolio(123456)).toBe('ANA-REG-060-123456');
  });
});
