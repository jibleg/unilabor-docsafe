import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertRequiredEnv, getJwtExpiresIn } from './env';

const original = { secret: process.env.JWT_SECRET, expires: process.env.JWT_EXPIRES_IN };

beforeEach(() => {
  delete process.env.JWT_SECRET;
  delete process.env.JWT_EXPIRES_IN;
});

afterEach(() => {
  process.env.JWT_SECRET = original.secret;
  process.env.JWT_EXPIRES_IN = original.expires;
});

describe('assertRequiredEnv', () => {
  it('lanza si JWT_SECRET no esta definido', () => {
    expect(() => assertRequiredEnv()).toThrow(/JWT_SECRET no esta definido/);
  });

  it('lanza si JWT_SECRET conserva el valor inseguro change-me', () => {
    process.env.JWT_SECRET = 'change-me';
    expect(() => assertRequiredEnv()).toThrow(/inseguro/);
  });

  it('no lanza con un secreto valido', () => {
    process.env.JWT_SECRET = 'un-secreto-fuerte-de-ejemplo';
    expect(() => assertRequiredEnv()).not.toThrow();
  });
});

describe('getJwtExpiresIn', () => {
  it('usa 8h por defecto', () => {
    expect(getJwtExpiresIn()).toBe('8h');
  });

  it('respeta JWT_EXPIRES_IN', () => {
    process.env.JWT_EXPIRES_IN = '30m';
    expect(getJwtExpiresIn()).toBe('30m');
  });
});
