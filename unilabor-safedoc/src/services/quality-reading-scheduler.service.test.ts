import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/db', () => ({
  default: { query: vi.fn() },
}));
vi.mock('./notification.service', () => ({
  sendGenericNotification: vi.fn(),
}));
vi.mock('./quality-reading.service', () => ({
  expireOverdueReadings: vi.fn(),
}));

import pool from '../config/db';
import { sendGenericNotification } from './notification.service';
import { expireOverdueReadings } from './quality-reading.service';
import {
  runQualityReadingSchedulerTick,
  sendPendingReminders,
} from './quality-reading-scheduler.service';

const mockedQuery = pool.query as unknown as ReturnType<typeof vi.fn>;
const mockedNotify = sendGenericNotification as unknown as ReturnType<typeof vi.fn>;
const mockedExpire = expireOverdueReadings as unknown as ReturnType<typeof vi.fn>;

const NOW = new Date('2026-07-22T12:00:00Z');

const pendingRow = {
  id: 42,
  email: 'lector@unilabor.mx',
  phone: '5512345678',
  user_name: 'Ada Lovelace',
  document_title: 'Procedimiento de control de documentos',
  deadline_at: '2026-07-22T20:00:00Z',
};

describe('sendPendingReminders', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    mockedNotify.mockReset();
    mockedExpire.mockReset();
  });

  it('avisa y marca la lectura por vencer', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [pendingRow] }) // busqueda
      .mockResolvedValueOnce({ rows: [] }); // marcado
    mockedNotify.mockResolvedValueOnce({ emailSent: true, smsSent: false });

    expect(await sendPendingReminders(NOW)).toBe(1);

    const [recipient, subject] = mockedNotify.mock.calls[0];
    expect(recipient).toEqual({ email: 'lector@unilabor.mx', phone: '5512345678' });
    expect(subject).toContain('SGC');
    // El marcado ocurre DESPUES del envio.
    expect(mockedQuery.mock.calls[1][0]).toContain('reminder_sent_at');
  });

  it('NO marca como recordada una lectura cuyo aviso fallo', async () => {
    // Si se marcara igual, esa persona no volveria a recibir aviso nunca.
    mockedQuery.mockResolvedValueOnce({ rows: [pendingRow] });
    mockedNotify.mockRejectedValueOnce(new Error('SMTP caido'));

    expect(await sendPendingReminders(NOW)).toBe(0);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  it('un fallo de envio no frena a los demas lectores', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [pendingRow, { ...pendingRow, id: 43 }] })
      .mockResolvedValueOnce({ rows: [] });
    mockedNotify
      .mockRejectedValueOnce(new Error('SMTP caido'))
      .mockResolvedValueOnce({ emailSent: true, smsSent: false });

    expect(await sendPendingReminders(NOW)).toBe(1);
    expect(mockedNotify).toHaveBeenCalledTimes(2);
  });
});

describe('runQualityReadingSchedulerTick', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    mockedNotify.mockReset();
    mockedExpire.mockReset();
  });

  it('no hace nada si las tablas no existen todavia', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ exists: false }] });

    expect(await runQualityReadingSchedulerTick(NOW)).toEqual({ reminders: 0, expired: 0 });
    expect(mockedExpire).not.toHaveBeenCalled();
  });

  it('recuerda y vence en el mismo ciclo', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({ rows: [pendingRow] })
      .mockResolvedValueOnce({ rows: [] });
    mockedNotify.mockResolvedValueOnce({ emailSent: true, smsSent: false });
    mockedExpire.mockResolvedValueOnce(3);

    expect(await runQualityReadingSchedulerTick(NOW)).toEqual({ reminders: 1, expired: 3 });
  });
});
