/**
 * Configuracion del agente: agent.config.json junto al programa (o la ruta en
 * AGENT_CONFIG). Las credenciales del reloj SOLO viven en este archivo.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULTS = {
  listenPort: 8085,
  intervals: { heartbeat: 60, orders: 15, recovery: 600 },
  recoveryHours: 24,
  queuePath: './queue.sqlite',
};

/** Valida y completa una configuracion ya parseada. Lanza Error con un mensaje claro. */
export function normalizeConfig(raw) {
  const cfg = raw ?? {};
  for (const field of ['docsafeUrl', 'agentKey']) {
    if (!cfg[field]) throw new Error(`agent.config.json: falta "${field}"`);
  }
  if (!/^[0-9a-f]{64}$/.test(String(cfg.agentKey))) {
    throw new Error('agent.config.json: "agentKey" debe ser la clave de 64 caracteres que muestra DocSafe');
  }
  if (!Array.isArray(cfg.terminals) || cfg.terminals.length === 0) {
    throw new Error('agent.config.json: configura al menos una terminal');
  }
  cfg.terminals.forEach((t, i) => {
    for (const field of ['name', 'ip', 'username', 'password']) {
      if (!t?.[field]) throw new Error(`agent.config.json: terminals[${i}] sin "${field}"`);
    }
  });
  return {
    ...DEFAULTS,
    ...cfg,
    docsafeUrl: String(cfg.docsafeUrl).replace(/\/+$/, ''),
    intervals: { ...DEFAULTS.intervals, ...(cfg.intervals ?? {}) },
    terminals: cfg.terminals.map((t) => ({ port: 80, ...t })),
  };
}

export function readConfig() {
  const path = resolve(process.env.AGENT_CONFIG ?? 'agent.config.json');
  return normalizeConfig(JSON.parse(readFileSync(path, 'utf8')));
}
