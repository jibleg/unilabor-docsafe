/**
 * Cola local de checadas (SQLite integrado en Node). Lo que el reloj empuja o
 * lo que se recupera se guarda aqui y se entrega a DocSafe en lotes; sin
 * internet simplemente espera. UNIQUE(terminal_serial, serial) evita repetidos.
 */
import { DatabaseSync } from 'node:sqlite';

export class Queue {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      terminal_serial TEXT NOT NULL,
      serial TEXT NOT NULL,
      employee_no TEXT NOT NULL,
      device_time TEXT NOT NULL,
      attendance_status TEXT,
      method TEXT NOT NULL,
      photo TEXT,
      sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (terminal_serial, serial))`);
  }

  /** Agrega un evento; devuelve true si era nuevo. */
  add(e) {
    const r = this.db
      .prepare(`INSERT OR IGNORE INTO events
        (terminal_serial, serial, employee_no, device_time, attendance_status, method, photo)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(e.terminalSerial, e.serial, e.employeeNo, e.deviceTime, e.attendanceStatus ?? null, e.method, e.photoBase64 ?? null);
    return Number(r.changes) > 0;
  }

  pending(terminalSerial, limit = 100) {
    return this.db
      .prepare(`SELECT id, terminal_serial, serial, employee_no, device_time, attendance_status, method, photo
                FROM events WHERE sent = 0 AND terminal_serial = ? ORDER BY id LIMIT ?`)
      .all(terminalSerial, limit)
      .map((r) => ({
        id: Number(r.id),
        terminalSerial: r.terminal_serial,
        serial: r.serial,
        employeeNo: r.employee_no,
        deviceTime: r.device_time,
        attendanceStatus: r.attendance_status,
        method: r.method,
        photoBase64: r.photo,
      }));
  }

  pendingSerials() {
    return this.db.prepare('SELECT DISTINCT terminal_serial FROM events WHERE sent = 0').all().map((r) => r.terminal_serial);
  }

  /** state 1 = entregado; 2 = DocSafe lo rechazo como invalido (no se reintenta). Libera la foto. */
  markSent(ids, state = 1) {
    if (ids.length === 0) return;
    this.db
      .prepare(`UPDATE events SET sent = ?, photo = NULL WHERE id IN (${ids.map(() => '?').join(',')})`)
      .run(state, ...ids);
  }

  totalPending() {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM events WHERE sent = 0').get().n);
  }

  /** Borra lo ya entregado con mas de N dias. */
  purge(days = 30) {
    const r = this.db.prepare(`DELETE FROM events WHERE sent <> 0 AND created_at < datetime('now', ?)`).run(`-${days} days`);
    return Number(r.changes);
  }

  close() {
    this.db.close();
  }
}
