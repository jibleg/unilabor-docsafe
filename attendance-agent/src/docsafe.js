/** Cliente hacia DocSafe: solo conexiones de salida con la clave del agente. */
import { toWireEvent } from './events.js';

export class DocsafeClient {
  constructor(cfg, version) {
    this.cfg = cfg;
    this.version = version;
  }

  async request(method, path, body) {
    let r;
    try {
      r = await fetch(`${this.cfg.docsafeUrl}/api/attendance/agent${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.agentKey}`, 'User-Agent': `docsafe-attendance-agent/${this.version}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      // "fetch failed" no dice nada: se agrega el motivo (ECONNREFUSED = DocSafe apagado o reiniciando, ECONNRESET, ENOTFOUND...).
      const reason = err?.cause?.code ?? err?.cause?.message ?? err?.name ?? 'sin detalle';
      const wrapped = new Error(`no se pudo conectar con DocSafe (${reason})`);
      wrapped.cause = err;
      throw wrapped;
    }
    const text = await r.text();
    if (!r.ok) {
      const err = new Error(`DocSafe ${method} ${path} -> ${r.status}: ${text.slice(0, 200)}`);
      err.status = r.status;
      throw err;
    }
    return text ? JSON.parse(text) : {};
  }

  heartbeat(data) {
    return this.request('POST', '/heartbeat', { version: this.version, ...data });
  }

  orders(limit = 10) {
    return this.request('GET', `/orders?limit=${limit}`);
  }

  orderResult(id, result) {
    return this.request('POST', `/orders/${id}/result`, result);
  }

  punches(terminalSerial, events) {
    return this.request('POST', '/punches', { terminalSerial, events: events.map(toWireEvent) });
  }
}
