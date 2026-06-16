import type {
  HelpdeskAssetPayload,
  HelpdeskTicketPayload,
  HelpdeskTicketSolutionPayload,
  HelpdeskTicketReturnPayload,
  HelpdeskTicketIsoRiskPayload,
  HelpdeskTicketTechnicalReleasePayload,
  HelpdeskCatalogAdminPayload,
  HelpdeskMaintenancePlanPayload,
  HelpdeskMaintenanceOrderReschedulePayload,
  HelpdeskMaintenanceOrderClosePayload,
  EmployeeDocumentAccessPayload,
  DocumentSectionPayload,
  EmployeeAlertsFilters,
  EmployeeDocumentPayload,
  DocumentTypePayload,
  ListDocumentsOptions,
  UpdateDocumentPayload,
  PageQuery,
  PageResult,
} from './service.shared';
import api from './axios';
import type {
  AuditLog,
  Category,
  Document,
  DocumentSection,
  DocumentStats,
  DocumentStatus,
  DocumentType,
  Employee,
  EmployeeAlert,
  EmployeeAlertsSummary,
  EmployeeDocument,
  EmployeeDocumentAccessResponse,
  EmployeeExpedient,
  HelpdeskAsset,
  HelpdeskCatalogAdminItem,
  HelpdeskCatalogAdminKey,
  HelpdeskCatalogAdminResponse,
  HelpdeskDashboardMetrics,
  HelpdeskAssetSummary,
  HelpdeskCatalogs,
  HelpdeskTicket,
  HelpdeskTicketCatalogs,
  HelpdeskTicketStats,
  HelpdeskMaintenanceCatalogs,
  HelpdeskMaintenancePlan,
  HelpdeskMaintenanceOrder,
  LinkableUser,
} from '../types/models';
import {
  asRecord,
  unwrapPayload,
  getArrayFromPayload,
  extractPagination,
  buildPageParams,
} from './service.shared';
import {
  normalizeLinkableUser,
  normalizeEmployee,
  normalizeHelpdeskAsset,
  normalizeHelpdeskSummary,
  normalizeHelpdeskTicketStats,
  normalizeHelpdeskDashboardMetrics,
  normalizeHelpdeskCatalogs,
  normalizeHelpdeskTicketCatalogs,
  normalizeHelpdeskTicket,
  normalizeMaintenanceCatalogs,
  normalizeHelpdeskCatalogAdminItem,
  normalizeHelpdeskCatalogAdminResponse,
  normalizeMaintenanceOrder,
  normalizeMaintenancePlan,
} from './service.normalizers';
import {
  normalizeDocumentSection,
  normalizeDocumentType,
  normalizeEmployeeDocument,
  normalizeEmployeeExpedient,
  normalizeNumericArray,
  normalizeEmployeeDocumentAccessResponse,
  normalizeEmployeeAlert,
  normalizeEmployeeAlertsSummary,
  normalizeDocument,
  normalizeAuditLog,
  normalizeCategory,
} from './service.parsers';

export const getHelpdeskSummary = async (): Promise<HelpdeskAssetSummary> => {
  const response = await api.get('/helpdesk/summary');
  const payload = unwrapPayload(response.data);
  return normalizeHelpdeskSummary(asRecord(payload)?.summary ?? payload);
};

export const getHelpdeskDashboard = async (): Promise<HelpdeskDashboardMetrics> => {
  const response = await api.get('/helpdesk/dashboard');
  const payload = unwrapPayload(response.data);
  return normalizeHelpdeskDashboardMetrics(asRecord(payload)?.dashboard ?? payload);
};

export const listHelpdeskCatalogs = async (): Promise<HelpdeskCatalogs> => {
  const response = await api.get('/helpdesk/catalogs');
  const payload = asRecord(unwrapPayload(response.data));
  return normalizeHelpdeskCatalogs(payload?.catalogs ?? payload);
};

export const listHelpdeskAssets = async (): Promise<HelpdeskAsset[]> => {
  const response = await api.get('/helpdesk/assets');
  return getArrayFromPayload(response.data, ['assets', 'items', 'results'])
    .map(normalizeHelpdeskAsset)
    .filter((asset): asset is HelpdeskAsset => asset !== null);
};

