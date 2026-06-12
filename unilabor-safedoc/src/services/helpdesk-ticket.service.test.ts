import { describe, expect, it } from 'vitest';
import { calculateDowntimeMinutes } from './helpdesk-ticket.service';

describe('calculateDowntimeMinutes', () => {
  it('calcula los minutos entre reporte y retorno a operacion', () => {
    expect(
      calculateDowntimeMinutes('2026-06-12T08:00:00.000Z', '2026-06-12T10:30:00.000Z'),
    ).toBe(150);
  });

  it('redondea al minuto mas cercano', () => {
    expect(
      calculateDowntimeMinutes('2026-06-12T08:00:00.000Z', '2026-06-12T08:00:40.000Z'),
    ).toBe(1);
  });

  it('devuelve 0 cuando reporte y retorno coinciden', () => {
    expect(
      calculateDowntimeMinutes('2026-06-12T08:00:00.000Z', '2026-06-12T08:00:00.000Z'),
    ).toBe(0);
  });

  it('devuelve null cuando el retorno es anterior al reporte', () => {
    expect(
      calculateDowntimeMinutes('2026-06-12T10:00:00.000Z', '2026-06-12T08:00:00.000Z'),
    ).toBeNull();
  });

  it('devuelve null ante fechas invalidas', () => {
    expect(calculateDowntimeMinutes('no-es-fecha', '2026-06-12T08:00:00.000Z')).toBeNull();
  });
});
