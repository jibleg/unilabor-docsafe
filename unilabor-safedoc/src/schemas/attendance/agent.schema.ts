import { z } from 'zod';

/** Entrada de la API del agente local (Bearer propio, sin JWT). */

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z.preprocess((v) => (v === null ? undefined : v), text(max).optional());

export const heartbeatTerminalSchema = z.object({
  serial: text(100),
  model: optionalText(100),
  firmware: optionalText(100),
  ip: optionalText(64),
  online: z.boolean().default(true),
  clockDriftSeconds: z.preprocess((v) => (v === null ? undefined : v), z.number().int().optional()),
  people: z.preprocess((v) => (v === null ? undefined : v), z.number().int().min(0).optional()),
});

export const heartbeatSchema = z.object({
  version: optionalText(40),
  pc: optionalText(120),
  os: optionalText(120),
  ip: optionalText(64),
  // Se descartan los elementos sin serie; el tope de 20 se valida despues del filtro.
  terminals: z.array(z.unknown()).max(50).default([]),
});

export const ordersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const orderResultSchema = z.object({
  ok: z.boolean(),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
});

export const punchEventSchema = z.object({
  serial: z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().min(1).max(60)),
  employeeNo: z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().min(1).max(20)),
  deviceTime: z.string().min(10).max(40),
  attendanceStatus: z.preprocess((v) => (v === null ? undefined : v), z.string().max(40).optional()),
  method: z.preprocess((v) => (v === null ? undefined : v), z.string().max(40).optional()),
  photoBase64: z.preprocess((v) => (v === null ? undefined : v), z.string().optional()),
});

export const punchesBodySchema = z.object({
  terminalSerial: z.string().trim().min(1).max(100),
  // Los eventos se validan uno a uno (uno malo no tumba el lote): aqui solo el tope.
  events: z.array(z.unknown()).min(1).max(500),
});

export type HeartbeatInput = z.infer<typeof heartbeatSchema>;
export type HeartbeatTerminal = z.infer<typeof heartbeatTerminalSchema>;
export type PunchEventInput = z.infer<typeof punchEventSchema>;
