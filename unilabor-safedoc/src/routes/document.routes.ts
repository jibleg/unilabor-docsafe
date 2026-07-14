import { Router } from 'express';
import {
  deleteDocument,
  getAllDocuments,
  getCategories,
  getDocumentStats,
  replaceDocumentFile,
  searchDocuments,
  toggleDocumentStatus,
  updateDocumentMetadata,
  uploadDocument,
  viewDocument,
} from '../controllers/document.controller';
import { verifyToken, requirePermission } from '../middlewares/auth.middleware';
import { upload as uploadMiddleware } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  replaceDocumentFileSchema,
  updateDocumentMetadataSchema,
  updateDocumentStatusSchema,
  uploadDocumentSchema,
} from '../schemas/document.schema';

const router = Router();

// Categorias disponibles para el usuario autenticado
router.get('/categories', verifyToken, requirePermission('QUALITY.CATEGORIES.READ'), getCategories);

// Subida: requiere escritura de documentos
router.post('/upload', verifyToken, requirePermission('QUALITY.DOCUMENTS.WRITE'), uploadMiddleware.single('file'), validate(uploadDocumentSchema), uploadDocument);

// Listado de documentos con filtro por rol/categoria
router.get('/', verifyToken, requirePermission('QUALITY.DOCUMENTS.READ'), getAllDocuments);

// Busqueda filtrada de documentos
router.get('/search', verifyToken, requirePermission('QUALITY.DOCUMENTS.READ'), searchDocuments);

// Estadisticas por estado (para tarjetas de resumen)
router.get('/stats', verifyToken, requirePermission('QUALITY.DOCUMENTS.READ'), getDocumentStats);

// Visualizacion segura de PDF
router.get('/view/:filename', verifyToken, requirePermission('QUALITY.DOCUMENTS.READ'), viewDocument);

// Gestion de estado del documento: requiere escritura
router.patch('/status/:id', verifyToken, requirePermission('QUALITY.DOCUMENTS.WRITE'), validate(updateDocumentStatusSchema), toggleDocumentStatus);

// Reemplazo versionado del PDF: el actual queda derogado y se crea una nueva version vigente
router.patch(
  '/:id/replace',
  verifyToken,
  requirePermission('QUALITY.DOCUMENTS.WRITE'),
  uploadMiddleware.single('file'),
  validate(replaceDocumentFileSchema),
  replaceDocumentFile
);

// Edicion de metadata de documento: requiere escritura
router.patch('/:id', verifyToken, requirePermission('QUALITY.DOCUMENTS.WRITE'), validate(updateDocumentMetadataSchema), updateDocumentMetadata);

// Eliminacion de documento: requiere escritura
router.delete('/:id', verifyToken, requirePermission('QUALITY.DOCUMENTS.WRITE'), deleteDocument);

export default router;