export const listHelpdeskAssetsPaginated = async (
  query: PageQuery = {},
): Promise<PageResult<HelpdeskAsset>> => {
  const response = await api.get('/helpdesk/assets', { params: buildPageParams(query) });
  const data = getArrayFromPayload(response.data, ['assets', 'items', 'results'])
    .map(normalizeHelpdeskAsset)
    .filter((asset): asset is HelpdeskAsset => asset !== null);
  return { data, pagination: extractPagination(response.data, data.length) };
};

export const listMyHelpdeskAssets = async (): Promise<{ employee: Employee | null; assets: HelpdeskAsset[] }> => {
  const response = await api.get('/helpdesk/me/assets');
  const payload = asRecord(unwrapPayload(response.data));

  return {
    employee: normalizeEmployee(payload?.employee),
    assets: getArrayFromPayload(payload?.assets ?? [], ['assets'])
      .map(normalizeHelpdeskAsset)
      .filter((asset): asset is HelpdeskAsset => asset !== null),
  };
};

export const fetchHelpdeskAssetById = async (assetId: number): Promise<HelpdeskAsset | null> => {
  const response = await api.get(`/helpdesk/assets/${assetId}`);
  const payload = unwrapPayload(response.data);
  return normalizeHelpdeskAsset(asRecord(payload)?.asset ?? payload);
};

export const createHelpdeskAsset = async (payload: HelpdeskAssetPayload): Promise<HelpdeskAsset> => {
  const response = await api.post('/helpdesk/assets', payload);
  const parsed = normalizeHelpdeskAsset(asRecord(unwrapPayload(response.data))?.asset ?? unwrapPayload(response.data));
  if (!parsed) {
    throw new Error('No se pudo interpretar el activo creado');
  }
  return parsed;
};

export const updateHelpdeskAssetById = async (
  assetId: number,
  payload: HelpdeskAssetPayload,
): Promise<HelpdeskAsset | null> => {
  const response = await api.patch(`/helpdesk/assets/${assetId}`, payload);
  return normalizeHelpdeskAsset(asRecord(unwrapPayload(response.data))?.asset ?? unwrapPayload(response.data));
};

export const deleteHelpdeskAssetById = async (assetId: number): Promise<void> => {
  await api.delete(`/helpdesk/assets/${assetId}`);
};

export const listHelpdeskTicketCatalogs = async (): Promise<HelpdeskTicketCatalogs> => {
  const response = await api.get('/helpdesk/ticket-catalogs');
  const payload = asRecord(unwrapPayload(response.data));
  return normalizeHelpdeskTicketCatalogs(payload?.catalogs ?? payload);
};

export const listHelpdeskTickets = async (): Promise<HelpdeskTicket[]> => {
  const response = await api.get('/helpdesk/tickets');
  return getArrayFromPayload(response.data, ['tickets', 'items', 'results'])
    .map(normalizeHelpdeskTicket)
    .filter((ticket): ticket is HelpdeskTicket => ticket !== null);
};

export const listHelpdeskTicketsPaginated = async (
  query: PageQuery = {},
): Promise<PageResult<HelpdeskTicket>> => {
  const response = await api.get('/helpdesk/tickets', { params: buildPageParams(query) });
  const data = getArrayFromPayload(response.data, ['tickets', 'items', 'results'])
    .map(normalizeHelpdeskTicket)
    .filter((ticket): ticket is HelpdeskTicket => ticket !== null);
  return { data, pagination: extractPagination(response.data, data.length) };
};

export const getHelpdeskTicketStats = async (): Promise<HelpdeskTicketStats> => {
  const response = await api.get('/helpdesk/tickets/summary');
  const payload = unwrapPayload(response.data);
  return normalizeHelpdeskTicketStats(asRecord(payload)?.summary ?? payload);
};

export const listMyHelpdeskTickets = async (): Promise<HelpdeskTicket[]> => {
  const response = await api.get('/helpdesk/me/tickets');
  return getArrayFromPayload(response.data, ['tickets', 'items', 'results'])
    .map(normalizeHelpdeskTicket)
    .filter((ticket): ticket is HelpdeskTicket => ticket !== null);
};

export const fetchMyHelpdeskTicketById = async (ticketId: number): Promise<HelpdeskTicket | null> => {
  const response = await api.get(`/helpdesk/me/tickets/${ticketId}`);
  const payload = unwrapPayload(response.data);
  return normalizeHelpdeskTicket(asRecord(payload)?.ticket ?? payload);
};

