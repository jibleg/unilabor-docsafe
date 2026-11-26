import { createReadStream } from 'fs';
import archiver from 'archiver';
import type { Response } from 'express';
import pool from '../config/db';
import { resolveStoredDocumentPath } from './document.service';

// Descarga del REH-REG-003 firmado (el PDF archivado en el expediente al
// cerrar la evaluacion). Pedido de los auditores de la ema (26-nov-2026):
// una evaluacion sola baja como PDF; varias, como un ZIP con un PDF por
// evaluacion. Solo salen evaluaciones CERRADAS con documento archivado; las
// demas se ignoran en silencio porque la pantalla no permite elegirlas.

export interface DownloadableCompetencyEvaluation {
  evaluation_id: number;
  employee_id: number;
  employee_code: string;
  employee_name: string;
  position_name: string;
  document_id: number;
  file_path: string;
  /** Nombre del archivo dentro del ZIP (o del PDF suelto). */
  file_name: string;
}

const MAX_DOWNLOAD_IDS = 500;

/** Nombre seguro para archivo: sin acentos, sin separadores de ruta, longitud acotada. */
const toSafeFileName = (value: string, maxLength = 80): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 _.()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

export const buildCompetencyFileName = (row: {
  evaluation_id: number;
  employee_code: string;
  employee_name: string;
  position_name: string;
}): string => {
  const folio = String(row.evaluation_id).padStart(5, '0');
  const person = toSafeFileName(`${row.employee_code} ${row.employee_name}`, 60);
  const position = toSafeFileName(row.position_name, 40);
  return `REH-REG-003-${folio} - ${person} - ${position}.pdf`;
};

/** Evaluaciones cerradas y con PDF archivado, en el orden de la lista (colaborador, fecha). */
export const listDownloadableCompetencyEvaluations = async (
  ids: number[],
): Promise<DownloadableCompetencyEvaluation[]> => {
  const unique = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0))).slice(0, MAX_DOWNLOAD_IDS);
  if (unique.length === 0) return [];
  const result = await pool.query(
    `SELECT ev.id AS evaluation_id, ev.employee_id, e.employee_code, e.full_name AS employee_name,
            p.name AS position_name, ed.id AS document_id, ed.file_path
       FROM public.rh_competency_evaluations ev
       JOIN public.employees e ON e.id = ev.employee_id
       JOIN public.rh_positions p ON p.id = ev.position_id
       JOIN public.employee_documents ed ON ed.id = ev.document_id
      WHERE ev.id = ANY($1::bigint[]) AND ev.status = 'CLOSED'
      ORDER BY e.full_name ASC, ev.evaluation_date ASC, ev.id ASC;`,
    [unique],
  );
  return result.rows.map((row) => {
    const base = {
      evaluation_id: Number(row.evaluation_id),
      employee_code: String(row.employee_code ?? ''),
      employee_name: String(row.employee_name ?? ''),
      position_name: String(row.position_name ?? ''),
    };
    return {
      ...base,
      employee_id: Number(row.employee_id),
      document_id: Number(row.document_id),
      file_path: String(row.file_path),
      file_name: buildCompetencyFileName(base),
    };
  });
};

const zipFileName = (): string => {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `REH-REG-003 Evaluaciones de competencia ${stamp}.zip`;
};

const attachmentHeaders = (res: Response, fileName: string, contentType: string): void => {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

/**
 * Escribe la descarga en la respuesta: un PDF suelto cuando es una sola
 * evaluacion, un ZIP cuando son varias. Devuelve los archivos que faltaron en
 * disco (se anotan en el ZIP como FALTANTES.txt para que la entrega sea honesta).
 */
export const streamCompetencyEvaluationsDownload = async (
  res: Response,
  rows: DownloadableCompetencyEvaluation[],
): Promise<{ delivered: DownloadableCompetencyEvaluation[]; missing: DownloadableCompetencyEvaluation[] }> => {
  // resolveStoredDocumentPath lanza FILE_NOT_FOUND cuando el archivo no esta en disco:
  // aqui eso es una fila faltante, no un error de la descarga.
  const located = rows.map((row) => {
    try {
      return { row, absolutePath: resolveStoredDocumentPath(row.file_path) };
    } catch {
      return { row, absolutePath: null };
    }
  });
  const delivered = located.filter((item): item is { row: DownloadableCompetencyEvaluation; absolutePath: string } => item.absolutePath !== null);
  const missing = located.filter((item) => item.absolutePath === null).map((item) => item.row);

  if (delivered.length === 0) {
    const error = new Error('RH_COMP_EVAL_PDF_FILES_MISSING') as Error & { code: string; publicMessage: string };
    error.code = 'RH_COMP_EVAL_PDF_FILES_MISSING';
    error.publicMessage =
      missing.length === 1
        ? `El PDF archivado de ${missing[0]!.file_name} no esta disponible en este servidor.`
        : `Ninguno de los ${missing.length} PDF archivados esta disponible en este servidor.`;
    throw error;
  }

  if (delivered.length === 1 && missing.length === 0) {
    const only = delivered[0]!;
    attachmentHeaders(res, only.row.file_name, 'application/pdf');
    await new Promise<void>((resolve, reject) => {
      createReadStream(only.absolutePath).on('error', reject).on('end', resolve).pipe(res);
    });
    return { delivered: [only.row], missing };
  }

  attachmentHeaders(res, zipFileName(), 'application/zip');
  const archive = archiver('zip', { zlib: { level: 6 } });
  const finished = new Promise<void>((resolve, reject) => {
    res.on('finish', resolve);
    res.on('close', resolve);
    archive.on('error', reject);
    archive.on('warning', (error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') reject(error);
    });
  });
  archive.pipe(res);
  for (const item of delivered) {
    archive.file(item.absolutePath, { name: item.row.file_name });
  }
  if (missing.length > 0) {
    const lines = [
      'Evaluaciones cerradas cuyo PDF archivado no se encontro en el servidor:',
      ...missing.map((row) => `- ${row.file_name} (documento ${row.document_id})`),
    ];
    archive.append(lines.join('\n'), { name: 'FALTANTES.txt' });
  }
  await archive.finalize();
  await finished;
  return { delivered: delivered.map((item) => item.row), missing };
};
