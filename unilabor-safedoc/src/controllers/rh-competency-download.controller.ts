import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  listDownloadableCompetencyEvaluations,
  streamCompetencyEvaluationsDownload,
} from '../services/rh-competency-download.service';
import type { DownloadCompetencyEvaluationsBody } from '../schemas/rh-competency-evaluation.schema';

// Descarga del REH-REG-003 firmado (pedido de los auditores de la ema).
// Cada PDF entregado queda en access_logs igual que una consulta del expediente.
export const downloadCompetencyEvaluationsController = async (req: AuthRequest, res: Response) => {
  const body = req.body as DownloadCompetencyEvaluationsBody;
  const user = req.user;
  if (!user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  try {
    const rows = await listDownloadableCompetencyEvaluations(body.ids);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Ninguna de las evaluaciones elegidas esta cerrada con su REH-REG-003 archivado.' });
    }
    const { delivered } = await streamCompetencyEvaluationsDownload(res, rows);
    await Promise.all(
      delivered.map((row) =>
        registerAuditEvent({
          user_id: user.id,
          action: `RH_DOCUMENT_DOWNLOAD:${row.document_id}`,
          ip_address: req.ip ?? null,
          module_code: 'RH',
          entity_type: 'competency_evaluation',
          entity_id: row.evaluation_id,
          employee_id: row.employee_id,
          document_id: row.document_id,
          metadata: { form_code: 'REH-REG-003', file_name: row.file_name, batch_size: delivered.length },
        }),
      ),
    );
    return res;
  } catch (error) {
    if (res.headersSent) return res.end();
    const coded = error as { code?: string; publicMessage?: string };
    if (coded.code === 'RH_COMP_EVAL_PDF_FILES_MISSING') {
      return res.status(404).json({ message: coded.publicMessage });
    }
    console.error('Error descargando REH-REG-003:', error);
    return res.status(500).json({ message: 'No se pudo preparar la descarga.' });
  }
};
