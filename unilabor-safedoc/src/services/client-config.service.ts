import pool from '../config/db';

// Destinatarios de la alerta de vencimiento de documentos de cliente: lista
// configurable de usuarios (no un responsable por documento). Administrable
// en /providers/clients/config por PROVIDERS_ADMIN.

export interface ClientNotificationRecipient {
  id: number;
  user_id: string;
  full_name: string | null;
  email: string | null;
}

const mapRecipientRow = (row: any): ClientNotificationRecipient => ({
  id: Number(row.id),
  user_id: String(row.user_id),
  full_name: row.full_name ? String(row.full_name) : null,
  email: row.email ? String(row.email) : null,
});

export const listClientNotificationRecipients = async (): Promise<ClientNotificationRecipient[]> => {
  const result = await pool.query(`
    SELECT r.id, r.user_id, u.full_name, u.email
    FROM public.client_notification_recipients r
    INNER JOIN public.users u ON u.id = r.user_id
    ORDER BY u.full_name ASC NULLS LAST, u.email ASC;
  `);
  return result.rows.map(mapRecipientRow);
};

export const addClientNotificationRecipient = async (
  userId: string,
): Promise<ClientNotificationRecipient | null> => {
  const userResult = await pool.query('SELECT id FROM public.users WHERE id = $1 LIMIT 1;', [userId]);
  if (userResult.rows.length === 0) {
    const error = new Error('CLIENT_RECIPIENT_USER_NOT_FOUND');
    (error as any).code = 'CLIENT_RECIPIENT_USER_NOT_FOUND';
    throw error;
  }

  const insertResult = await pool.query(
    `
      INSERT INTO public.client_notification_recipients (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id;
    `,
    [userId],
  );

  const recipientId = Number(insertResult.rows[0]?.id);
  const result = await pool.query(
    `
      SELECT r.id, r.user_id, u.full_name, u.email
      FROM public.client_notification_recipients r
      INNER JOIN public.users u ON u.id = r.user_id
      WHERE r.id = $1
      LIMIT 1;
    `,
    [recipientId],
  );

  const row = result.rows[0];
  return row ? mapRecipientRow(row) : null;
};

export const removeClientNotificationRecipient = async (recipientId: number): Promise<boolean> => {
  const result = await pool.query('DELETE FROM public.client_notification_recipients WHERE id = $1;', [
    recipientId,
  ]);
  return (result.rowCount ?? 0) > 0;
};
