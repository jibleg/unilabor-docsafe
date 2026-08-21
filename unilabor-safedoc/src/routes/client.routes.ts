import { Router } from 'express';
import {
  createClientContactController,
  createClientController,
  createClientDocumentCategoryController,
  deactivateClientController,
  deactivateClientDocumentCategoryController,
  deleteClientContactController,
  deleteClientDocumentCategoryController,
  listClientContactsController,
  listClientDocumentCategoriesController,
  listClientsController,
  updateClientContactController,
  updateClientController,
  updateClientDocumentCategoryController,
} from '../controllers/client-catalog.controller';
import {
  deactivateClientDocumentController,
  deleteClientDocumentController,
  getClientDocumentController,
  listClientDocumentsController,
  replaceClientDocumentController,
  uploadClientDocumentController,
  viewClientDocumentController,
} from '../controllers/client-document.controller';
import {
  addClientNotificationRecipientController,
  listClientNotificationRecipientsController,
  removeClientNotificationRecipientController,
} from '../controllers/client-config.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { uploadClientDocument } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  clientContactSchema,
  clientDocumentCategorySchema,
  clientNotificationRecipientSchema,
  clientSchema,
  replaceClientDocumentSchema,
  uploadClientDocumentSchema,
} from '../schemas/client.schema';

const router = Router();

router.use(verifyToken);

const catalogRead = requirePermission('PROVIDERS.CLIENTS.CATALOG.READ');
const catalogManage = requirePermission('PROVIDERS.CLIENTS.CATALOG.MANAGE');
const documentsRead = requirePermission('PROVIDERS.CLIENTS.DOCUMENTS.READ');
const documentsWrite = requirePermission('PROVIDERS.CLIENTS.DOCUMENTS.WRITE');
const configManage = requirePermission('PROVIDERS.CLIENTS.CONFIG.MANAGE');

// --- Catalogo: clientes (tabla propia, sin compartir con Activos) -----------
router.get('/catalog/clients', catalogRead, listClientsController);
router.post('/catalog/clients', catalogManage, validate(clientSchema), createClientController);
router.patch('/catalog/clients/:id', catalogManage, validate(clientSchema), updateClientController);
router.post('/catalog/clients/:id/deactivate', catalogManage, deactivateClientController);

// --- Catalogo: contactos del cliente -----------------------------------------
router.get('/catalog/clients/:id/contacts', catalogRead, listClientContactsController);
router.post(
  '/catalog/clients/:id/contacts',
  catalogManage,
  validate(clientContactSchema),
  createClientContactController,
);
router.patch(
  '/catalog/contacts/:id',
  catalogManage,
  validate(clientContactSchema),
  updateClientContactController,
);
router.delete('/catalog/contacts/:id', catalogManage, deleteClientContactController);

// --- Catalogo: categorias de documento --------------------------------------
router.get('/catalog/categories', catalogRead, listClientDocumentCategoriesController);
router.post(
  '/catalog/categories',
  catalogManage,
  validate(clientDocumentCategorySchema),
  createClientDocumentCategoryController,
);
router.patch(
  '/catalog/categories/:id',
  catalogManage,
  validate(clientDocumentCategorySchema),
  updateClientDocumentCategoryController,
);
router.post('/catalog/categories/:id/deactivate', catalogManage, deactivateClientDocumentCategoryController);
router.delete('/catalog/categories/:id', catalogManage, deleteClientDocumentCategoryController);

// --- Configuracion: destinatarios de alerta de vencimiento -------------------
router.get('/config/recipients', configManage, listClientNotificationRecipientsController);
router.post(
  '/config/recipients',
  configManage,
  validate(clientNotificationRecipientSchema),
  addClientNotificationRecipientController,
);
router.delete('/config/recipients/:id', configManage, removeClientNotificationRecipientController);

// --- Documentos: por cliente --------------------------------------------------
router.get('/:clientId/documents', documentsRead, listClientDocumentsController);
router.post(
  '/:clientId/documents',
  documentsWrite,
  uploadClientDocument.single('file'),
  validate(uploadClientDocumentSchema),
  uploadClientDocumentController,
);

// --- Documentos: por id (vigencia/derogacion) --------------------------------
router.get('/documents/:id/view', documentsRead, viewClientDocumentController);
router.get('/documents/:id', documentsRead, getClientDocumentController);
router.patch(
  '/documents/:id/replace',
  documentsWrite,
  uploadClientDocument.single('file'),
  validate(replaceClientDocumentSchema),
  replaceClientDocumentController,
);
router.post('/documents/:id/deactivate', documentsWrite, deactivateClientDocumentController);
router.delete('/documents/:id', documentsWrite, deleteClientDocumentController);

export default router;