export const fetchHelpdeskTicketById = async (ticketId: number): Promise<HelpdeskTicket | null> => {
  const response = await api.get(`/helpdesk/tickets/${ticketId}`);
  const payload = unwrapPayload(response.data);
  return normalizeHelpdeskTicket(asRecord(payload)?.ticket ?? payload);
};

export const createHelpdeskTicket = async (payload: HelpdeskTicketPayload): Promise<HelpdeskTicket> => {
  const response = await api.post('/helpdesk/tickets', payload);
  const parsed = normalizeHelpdeskTicket(asRecord(unwrapPayload(response.data))?.ticket ?? unwrapPayload(response.data));
  if (!parsed) {
    throw new Error('No se pudo interpretar la solicitud creada');
  }
  return parsed;
};

export const createMyHelpdeskTicket = async (payload: HelpdeskTicketPayload): Promise<HelpdeskTicket> => {
  const response = await api.post('/helpdesk/me/tickets', payload);
  const parsed = normalizeHelpdeskTicket(asRecord(unwrapPayload(response.data))?.ticket ?? unwrapPayload(response.data));
  if (!parsed) {
    throw new Error('No se pudo interpretar la solicitud creada');
  }
  return parsed;
};

export const updateHelpdeskTicketById = async (
  ticketId: number,
  payload: HelpdeskTicketPayload,
): Promise<HelpdeskTicket | null> => {
  const response = await api.patch(`/helpdesk/tickets/${ticketId}`, payload);
  return normalizeHelpdeskTicket(asRecord(unwrapPayload(response.data))?.ticket ?? unwrapPayload(response.data));
};

export const addHelpdeskTicketComment = async (
  ticketId: number,
  comment: string,
  isInternal = false,
): Promise<HelpdeskTicket | null> => {
  const response = await api.post(`/helpdesk/tickets/${ticketId}/comments`, {
    comment,
    is_internal: isInternal,
  });
  return normalizeHelpdeskTicket(asRecord(unwrapPayload(response.data))?.ticket ?? unwrapPayload(response.data));
};

export const addMyHelpdeskTicketComment = async (
  ticketId: number,
  comment: string,
): Promise<HelpdeskTicket | null> => {
  const response = await api.post(`/helpdesk/me/tickets/${ticketId}/comments`, {
    comment,
    is_internal: false,
  });
  return normalizeHelpdeskTicket(asRecord(unwrapPayload(response.data))?.ticket ?? unwrapPayload(response.data));
};

export const confirmMyHelpdeskTicketFunctionality = async (
  ticketId: number,
): Promise<HelpdeskTicket | null> => {
  const response = await api.post(`/helpdesk/me/tickets/${ticketId}/confirm-functionality`);
  return normalizeHelpdeskTicket(asRecord(unwrapPayload(response.data))?.ticket ?? unwrapPayload(response.data));
};

export const solveHelpdeskTicket = async (
  ticketId: number,
  payload: HelpdeskTicketSolutionPayload,
): Promise<HelpdeskTicket | null> => {
  const response = await api.post(`/helpdesk/tickets/${ticketId}/solve`, payload);
  return normalizeHelpdeskTicket(asRecord(unwrapPayload(response.data))?.ticket ?? unwrapPayload(response.data));
};

export const validateHelpdeskTicketReturn = async (
  ticketId: number,
  payload: HelpdeskTicketReturnPayload,
): Promise<HelpdeskTicket | null> => {
  const response = await api.post(`/helpdesk/tickets/${ticketId}/validate-return`, payload);
  return normalizeHelpdeskTicket(asRecord(unwrapPayload(response.data))?.ticket ?? unwrapPayload(response.data));
};

export const evaluateHelpdeskTicketIsoRisk = async (
  ticketId: number,
  payload: HelpdeskTicketIsoRiskPayload,
): Promise<HelpdeskTicket | null> => {
  const response = await api.post(`/helpdesk/tickets/${ticketId}/iso-risk`, payload);
  return normalizeHelpdeskTicket(asRecord(unwrapPayload(response.data))?.ticket ?? unwrapPayload(response.data));
};

export const releaseHelpdeskTicketTechnically = async (
  ticketId: number,
  payload: HelpdeskTicketTechnicalReleasePayload,
): Promise<HelpdeskTicket | null> => {
  const response = await api.post(`/helpdesk/tickets/${ticketId}/technical-release`, payload);
  return normalizeHelpdeskTicket(asRecord(unwrapPayload(response.data))?.ticket ?? unwrapPayload(response.data));
};

