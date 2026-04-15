import { Router } from 'express';
import {
  deleteDocument,
  getAllDocuments,
  getCategories,
  replaceDocumentFile,
  searchDocuments,
  toggleDocumentStatus,
  updateDocumentMetadata,
  uploadDocument,
  viewDocument,
} from '../controllers/document.controller';
import { verifyToken, authorize } from '../middlewares/auth.middleware';
import { upload as uploadMiddleware } from '../middlewares/upload.middleware';

const router = Router();

// Categorias disponibles para el usuario autenticado
router.get('/categories', verifyToken, getCategories);

// Subida: solo ADMIN y EDITOR
router.post('/upload', verifyToken, authorize(['ADMIN', 'EDITOR']), uploadMiddleware.single('file'), uploadDocument);

// Listado de documentos con filtro por rol/categoria
router.get('/', verifyToken, getAllDocuments);

// Busqueda filtrada de documentos
router.get('/search', verifyToken, searchDocuments);

// Visualizacion segura de PDF
router.get('/view/:filename', verifyToken, viewDocument);

// Gestion de estado del documento: solo ADMIN y EDITOR
router.patch('/status/:id', verifyToken, authorize(['ADMIN', 'EDITOR']), toggleDocumentStatus);

// Reemplazo versionado del PDF: el actual queda derogado y se crea una nueva version vigente
router.patch(
  '/:id/replace',
  verifyToken,
  authorize(['ADMIN', 'EDITOR']),
  uploadMiddleware.single('file'),
  replaceDocumentFile
);

// Edicion de metadata de documento: solo ADMIN y EDITOR
router.patch('/:id', verifyToken, authorize(['ADMIN', 'EDITOR']), updateDocumentMetadata);

// Eliminacion de documento: solo ADMIN y EDITOR
router.delete('/:id', verifyToken, authorize(['ADMIN', 'EDITOR']), deleteDocument);

export default router;
