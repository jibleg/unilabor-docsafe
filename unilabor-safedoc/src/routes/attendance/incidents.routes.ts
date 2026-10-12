import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware';
import { uploadImportWorkbook, uploadIncidentFiles } from '../../middlewares/attendance-upload.middleware';
import * as controller from '../../controllers/attendance/incidents.controller';

/**
 * Incidencias, comprobantes, justificacion de faltas e importacion Excel.
 * Montado bajo /api/attendance (con verifyToken). Las rutas fijas (template,
 * import) van antes de /incidents/:id. La validacion con Zod de los cuerpos
 * (JSON o multipart) ocurre en el controlador.
 */
const router = Router();

const read = requirePermission('ATTENDANCE.RECORDS.READ');
const authorize = requirePermission('ATTENDANCE.INCIDENTS.AUTHORIZE');

router.get('/incidents', read, controller.list);
router.post('/incidents', authorize, uploadIncidentFiles, controller.create);

router.get('/incidents/template', authorize, controller.template);
router.post('/incidents/import/simulate', authorize, uploadImportWorkbook, controller.simulateImport);
router.post('/incidents/import', authorize, uploadImportWorkbook, controller.runImport);

router.get('/incidents/:id', read, controller.detail);
router.post('/incidents/:id/authorize', authorize, controller.authorize);
router.post('/incidents/:id/reject', authorize, controller.reject);
router.post('/incidents/:id/cancel', authorize, controller.cancel);

router.get('/incidents/:id/attachments/:attachmentId', read, controller.downloadAttachment);
router.post('/incidents/:id/attachments', authorize, uploadIncidentFiles, controller.addAttachments);
router.delete('/incidents/:id/attachments/:attachmentId', authorize, controller.removeAttachment);

router.post('/days/:employeeId/:date/justify', authorize, uploadIncidentFiles, controller.justify);

export default router;