export const listMaintenanceCatalogs = async (): Promise<HelpdeskMaintenanceCatalogs> => {
  const response = await api.get('/helpdesk/maintenance-catalogs');
  const payload = asRecord(unwrapPayload(response.data));
  return normalizeMaintenanceCatalogs(payload?.catalogs ?? payload);
};

export const listHelpdeskCatalogAdminData = async (): Promise<HelpdeskCatalogAdminResponse> => {
  const response = await api.get('/helpdesk/catalog-admin');
  const payload = asRecord(unwrapPayload(response.data));
  return normalizeHelpdeskCatalogAdminResponse(payload?.catalogs ?? payload);
};

export const createHelpdeskCatalogAdminItem = async (
  catalogKey: HelpdeskCatalogAdminKey,
  payload: HelpdeskCatalogAdminPayload,
): Promise<HelpdeskCatalogAdminItem | null> => {
  const response = await api.post(`/helpdesk/catalog-admin/${catalogKey}`, payload);
  return normalizeHelpdeskCatalogAdminItem(asRecord(unwrapPayload(response.data))?.item ?? unwrapPayload(response.data));
};

export const updateHelpdeskCatalogAdminItem = async (
  catalogKey: HelpdeskCatalogAdminKey,
  itemId: number,
  payload: HelpdeskCatalogAdminPayload,
): Promise<HelpdeskCatalogAdminItem | null> => {
  const response = await api.patch(`/helpdesk/catalog-admin/${catalogKey}/${itemId}`, payload);
  return normalizeHelpdeskCatalogAdminItem(asRecord(unwrapPayload(response.data))?.item ?? unwrapPayload(response.data));
};

export const deactivateHelpdeskCatalogAdminItem = async (
  catalogKey: HelpdeskCatalogAdminKey,
  itemId: number,
): Promise<HelpdeskCatalogAdminItem | null> => {
  const response = await api.post(`/helpdesk/catalog-admin/${catalogKey}/${itemId}/deactivate`);
  return normalizeHelpdeskCatalogAdminItem(asRecord(unwrapPayload(response.data))?.item ?? unwrapPayload(response.data));
};

export const listMaintenancePlans = async (): Promise<HelpdeskMaintenancePlan[]> => {
  const response = await api.get('/helpdesk/maintenance/plans');
  return getArrayFromPayload(response.data, ['plans', 'items', 'results'])
    .map(normalizeMaintenancePlan)
    .filter((plan): plan is HelpdeskMaintenancePlan => plan !== null);
};

export const listMaintenanceOrders = async (): Promise<HelpdeskMaintenanceOrder[]> => {
  const response = await api.get('/helpdesk/maintenance/orders');
  return getArrayFromPayload(response.data, ['orders', 'items', 'results'])
    .map(normalizeMaintenanceOrder)
    .filter((order): order is HelpdeskMaintenanceOrder => order !== null);
};

export const createMaintenancePlan = async (
  payload: HelpdeskMaintenancePlanPayload,
): Promise<HelpdeskMaintenancePlan> => {
  const response = await api.post('/helpdesk/maintenance/plans', payload);
  const parsed = normalizeMaintenancePlan(asRecord(unwrapPayload(response.data))?.plan ?? unwrapPayload(response.data));
  if (!parsed) {
    throw new Error('No se pudo interpretar el plan de mantenimiento creado');
  }
  return parsed;
};

export const updateMaintenancePlanById = async (
  planId: number,
  payload: HelpdeskMaintenancePlanPayload,
): Promise<HelpdeskMaintenancePlan | null> => {
  const response = await api.patch(`/helpdesk/maintenance/plans/${planId}`, payload);
  return normalizeMaintenancePlan(asRecord(unwrapPayload(response.data))?.plan ?? unwrapPayload(response.data));
};

export const startMaintenanceOrderById = async (orderId: number): Promise<HelpdeskMaintenanceOrder | null> => {
  const response = await api.post(`/helpdesk/maintenance/orders/${orderId}/start`);
  return normalizeMaintenanceOrder(asRecord(unwrapPayload(response.data))?.order ?? unwrapPayload(response.data));
};

export const rescheduleMaintenanceOrderById = async (
  orderId: number,
  payload: HelpdeskMaintenanceOrderReschedulePayload,
): Promise<HelpdeskMaintenanceOrder | null> => {
  const response = await api.post(`/helpdesk/maintenance/orders/${orderId}/reschedule`, payload);
  return normalizeMaintenanceOrder(asRecord(unwrapPayload(response.data))?.order ?? unwrapPayload(response.data));
};

