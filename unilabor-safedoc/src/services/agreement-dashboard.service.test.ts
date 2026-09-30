import { describe, expect, it } from 'vitest';
import { bucketFor } from './agreement-dashboard.service';

describe('bucketFor (semaforo de vencimiento de acuerdos)', () => {
  it('clasifica por dias al vencimiento', () => {
    expect(bucketFor(null)).toBe('no_expiry');
    expect(bucketFor(-1)).toBe('expired');
    expect(bucketFor(0)).toBe('critical');
    expect(bucketFor(30)).toBe('critical');
    expect(bucketFor(31)).toBe('warning');
    expect(bucketFor(60)).toBe('warning');
    expect(bucketFor(61)).toBe('upcoming');
    expect(bucketFor(90)).toBe('upcoming');
    expect(bucketFor(91)).toBe('ok');
  });
});
