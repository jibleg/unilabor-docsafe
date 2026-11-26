import { describe, expect, it } from 'vitest';
import {
  addMonths,
  proposeSigningScope,
  resolveSignatureRegistryStatus,
  SIGNING_SCOPE_ITEM_NOS,
  type ScopeSourceItem,
  type SignatureRegistryStatusInput,
} from './rh-signature-registry.rules';

const TODAY = '2026-11-26';

const complete = (overrides: Partial<SignatureRegistryStatusInput> = {}): SignatureRegistryStatusInput => ({
  retired: false,
  hasPosition: true,
  hasScope: true,
  hasSignatureSpecimen: true,
  startDate: '2026-07-30',
  lastEvaluationDate: '2026-07-15',
  validUntil: '2027-07-15',
  ...overrides,
});

describe('resolveSignatureRegistryStatus', () => {
  it('la baja manda sobre todo lo demas y queda en gris', () => {
    const row = resolveSignatureRegistryStatus(complete({ retired: true, hasScope: false, lastEvaluationDate: null, validUntil: null }), TODAY);
    expect(row).toMatchObject({ status: 'DADA_DE_BAJA', status_label: 'DADA DE BAJA', status_tone: 'gray', missing: [] });
  });

  it('incompleta cuando falta alcance, firma o fecha de alta, y dice que falta', () => {
    expect(resolveSignatureRegistryStatus(complete({ hasScope: false }), TODAY)).toMatchObject({ status: 'INCOMPLETA', missing: ['actividades autorizadas a firmar'] });
    expect(resolveSignatureRegistryStatus(complete({ hasSignatureSpecimen: false }), TODAY).missing).toEqual(['espécimen de firma']);
    expect(resolveSignatureRegistryStatus(complete({ startDate: null }), TODAY).missing).toEqual(['fecha de alta (carta REH-REG-008 cerrada)']);
    expect(resolveSignatureRegistryStatus(complete({ hasPosition: false, hasScope: false }), TODAY).missing).toEqual(['puesto', 'actividades autorizadas a firmar']);
  });

  it('la rubrica no cuenta para estar completa', () => {
    expect(resolveSignatureRegistryStatus(complete(), TODAY).status).toBe('VIGENTE');
  });

  it('sin evaluacion cerrada: SIN EVALUACION en rojo, sin vencimiento', () => {
    const row = resolveSignatureRegistryStatus(complete({ lastEvaluationDate: null, validUntil: null }), TODAY);
    expect(row).toMatchObject({ status: 'SIN_EVALUACION', status_tone: 'red', expires_on: null, days_remaining: null });
  });

  it('vigente, por vencer a 60 dias o menos y vencida al pasar la vigencia', () => {
    expect(resolveSignatureRegistryStatus(complete(), TODAY)).toMatchObject({ status: 'VIGENTE', status_tone: 'green', days_remaining: 231 });
    expect(resolveSignatureRegistryStatus(complete({ validUntil: '2027-01-25' }), TODAY)).toMatchObject({ status: 'POR_VENCER', status_tone: 'amber', days_remaining: 60 });
    expect(resolveSignatureRegistryStatus(complete({ validUntil: '2027-01-26' }), TODAY).status).toBe('VIGENTE');
    expect(resolveSignatureRegistryStatus(complete({ validUntil: '2026-11-25' }), TODAY)).toMatchObject({ status: 'VENCIDA', status_tone: 'red', days_remaining: -1 });
  });

  it('sin valid_until, la vigencia son doce meses desde la evaluacion (como la formula del Excel)', () => {
    const row = resolveSignatureRegistryStatus(complete({ lastEvaluationDate: '2025-11-20', validUntil: null }), TODAY);
    expect(row).toMatchObject({ status: 'VENCIDA', expires_on: '2026-11-20', days_remaining: -6 });
    expect(addMonths('2026-01-31', 1)).toBe('2026-03-03');
  });
});

const item = (item_no: number, item_text: string, authorized = true): ScopeSourceItem => ({ item_no, item_text, authorized });

const letterItems: ScopeSourceItem[] = [
  item(1, 'Acceso a las instalaciones del laboratorio'),
  item(12, 'Consulta de resultados'),
  item(39, 'Validación técnica de resultados'),
  item(40, 'Liberación de resultados'),
  item(41, 'Informar resultados Críticos'),
  item(44, 'Emisión de comentarios clínicos', false),
  item(63, 'Revisión de documentos'),
  item(81, 'Autorización para firmar documentos oficiales'),
  item(82, 'Otras'),
];

describe('proposeSigningScope', () => {
  it('arma el texto solo con los Si que dejan firma, en el orden del formato, y Otras al final', () => {
    const text = proposeSigningScope({ items: [...letterItems].reverse(), otherAuthorizations: 'Informes de química clínica', otherItemNo: 82 });
    expect(text).toBe(
      'Validación técnica de resultados; liberación de resultados; informar resultados Críticos; revisión de documentos; autorización para firmar documentos oficiales; otras: Informes de química clínica.',
    );
  });

  it('ignora Otras sin texto y devuelve null si nada deja firma', () => {
    expect(proposeSigningScope({ items: [item(1, 'Acceso'), item(82, 'Otras')], otherAuthorizations: '  ', otherItemNo: 82 })).toBeNull();
    expect(proposeSigningScope({ items: [item(82, 'Otras')], otherAuthorizations: 'Bitácoras del área', otherItemNo: 82 })).toBe('Otras: Bitácoras del área.');
  });

  it('solo propone a partir de autorizaciones marcadas con Si', () => {
    const text = proposeSigningScope({ items: [item(39, 'Validación técnica de resultados', false), item(40, 'Liberación de resultados')], otherAuthorizations: null, otherItemNo: 82 });
    expect(text).toBe('Liberación de resultados.');
  });

  it('el catalogo de items que dejan firma no incluye accesos ni Otras', () => {
    expect(SIGNING_SCOPE_ITEM_NOS).not.toContain(1);
    expect(SIGNING_SCOPE_ITEM_NOS).not.toContain(82);
    expect(SIGNING_SCOPE_ITEM_NOS).toContain(81);
  });
});