export const closeMaintenanceOrderById = async (
  orderId: number,
  payload: HelpdeskMaintenanceOrderClosePayload,
): Promise<HelpdeskMaintenanceOrder | null> => {
  const response = await api.post(`/helpdesk/maintenance/orders/${orderId}/close`, payload);
  return normalizeMaintenanceOrder(asRecord(unwrapPayload(response.data))?.order ?? unwrapPayload(response.data));
};

export const listLinkableUsers = async (): Promise<LinkableUser[]> => {
  const response = await api.get('/employees/linkable-users');
  return getArrayFromPayload(response.data, ['users', 'items', 'results'])
    .map(normalizeLinkableUser)
    .filter((user): user is LinkableUser => user !== null);
};

export const fetchEmployeeDocumentAccess = async (
  employeeId: number,
): Promise<EmployeeDocumentAccessResponse | null> => {
  const response = await api.get(`/employees/${employeeId}/document-access`);
  return normalizeEmployeeDocumentAccessResponse(unwrapPayload(response.data));
};

export const updateEmployeeDocumentAccess = async (
  employeeId: number,
  payload: EmployeeDocumentAccessPayload,
): Promise<EmployeeDocumentAccessResponse | null> => {
  const normalizedSectionIds = normalizeNumericArray(payload.section_ids);
  const normalizedDocumentTypeIds = normalizeNumericArray(payload.document_type_ids);
  const response = await api.put(`/employees/${employeeId}/document-access`, {
    section_ids: normalizedSectionIds,
    document_type_ids: normalizedDocumentTypeIds,
  });

  return normalizeEmployeeDocumentAccessResponse(unwrapPayload(response.data));
};

export const listDocumentSections = async (): Promise<DocumentSection[]> => {
  const response = await api.get('/rh/document-structure/sections');
  return getArrayFromPayload(response.data, ['sections', 'items', 'results'])
    .map(normalizeDocumentSection)
    .filter((section): section is DocumentSection => section !== null);
};

export const createDocumentSection = async (
  payload: DocumentSectionPayload,
): Promise<DocumentSection> => {
  const response = await api.post('/rh/document-structure/sections', payload);
  const parsed =
    normalizeDocumentSection(asRecord(unwrapPayload(response.data))?.section ?? unwrapPayload(response.data));
  if (!parsed) {
    throw new Error('No se pudo interpretar la seccion documental creada');
  }
  return parsed;
};

export const updateDocumentSectionById = async (
  sectionId: number,
  payload: Partial<DocumentSectionPayload>,
): Promise<DocumentSection | null> => {
  const response = await api.patch(`/rh/document-structure/sections/${sectionId}`, payload);
  return normalizeDocumentSection(asRecord(unwrapPayload(response.data))?.section ?? unwrapPayload(response.data));
};

export const deleteDocumentSectionById = async (sectionId: number): Promise<void> => {
  await api.delete(`/rh/document-structure/sections/${sectionId}`);
};

export const listDocumentTypes = async (
  options: { section_id?: number; is_active?: boolean } = {},
): Promise<DocumentType[]> => {
  const response = await api.get('/rh/document-structure/types', {
    params: {
      ...(options.section_id ? { section_id: options.section_id } : {}),
      ...(typeof options.is_active === 'boolean' ? { is_active: options.is_active } : {}),
    },
  });
  return getArrayFromPayload(response.data, ['types', 'items', 'results'])
    .map(normalizeDocumentType)
    .filter((type): type is DocumentType => type !== null);
};

export const fetchEmployeeExpedientById = async (
  employeeId: number,
): Promise<EmployeeExpedient | null> => {
  const response = await api.get(`/rh/employees/${employeeId}/expedient`);
  return normalizeEmployeeExpedient(unwrapPayload(response.data));
};

export const fetchMyExpedient = async (): Promise<EmployeeExpedient | null> => {
  const response = await api.get('/rh/me/expedient');
  return normalizeEmployeeExpedient(unwrapPayload(response.data));
};

