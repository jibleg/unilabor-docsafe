import type { Request, Response } from 'express';
import { parseQuery } from '../../schemas/attendance/boards.schema';
import {
  commitmentQuerySchema, daysExportQuerySchema, overtimeExportQuerySchema,
} from '../../schemas/attendance/exports.schema';
import { buildCommitmentPdf } from '../../services/attendance/commitment-report-pdf.service';
import {
  buildCommitmentWorkbook, buildDaysWorkbook, buildOvertimeWorkbook, workbookToBuffer, type ExcelExport,
} from '../../services/attendance/exports.service';
import type { CommitmentFilters } from '../../services/attendance/board-commitment.service';
import { handleAttendanceError } from './attendance-http';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const sendFile = (res: Response, buffer: Buffer, fileName: string, contentType: string): Response => {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).end(buffer);
};

const sendWorkbook = async (res: Response, built: ExcelExport): Promise<Response> =>
  sendFile(res, await workbookToBuffer(built.workbook), built.fileName, XLSX_TYPE);

const commitmentFilters = (req: Request): CommitmentFilters => {
  const query = parseQuery(commitmentQuerySchema, req.query);
  return {
    period: query.period, anchor: query.anchor, from: query.from, to: query.to,
    branchId: query.branch_id, employeeId: query.employee_id,
  };
};

export const exportCommitment = async (req: Request, res: Response) => {
  try {
    return await sendWorkbook(res, await buildCommitmentWorkbook(commitmentFilters(req)));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo exportar el compromiso');
  }
};

export const exportDays = async (req: Request, res: Response) => {
  try {
    const query = parseQuery(daysExportQuerySchema, req.query);
    return await sendWorkbook(
      res,
      await buildDaysWorkbook({
        from: query.from, to: query.to, result: query.result, branchId: query.branch_id, employeeId: query.employee_id,
      }),
    );
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron exportar los dias');
  }
};

export const exportOvertime = async (req: Request, res: Response) => {
  try {
    const query = parseQuery(overtimeExportQuerySchema, req.query);
    return await sendWorkbook(
      res,
      await buildOvertimeWorkbook({ from: query.from, to: query.to, branchId: query.branch_id }),
    );
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron exportar las horas extra');
  }
};

export const reportCommitmentPdf = async (req: Request, res: Response) => {
  try {
    const { buffer, fileName } = await buildCommitmentPdf(commitmentFilters(req));
    return sendFile(res, buffer, fileName, 'application/pdf');
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo generar el reporte PDF');
  }
};
