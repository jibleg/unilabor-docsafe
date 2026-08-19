import { Router } from 'express';
import {
  createProviderContactController,
  createProviderController,
  createProviderDocumentCategoryController,
  deactivateProviderController,
  deactivateProviderDocumentCategoryController,
  deleteProviderContactController,
  deleteProviderDocumentCategoryController,
  listProviderContactsController,
  listProviderDocumentCategoriesController,
  listProvidersController,
  updateProviderContactController,
  updateProviderController,
  updateProviderDocumentCategoryController,
} from '../controllers/provider-catalog.controller';
import {
  getProviderDocumentController,
  listProviderDocumentsController,
  replaceProviderDocumentController,
  uploadProviderDocumentController,
  viewProviderDocumentController,
} from '../controllers/provider-document.controller';
import {
  addProviderNotificationRecipientController,
  listProviderNotificationRecipientsController,
  removeProviderNotificationRecipientController,
} from '../controllers/provider-config.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { uploadProviderDocument } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  providerContactSchema,
  providerDocumentCategorySchema,
  providerNotificationRecipientSchema,
  providerSchema,
  replaceProviderDocumentSchema,
  uploadProviderDocumentSchema,
} from '../schemas/provider.schema';

const router = Router();

router.use(verifyToken);

const catalogRead = requirePermission('PROVIDERS.CATALOG.READ');
const catalogManage = requirePermission('PROVIDERS.CATALOG.MANAGE');
const documentsRead = requirePermission('PROVIDERS.DOCUMENTS.READ');
const documentsWrite = requirePermission('PROVIDERS.DOCUMENTS.WRITE');
const configManage = requirePermission('PROVIDERS.CONFIG.MANAGE');

// --- Catalogo: proveedores (mismo helpdesk_suppliers que usa Activos) ------
router.get('/catalog/providers', catalogRead, listProvidersController);
router.post('/catalog/providers', catalogManage, validate(providerSchema), createProviderController);
router.patch('/catalog/providers/:id', catalogManage, validate(providerSchema), updateProviderController);
router.post('/catalog/providers/:id/deactivate', catalogManage, deactivateProviderController);

// --- Catalogo: contactos del proveedor --------------------------------------
router.get('/catalog/providers/:id/contacts', catalogRead, listProviderContactsController);
router.post(
  '/catalog/providers/:id/contacts',
  catalogManage,
  validate(providerContactSchema),
  createProviderContactController,
);
router.patch(
  '/catalog/contacts/:id',
  catalogManage,
  validate(providerContactSchema),
  updateProviderContactController,
);
router.delete('/catalog/contacts/:id', catalogManage, deleteProviderContactController);

// --- Catalogo: categorias de documento --------------------------------------
router.get('/catalog/categories', catalogRead, listProviderDocumentCategoriesController);
router.post(
  '/catalog/categories',
  catalogManage,
  validate(providerDocumentCategorySchema),
  createProviderDocumentCategoryController,
);
router.patch(
  '/catalog/categories/:id',
  catalogManage,
  validate(providerDocumentCategorySchema),
  updateProviderDocumentCategoryController,
);
router.post('/catalog/categories/:id/deactivate', catalogManage, deactivateProviderDocumentCategoryController);
router.delete('/catalog/categories/:id', catalogManage, deleteProviderDocumentCategoryController);

// --- Configuracion: destinatarios de alerta de vencimiento -------------------
router.get('/config/recipients', configManage, listProviderNotificationRecipientsController);
router.post(
  '/config/recipients',
  configManage,
  validate(providerNotificationRecipientSchema),
  addProviderNotificationRecipientController,
);
router.delete('/config/recipients/:id', configManage, removeProviderNotificationRecipientController);

// --- Documentos: por proveedor -----------------------------------------------
router.get('/:providerId/documents', documentsRead, listProviderDocumentsController);
router.post(
  '/:providerId/documents',
  documentsWrite,
  uploadProviderDocument.single('file'),
  validate(uploadProviderDocumentSchema),
  uploadProviderDocumentController,
);

// --- Documentos: por id (vigencia/derogacion) --------------------------------
router.get('/documents/:id/view', documentsRead, viewProviderDocumentController);
router.get('/documents/:id', documentsRead, getProviderDocumentController);
router.patch(
  '/documents/:id/replace',
  documentsWrite,
  uploadProviderDocument.single('file'),
  validate(replaceProviderDocumentSchema),
  replaceProviderDocumentController,
);

export default router;
