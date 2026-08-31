import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  buildCertificatePreviewPdf,
  getCertificateTemplate,
  upsertCertificateTemplate,
  type CertificateTemplatePayload,
} from '../services/certificate-template.service';

const parseId = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const mapError = (res: Response, error: any): Response | null => {
  if (error?.code === 'TRAINING_COURSE_NOT_FOUND') {
    return res.status(404).json({ message: 'La capacitacion indicada no existe.' });
  }
  return null;
};

export const getCertificateTemplateController = async (req: AuthRequest, res: Response) => {
  const courseId = parseId(req.params.courseId);
  if (!courseId) {
    return res.status(400).json({ message: 'ID de capacitacion invalido.' });
  }
  try {
    const template = await getCertificateTemplate(courseId);
    return res.json({ template });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error obteniendo plantilla de constancia:', error);
    return res.status(500).json({ message: 'No se pudo obtener la plantilla de constancia.' });
  }
};

export const upsertCertificateTemplateController = async (req: AuthRequest, res: Response) => {
  const courseId = parseId(req.params.courseId);
  if (!courseId) {
    return res.status(400).json({ message: 'ID de capacitacion invalido.' });
  }
  try {
    const template = await upsertCertificateTemplate(courseId, req.body as CertificateTemplatePayload);
    await registerAuditEvent({
      user_id: req.user?.id ?? null,
      action: `RH_CERT_TEMPLATE_SAVE:${courseId}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'certificate_template',
      entity_id: courseId,
    });
    return res.json({ message: 'Plantilla de constancia guardada correctamente.', template });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error guardando plantilla de constancia:', error);
    return res.status(500).json({ message: 'No se pudo guardar la plantilla de constancia.' });
  }
};

export const uploadCertificateImageController = async (req: AuthRequest, res: Response) => {
  const file = (req as any).file as { path?: string } | undefined;
  if (!file?.path) {
    return res.status(400).json({ message: 'No se recibio ninguna imagen.' });
  }
  // Ruta relativa al cwd para que el motor de render la resuelva en cualquier entorno.
  const relativePath = file.path.replace(`${process.cwd()}/`, '');
  return res.status(201).json({ message: 'Imagen cargada.', path: relativePath });
};

export const previewCertificateController = async (req: AuthRequest, res: Response) => {
  const courseId = parseId(req.params.courseId);
  if (!courseId) {
    return res.status(400).json({ message: 'ID de capacitacion invalido.' });
  }
  try {
    const pdf = await buildCertificatePreviewPdf(courseId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="constancia-preliminar.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(pdf);
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error generando preliminar de constancia:', error);
    return res.status(500).json({ message: 'No se pudo generar el preliminar.' });
  }
};