export const listRhAlerts = async (
  filters: EmployeeAlertsFilters = {},
): Promise<{ summary: EmployeeAlertsSummary; alerts: EmployeeAlert[] }> => {
  const response = await api.get('/rh/alerts', {
    params: {
      ...(filters.employee_id ? { employee_id: filters.employee_id } : {}),
      ...(filters.area?.trim() ? { area: filters.area.trim() } : {}),
      ...(filters.state ? { state: filters.state } : {}),
    },
  });

  const payload = asRecord(unwrapPayload(response.data));
  return {
    summary: normalizeEmployeeAlertsSummary(payload?.summary),
    alerts: getArrayFromPayload(payload?.alerts ?? [], ['alerts'])
      .map(normalizeEmployeeAlert)
      .filter((alert): alert is EmployeeAlert => alert !== null),
  };
};

export const listEmployeeAlertsByEmployeeId = async (
  employeeId: number,
  filters: Omit<EmployeeAlertsFilters, 'employee_id'> = {},
): Promise<{ summary: EmployeeAlertsSummary; alerts: EmployeeAlert[] }> => {
  const response = await api.get(`/rh/employees/${employeeId}/alerts`, {
    params: {
      ...(filters.area?.trim() ? { area: filters.area.trim() } : {}),
      ...(filters.state ? { state: filters.state } : {}),
    },
  });

  const payload = asRecord(unwrapPayload(response.data));
  return {
    summary: normalizeEmployeeAlertsSummary(payload?.summary),
    alerts: getArrayFromPayload(payload?.alerts ?? [], ['alerts'])
      .map(normalizeEmployeeAlert)
      .filter((alert): alert is EmployeeAlert => alert !== null),
  };
};

export const listEmployeeDocumentsByEmployeeId = async (
  employeeId: number,
): Promise<EmployeeDocument[]> => {
  const response = await api.get(`/rh/employees/${employeeId}/documents`);
  return getArrayFromPayload(response.data, ['documents', 'items', 'results'])
    .map(normalizeEmployeeDocument)
    .filter((document): document is EmployeeDocument => document !== null);
};

