import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { validate } from './validate.middleware';

const buildRes = () => {
  const res: any = {
    statusCode: undefined,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

const schema = z.object({
  email: z.string().trim().min(1, 'El email es requerido'),
  age: z.coerce.number().int().positive().optional(),
});

describe('validate middleware', () => {
  it('llama next y normaliza req.body cuando la entrada es valida', () => {
    const req: any = { body: { email: '  a@b.mx  ', age: '5' } };
    const res = buildRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ email: 'a@b.mx', age: 5 }); // trim + coercion aplicados
    expect(res.statusCode).toBeUndefined();
  });

  it('responde 400 con formato uniforme { message, errors } al fallar', () => {
    const req: any = { body: {} };
    const res = buildRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Datos de entrada invalidos');
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0]).toMatchObject({ field: 'email' });
  });
});
