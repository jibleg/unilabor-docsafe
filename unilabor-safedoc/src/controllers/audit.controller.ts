import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';

// Usamos RequestHandler de forma implícita definiendo los tipos
export const getAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const query = `
    SELECT l.accessed_at, u.full_name, u.email, d.title as document, l.action, l.ip_address
    FROM access_logs l
    JOIN users u ON l.user_id = u.id
    LEFT JOIN documents d ON l.document_id = d.id
    ORDER BY l.accessed_at DESC LIMIT 100;
  `;
  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en logs:', error);
    res.status(500).json({ message: 'Error al obtener logs' });
  }
};