export const uploadEmployeeDocumentByEmployeeId = async (
  employeeId: number,
  payload: EmployeeDocumentPayload,
): Promise<EmployeeDocument> => {
  const formData = new FormData();
  formData.append('document_type_id', String(payload.document_type_id));
  formData.append('title', payload.title.trim());
  formData.append('description', payload.description?.trim() ?? '');
  formData.append('issue_date', payload.issue_date?.trim() || '');
  formData.append('expiry_date', payload.expiry_date?.trim() || '');
  formData.append('file', payload.file);

  const response = await api.post(`/rh/employees/${employeeId}/documents`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  const parsed =
    normalizeEmployeeDocument(asRecord(unwrapPayload(response.data))?.document ?? unwrapPayload(response.data));
  if (!parsed) {
    throw new Error('No se pudo interpretar el documento RH cargado');
  }

  return parsed;
};

export const uploadMyEmployeeDocument = async (
  payload: EmployeeDocumentPayload,
): Promise<EmployeeDocument> => {
  const formData = new FormData();
  formData.append('document_type_id', String(payload.document_type_id));
  formData.append('title', payload.title.trim());
  formData.append('description', payload.description?.trim() ?? '');
  formData.append('issue_date', payload.issue_date?.trim() || '');
  formData.append('expiry_date', payload.expiry_date?.trim() || '');
  formData.append('file', payload.file);

  const response = await api.post('/rh/me/documents', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  const parsed =
    normalizeEmployeeDocument(asRecord(unwrapPayload(response.data))?.document ?? unwrapPayload(response.data));
  if (!parsed) {
    throw new Error('No se pudo interpretar el documento personal cargado');
  }

  return parsed;
};

export const createDocumentType = async (payload: DocumentTypePayload): Promise<DocumentType> => {
  const response = await api.post('/rh/document-structure/types', payload);
  const parsed =
    normalizeDocumentType(asRecord(unwrapPayload(response.data))?.type ?? unwrapPayload(response.data));
  if (!parsed) {
    throw new Error('No se pudo interpretar el tipo documental creado');
  }
  return parsed;
};

export const updateDocumentTypeById = async (
  typeId: number,
  payload: Partial<DocumentTypePayload>,
): Promise<DocumentType | null> => {
  const response = await api.patch(`/rh/document-structure/types/${typeId}`, payload);
  return normalizeDocumentType(asRecord(unwrapPayload(response.data))?.type ?? unwrapPayload(response.data));
};

export const deleteDocumentTypeById = async (typeId: number): Promise<void> => {
  await api.delete(`/rh/document-structure/types/${typeId}`);
};

export const createDocumentListParams = (options: ListDocumentsOptions) => {
  const params: Record<string, string | number | boolean> = {};

  if (options.includeInactive) {
    params.includeInactive = true;
  }

  if (typeof options.category_id === 'number' && Number.isFinite(options.category_id) && options.category_id > 0) {
    params.category_id = options.category_id;
  }

  const normalizedTitle = options.title?.trim();
  if (normalizedTitle) {
    params.title = normalizedTitle;
  }

  const normalizedDescription = options.description?.trim();
  if (normalizedDescription) {
    params.description = normalizedDescription;
  }

  const normalizedPublishDate = options.publish_date?.trim();
  if (normalizedPublishDate) {
    params.publish_date = normalizedPublishDate;
  }

  const normalizedExpiryDate = options.expiry_date?.trim();
  if (normalizedExpiryDate) {
    params.expiry_date = normalizedExpiryDate;
  }

  return Object.keys(params).length > 0 ? params : undefined;
};

export const hasDocumentSearchFilters = (options: ListDocumentsOptions): boolean =>
  Boolean(
    (typeof options.category_id === 'number' &&
      Number.isFinite(options.category_id) &&
      options.category_id > 0) ||
      options.title?.trim() ||
      options.description?.trim() ||
      options.publish_date?.trim() ||
      options.expiry_date?.trim(),
  );

export const listDocuments = async (options: ListDocumentsOptions = {}): Promise<Document[]> => {
  const shouldUseSearchEndpoint = hasDocumentSearchFilters(options);
  const params = createDocumentListParams(options);
  const response = await api.get(shouldUseSearchEndpoint ? '/documents/search' : '/documents', {
    params,
  });

  return getArrayFromPayload(response.data, ['documents', 'items', 'results'])
    .map(normalizeDocument)
    .filter((doc): doc is Document => doc !== null);
};

export const listDocumentsPaginated = async (
  options: ListDocumentsOptions = {},
  pageQuery: PageQuery = {},
): Promise<PageResult<Document>> => {
  const shouldUseSearchEndpoint = hasDocumentSearchFilters(options);
  const params = { ...(createDocumentListParams(options) ?? {}), ...buildPageParams(pageQuery) };
  const response = await api.get(shouldUseSearchEndpoint ? '/documents/search' : '/documents', {
    params,
  });

  const data = getArrayFromPayload(response.data, ['documents', 'items', 'results'])
    .map(normalizeDocument)
    .filter((doc): doc is Document => doc !== null);
  return { data, pagination: extractPagination(response.data, data.length) };
};

export const getDocumentStats = async (): Promise<DocumentStats> => {
  const response = await api.get('/documents/stats');
  const source = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    active: Number(source.active ?? 0),
    inactive: Number(source.inactive ?? 0),
    superseded: Number(source.superseded ?? 0),
    total: Number(source.total ?? 0),
  };
};

export const deleteDocumentById = async (
  documentId: string | number,
): Promise<void> => {
  const encodedId = encodeURIComponent(String(documentId));
  await api.delete(`/documents/${encodedId}`);
};

export const createDocumentMutationPayload = (payload: UpdateDocumentPayload) => {
  const normalizedTitle = payload.title.trim();
  const normalizedCategoryId = Number(String(payload.category_id).trim());
  const normalizedDescription = payload.description?.trim() ?? '';
  const normalizedPublishDate = payload.publish_date?.trim() ?? '';
  const normalizedExpiryDate = payload.expiry_date?.trim() ?? '';
  const normalizedStatus = payload.status?.trim() ?? '';

  const jsonPayload: Record<string, string | number | null> = {
    description: normalizedDescription,
    expiry_date: normalizedExpiryDate || null,
  };

  if (normalizedTitle) {
    jsonPayload.title = normalizedTitle;
  }

  if (Number.isFinite(normalizedCategoryId) && normalizedCategoryId > 0) {
    jsonPayload.category_id = normalizedCategoryId;
  }

  if (normalizedPublishDate) {
    jsonPayload.publish_date = normalizedPublishDate;
  }

  if (normalizedStatus === 'active' || normalizedStatus === 'inactive') {
    jsonPayload.status = normalizedStatus;
  }

  const formData = new FormData();

  if (normalizedTitle) {
    formData.append('title', normalizedTitle);
  }

  if (Number.isFinite(normalizedCategoryId) && normalizedCategoryId > 0) {
    formData.append('category_id', String(normalizedCategoryId));
  }

  formData.append('description', normalizedDescription);

  if (normalizedPublishDate) {
    formData.append('publish_date', normalizedPublishDate);
  }

  formData.append('expiry_date', normalizedExpiryDate || 'null');

  if (payload.file) {
    formData.append('file', payload.file);
  }

  return {
    jsonPayload,
    formData,
  };
};

export const updateDocumentById = async (
  documentId: string | number,
  payload: UpdateDocumentPayload,
): Promise<unknown> => {
  const encodedId = encodeURIComponent(String(documentId));
  const { jsonPayload, formData } = createDocumentMutationPayload(payload);
  const hasReplacementFile = Boolean(payload.file);

  const response = hasReplacementFile
    ? await api.patch(`/documents/${encodedId}/replace`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
    : await api.patch(`/documents/${encodedId}`, jsonPayload);

  return unwrapPayload(response.data);
};

export const updateDocumentStatusById = async (
  documentId: string | number,
  status: Exclude<DocumentStatus, 'superseded'>,
): Promise<unknown> => {
  const encodedId = encodeURIComponent(String(documentId));
  const response = await api.patch(`/documents/status/${encodedId}`, { status });
  return unwrapPayload(response.data);
};

export const listAuditLogs = async (): Promise<AuditLog[]> => {
  const response = await api.get('/audit/logs', {
    params: {
      module_code: 'QUALITY',
    },
  });
  return getArrayFromPayload(response.data, ['logs', 'items', 'results'])
    .map(normalizeAuditLog)
    .filter((log): log is AuditLog => log !== null);
};

export const listRhAuditLogs = async (
  filters: { employee_id?: number; limit?: number } = {},
): Promise<AuditLog[]> => {
  const response = await api.get('/audit/logs', {
    params: {
      module_code: 'RH',
      ...(filters.employee_id ? { employee_id: filters.employee_id } : {}),
      ...(filters.limit ? { limit: filters.limit } : {}),
    },
  });

  return getArrayFromPayload(response.data, ['logs', 'items', 'results'])
    .map(normalizeAuditLog)
    .filter((log): log is AuditLog => log !== null);
};

export const listEmployeeDocumentHistoryByEmployeeId = async (
  employeeId: number,
  documentTypeId: number,
): Promise<EmployeeDocument[]> => {
  const response = await api.get(`/rh/employees/${employeeId}/document-types/${documentTypeId}/history`);
  return getArrayFromPayload(response.data, ['documents', 'items', 'results'])
    .map(normalizeEmployeeDocument)
    .filter((document): document is EmployeeDocument => document !== null);
};

export const fetchCategories = async (token?: string): Promise<Category[]> => {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const requestConfig = {
    ...(token ? { headers } : {}),
    params: {
      page: 1,
      limit: 1000,
    },
  };

  const response = await api.get('/categories', requestConfig);

  return getArrayFromPayload(response.data, ['categories', 'items', 'results'])
    .map(normalizeCategory)
    .filter((category): category is Category => category !== null);
};

export const fetchDocumentCategories = async (token?: string): Promise<Category[]> => {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const requestConfig = token ? { headers } : undefined;
  const response = await api.get('/documents/categories', requestConfig);

  return getArrayFromPayload(response.data, ['categories', 'items', 'results'])
    .map(normalizeCategory)
    .filter((category): category is Category => category !== null);
};

export const updateCategory = async (
  categoryId: number,
  name: string,
): Promise<Category> => {
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error('El nombre de la categoria es obligatorio');
  }

  const response = await api.patch(`/categories/${categoryId}`, { name: normalizedName });

  const parsed = normalizeCategory(unwrapPayload(response.data));
  return parsed ?? { id: categoryId, name: normalizedName };
};

export const createCategory = async (name: string): Promise<void> => {
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error('El nombre de la categoria es obligatorio');
  }

  await api.post('/categories', { name: normalizedName });
};

export const deleteCategoryById = async (categoryId: number): Promise<void> => {
  await api.delete(`/categories/${categoryId}`);
};

export const uploadDocumentWithMetadata = async (
  formData: FormData,
  token?: string,
): Promise<unknown> => {
  const headers: Record<string, string> = {
    'Content-Type': 'multipart/form-data',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await api.post('/documents/upload', formData, { headers });
  return unwrapPayload(response.data);
};
