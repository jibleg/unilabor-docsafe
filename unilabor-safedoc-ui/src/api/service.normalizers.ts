import type {
  Employee,
  EmployeeSummary,
  HelpdeskAsset,
  HelpdeskCatalogAdminItem,
  HelpdeskCatalogAdminResponse,
  HelpdeskDashboardMetrics,
  HelpdeskAssetEmployee,
  HelpdeskAssetSummary,
  HelpdeskCatalogItem,
  HelpdeskCatalogs,
  HelpdeskTicket,
  HelpdeskTicketCatalogs,
  HelpdeskTicketComment,
  HelpdeskTicketPriority,
  HelpdeskTicketStats,
  HelpdeskTicketStatus,
  HelpdeskMaintenanceCatalogs,
  HelpdeskMaintenanceFrequency,
  HelpdeskMaintenancePlan,
  HelpdeskMaintenanceOrder,
  HelpdeskMaintenanceOrderChecklistItem,
  HelpdeskMaintenancePlanTask,
  LinkableUser,
  ManagedUser,
  ModuleAccess,
  User,
} from '../types/models';
import {
  asRecord,
  getString,
  getNumber,
  getBoolean,
  getArrayFromPayload,
} from './service.shared';


export const normalizeUser = (input: unknown): User => {
  const source = asRecord(input);
  if (!source) {
    throw new Error('Formato de usuario invalido');
  }

  return {
    id: String(source.id ?? ''),
    name: getString(source, ['name']),
    full_name: getString(source, ['full_name', 'fullName']),
    role: getString(source, ['role'], 'USER'),
    mustChangePassword: getBoolean(source, ['mustChangePassword', 'must_change_password']),
    email: getString(source, ['email']),
    avatar_path: getString(source, ['avatar_path', 'avatarPath']),
    created_at: getString(source, ['created_at', 'createdAt']),
    updated_at: getString(source, ['updated_at', 'updatedAt']),
  };
};

export const normalizeManagedUser = (input: unknown): ManagedUser | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const rawId = source.id ?? source.user_id ?? source.uuid;
  const id =
    typeof rawId === 'number' && Number.isFinite(rawId)
      ? String(rawId)
      : typeof rawId === 'string' && rawId.trim().length > 0
        ? rawId.trim()
        : '';

  const email = getString(source, ['email']);
  const fullName = getString(source, ['full_name', 'fullName', 'name']);
  const role = getString(source, ['role']);

  if (!id || !email || !fullName || !role) {
    return null;
  }

  return {
    id,
    email,
    full_name: fullName,
    role,
    is_active: getBoolean(source, ['is_active', 'isActive'], true),
    must_change_password: getBoolean(
      source,
      ['must_change_password', 'mustChangePassword'],
      false,
    ),
    created_at: getString(source, ['created_at', 'createdAt']),
    updated_at: getString(source, ['updated_at', 'updatedAt']),
    modules: getArrayFromPayload(source, ['modules'])
      .map(normalizeModuleAccess)
      .filter((moduleAccess): moduleAccess is ModuleAccess => moduleAccess !== null),
  };
};

export const normalizeModuleAccess = (input: unknown): ModuleAccess | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const code = getString(source, ['code']).toUpperCase();
  const role = getString(source, ['role']).toUpperCase();
  const name = getString(source, ['name']);

  if ((code !== 'QUALITY' && code !== 'RH' && code !== 'HELPDESK') || !name || !role) {
    return null;
  }

  return {
    code,
    name,
    description: getString(source, ['description']) || null,
    icon: getString(source, ['icon']) || null,
    role,
    is_active: getBoolean(source, ['is_active', 'isActive'], true),
    sort_order: getNumber(source, ['sort_order', 'sortOrder'], 0),
  };
};

export const normalizeLinkableUser = (input: unknown): LinkableUser | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getString(source, ['id']);
  const email = getString(source, ['email']);
  const fullName = getString(source, ['full_name', 'fullName', 'name']);
  const role = getString(source, ['role']).toUpperCase();

  if (!id || !email || !fullName || !role) {
    return null;
  }

  return {
    id,
    email,
    full_name: fullName,
    role,
    modules: getArrayFromPayload(source, ['modules'])
      .map(normalizeModuleAccess)
      .filter((moduleAccess): moduleAccess is ModuleAccess => moduleAccess !== null),
  };
};

export const normalizeEmployee = (input: unknown): Employee | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const employeeCode = getString(source, ['employee_code', 'employeeCode']);
  const fullName = getString(source, ['full_name', 'fullName']);
  const email = getString(source, ['email']);

  if (!id || !employeeCode || !fullName || !email) {
    return null;
  }

  return {
    id,
    employee_code: employeeCode,
    user_id: getString(source, ['user_id', 'userId']) || null,
    full_name: fullName,
    email,
    phone: getString(source, ['phone']) || null,
    area: getString(source, ['area']) || null,
    position: getString(source, ['position']) || null,
    is_active: getBoolean(source, ['is_active', 'isActive'], true),
    created_at: getString(source, ['created_at', 'createdAt']),
    updated_at: getString(source, ['updated_at', 'updatedAt']),
    linked_user: normalizeLinkableUser(source.linked_user ?? source.linkedUser),
  };
};

export const normalizeEmployeeSummary = (input: unknown): EmployeeSummary => {
  const source = asRecord(input);
  if (!source) {
    return {
      total: 0,
      active: 0,
      linked_users: 0,
      unlinked_users: 0,
    };
  }

  return {
    total: getNumber(source, ['total']),
    active: getNumber(source, ['active']),
    linked_users: getNumber(source, ['linked_users', 'linkedUsers']),
    unlinked_users: getNumber(source, ['unlinked_users', 'unlinkedUsers']),
  };
};

export const normalizeHelpdeskCatalogItem = (input: unknown): HelpdeskCatalogItem | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const name = getString(source, ['name']);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    code: getString(source, ['code']) || null,
    name,
    description: getString(source, ['description']) || null,
    is_active: getBoolean(source, ['is_active', 'isActive'], true),
    sort_order: getNumber(source, ['sort_order', 'sortOrder'], 0),
  };
};

export const normalizeHelpdeskAssetEmployee = (input: unknown): HelpdeskAssetEmployee | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const employeeCode = getString(source, ['employee_code', 'employeeCode']);
  const fullName = getString(source, ['full_name', 'fullName']);
  if (!id || !employeeCode || !fullName) {
    return null;
  }

  return {
    id,
    employee_code: employeeCode,
    full_name: fullName,
    area: getString(source, ['area']) || null,
    position: getString(source, ['position']) || null,
  };
};

export const getNullableNumber = (source: Record<string, unknown>, keys: string[]): number | null => {
  const value = getNumber(source, keys, 0);
  return value > 0 ? value : null;
};

export const normalizeHelpdeskAsset = (input: unknown): HelpdeskAsset | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const assetCode = getString(source, ['asset_code', 'assetCode']);
  const name = getString(source, ['name']);
  if (!id || !assetCode || !name) {
    return null;
  }

  return {
    id,
    asset_code: assetCode,
    name,
    description: getString(source, ['description']) || null,
    category_id: getNullableNumber(source, ['category_id', 'categoryId']),
    unit_id: getNullableNumber(source, ['unit_id', 'unitId']),
    area_id: getNullableNumber(source, ['area_id', 'areaId']),
    location_id: getNullableNumber(source, ['location_id', 'locationId']),
    brand_id: getNullableNumber(source, ['brand_id', 'brandId']),
    brand_name: getString(source, ['brand_name', 'brandName']) || null,
    model: getString(source, ['model']) || null,
    serial_number: getString(source, ['serial_number', 'serialNumber']) || null,
    complementary_info: getString(source, ['complementary_info', 'complementaryInfo']) || null,
    purchase_modality_id: getNullableNumber(source, ['purchase_modality_id', 'purchaseModalityId']),
    purchase_condition_id: getNullableNumber(source, ['purchase_condition_id', 'purchaseConditionId']),
    assigned_employee_id: getNullableNumber(source, ['assigned_employee_id', 'assignedEmployeeId']),
    responsible_employee_id: getNullableNumber(source, ['responsible_employee_id', 'responsibleEmployeeId']),
    criticality_id: getNullableNumber(source, ['criticality_id', 'criticalityId']),
    operational_status_id: getNullableNumber(source, ['operational_status_id', 'operationalStatusId']),
    acquired_on: getString(source, ['acquired_on', 'acquiredOn']) || null,
    warranty_expires_on: getString(source, ['warranty_expires_on', 'warrantyExpiresOn']) || null,
    inventory_legacy_code: getString(source, ['inventory_legacy_code', 'inventoryLegacyCode']) || null,
    legacy_consecutive: getString(source, ['legacy_consecutive', 'legacyConsecutive']) || null,
    legacy_component_consecutive:
      getString(source, ['legacy_component_consecutive', 'legacyComponentConsecutive']) || null,
    notes: getString(source, ['notes']) || null,
    is_active: getBoolean(source, ['is_active', 'isActive'], true),
    created_at: getString(source, ['created_at', 'createdAt']),
    updated_at: getString(source, ['updated_at', 'updatedAt']),
    category: normalizeHelpdeskCatalogItem(source.category),
    unit: normalizeHelpdeskCatalogItem(source.unit),
    area: normalizeHelpdeskCatalogItem(source.area),
    location: normalizeHelpdeskCatalogItem(source.location),
    brand: normalizeHelpdeskCatalogItem(source.brand),
    purchase_modality: normalizeHelpdeskCatalogItem(source.purchase_modality ?? source.purchaseModality),
    purchase_condition: normalizeHelpdeskCatalogItem(source.purchase_condition ?? source.purchaseCondition),
    criticality: normalizeHelpdeskCatalogItem(source.criticality),
    operational_status: normalizeHelpdeskCatalogItem(source.operational_status ?? source.operationalStatus),
    assigned_employee: normalizeHelpdeskAssetEmployee(source.assigned_employee ?? source.assignedEmployee),
    responsible_employee: normalizeHelpdeskAssetEmployee(source.responsible_employee ?? source.responsibleEmployee),
  };
};

export const normalizeHelpdeskSummary = (input: unknown): HelpdeskAssetSummary => {
  const source = asRecord(input);
  if (!source) {
    return {
      assets: 0,
      open_tickets: 0,
      preventive_due: 0,
      out_of_service: 0,
      critical: 0,
      assigned: 0,
    };
  }

  return {
    assets: getNumber(source, ['assets']),
    open_tickets: getNumber(source, ['open_tickets', 'openTickets']),
    preventive_due: getNumber(source, ['preventive_due', 'preventiveDue']),
    out_of_service: getNumber(source, ['out_of_service', 'outOfService']),
    critical: getNumber(source, ['critical']),
    assigned: getNumber(source, ['assigned']),
  };
};

export const normalizeHelpdeskTicketStats = (input: unknown): HelpdeskTicketStats => {
  const source = asRecord(input) ?? {};
  return {
    total: getNumber(source, ['total']),
    open: getNumber(source, ['open']),
    critical: getNumber(source, ['critical']),
    affects_results: getNumber(source, ['affects_results', 'affectsResults']),
  };
};

export const normalizeHelpdeskDashboardMetrics = (input: unknown): HelpdeskDashboardMetrics => {
  const source = asRecord(input) ?? {};
  const tickets = asRecord(source.tickets) ?? {};
  const maintenance = asRecord(source.maintenance) ?? {};

  return {
    tickets: {
      total: getNumber(tickets, ['total']),
      open: getNumber(tickets, ['open']),
      critical: getNumber(tickets, ['critical']),
      overdue: getNumber(tickets, ['overdue']),
      solved: getNumber(tickets, ['solved']),
      affects_results: getNumber(tickets, ['affects_results', 'affectsResults']),
      risk_pending_release: getNumber(tickets, ['risk_pending_release', 'riskPendingRelease']),
      avg_solution_hours: getNullableNumber(tickets, ['avg_solution_hours', 'avgSolutionHours']),
      avg_downtime_hours: getNullableNumber(tickets, ['avg_downtime_hours', 'avgDowntimeHours']),
    },
    maintenance: {
      scheduled: getNumber(maintenance, ['scheduled']),
      in_progress: getNumber(maintenance, ['in_progress', 'inProgress']),
      overdue: getNumber(maintenance, ['overdue']),
      closed: getNumber(maintenance, ['closed']),
      compliance_percent: getNumber(maintenance, ['compliance_percent', 'compliancePercent']),
    },
    availability: getArrayFromPayload(source.availability ?? [], ['availability']).map((item) => {
      const record = asRecord(item) ?? {};
      return {
        code: getString(record, ['code']),
        name: getString(record, ['name'], 'Sin estado'),
        total: getNumber(record, ['total']),
      };
    }),
    recurrences: getArrayFromPayload(source.recurrences ?? [], ['recurrences']).map((item) => {
      const record = asRecord(item) ?? {};
      return {
        asset_id: getNumber(record, ['asset_id', 'assetId']),
        asset_code: getString(record, ['asset_code', 'assetCode']),
        asset_name: getString(record, ['asset_name', 'assetName']),
        ticket_count: getNumber(record, ['ticket_count', 'ticketCount']),
      };
    }),
    by_area: getArrayFromPayload(source.by_area ?? source.byArea ?? [], ['by_area', 'byArea']).map((item) => {
      const record = asRecord(item) ?? {};
      return {
        area: getString(record, ['area'], 'Sin area'),
        ticket_count: getNumber(record, ['ticket_count', 'ticketCount']),
        maintenance_count: getNumber(record, ['maintenance_count', 'maintenanceCount']),
      };
    }),
    audit_items: getArrayFromPayload(source.audit_items ?? source.auditItems ?? [], ['audit_items', 'auditItems']).map((item) => {
      const record = asRecord(item) ?? {};
      return {
        kind: getString(record, ['kind']),
        code: getString(record, ['code']),
        asset_code: getString(record, ['asset_code', 'assetCode']) || null,
        asset_name: getString(record, ['asset_name', 'assetName']) || null,
        status: getString(record, ['status']),
        risk_level: getString(record, ['risk_level', 'riskLevel']) || null,
        event_at: getString(record, ['event_at', 'eventAt']),
        owner: getString(record, ['owner']) || null,
      };
    }),
  };
};

export const normalizeHelpdeskCatalogs = (input: unknown): HelpdeskCatalogs => {
  const source = asRecord(input) ?? {};
  const pickCatalog = (key: string, fallbackKey?: string) =>
    getArrayFromPayload(source[key] ?? (fallbackKey ? source[fallbackKey] : []), [key, fallbackKey ?? key])
      .map(normalizeHelpdeskCatalogItem)
      .filter((item): item is HelpdeskCatalogItem => item !== null);

  return {
    categories: pickCatalog('categories'),
    units: pickCatalog('units'),
    areas: pickCatalog('areas'),
    locations: pickCatalog('locations'),
    brands: pickCatalog('brands'),
    purchase_modalities: pickCatalog('purchase_modalities', 'purchaseModalities'),
    purchase_conditions: pickCatalog('purchase_conditions', 'purchaseConditions'),
    criticalities: pickCatalog('criticalities'),
    operational_statuses: pickCatalog('operational_statuses', 'operationalStatuses'),
  };
};

export const normalizeHelpdeskTicketStatus = (input: unknown): HelpdeskTicketStatus | null => {
  const item = normalizeHelpdeskCatalogItem(input);
  const source = asRecord(input);
  if (!item || !source) {
    return null;
  }

  return {
    ...item,
    is_closed: getBoolean(source, ['is_closed', 'isClosed'], false),
  };
};

export const normalizeHelpdeskTicketPriority = (input: unknown): HelpdeskTicketPriority | null => {
  const item = normalizeHelpdeskCatalogItem(input);
  const source = asRecord(input);
  if (!item || !source) {
    return null;
  }

  return {
    ...item,
    response_hours: getNullableNumber(source, ['response_hours', 'responseHours']),
  };
};

export const normalizeHelpdeskTicketCatalogs = (input: unknown): HelpdeskTicketCatalogs => {
  const source = asRecord(input) ?? {};

  return {
    request_types: getArrayFromPayload(source.request_types ?? source.requestTypes ?? [], ['request_types', 'requestTypes'])
      .map(normalizeHelpdeskCatalogItem)
      .filter((item): item is HelpdeskCatalogItem => item !== null),
    ticket_statuses: getArrayFromPayload(source.ticket_statuses ?? source.ticketStatuses ?? [], ['ticket_statuses', 'ticketStatuses'])
      .map(normalizeHelpdeskTicketStatus)
      .filter((item): item is HelpdeskTicketStatus => item !== null),
    ticket_priorities: getArrayFromPayload(source.ticket_priorities ?? source.ticketPriorities ?? [], ['ticket_priorities', 'ticketPriorities'])
      .map(normalizeHelpdeskTicketPriority)
      .filter((item): item is HelpdeskTicketPriority => item !== null),
  };
};

export const normalizeHelpdeskTicketComment = (input: unknown): HelpdeskTicketComment | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const ticketId = getNumber(source, ['ticket_id', 'ticketId']);
  const comment = getString(source, ['comment']);
  if (!id || !ticketId || !comment) {
    return null;
  }

  return {
    id,
    ticket_id: ticketId,
    comment,
    is_internal: getBoolean(source, ['is_internal', 'isInternal'], false),
    created_by_user_id: getString(source, ['created_by_user_id', 'createdByUserId']) || null,
    created_by_name: getString(source, ['created_by_name', 'createdByName']) || null,
    created_at: getString(source, ['created_at', 'createdAt']),
  };
};

export const normalizeHelpdeskTicket = (input: unknown): HelpdeskTicket | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const ticketCode = getString(source, ['ticket_code', 'ticketCode']);
  const title = getString(source, ['title']);
  const description = getString(source, ['description']);
  if (!id || !ticketCode || !title || !description) {
    return null;
  }

  const assetRecord = asRecord(source.asset);

  return {
    id,
    ticket_code: ticketCode,
    asset_id: getNullableNumber(source, ['asset_id', 'assetId']),
    request_type_id: getNullableNumber(source, ['request_type_id', 'requestTypeId']),
    status_id: getNullableNumber(source, ['status_id', 'statusId']),
    priority_id: getNullableNumber(source, ['priority_id', 'priorityId']),
    requester_user_id: getString(source, ['requester_user_id', 'requesterUserId']) || null,
    requester_employee_id: getNullableNumber(source, ['requester_employee_id', 'requesterEmployeeId']),
    assigned_employee_id: getNullableNumber(source, ['assigned_employee_id', 'assignedEmployeeId']),
    title,
    description,
    operational_impact: getString(source, ['operational_impact', 'operationalImpact']) || null,
    affects_results: getBoolean(source, ['affects_results', 'affectsResults'], false),
    reported_at: getString(source, ['reported_at', 'reportedAt']),
    due_at: getString(source, ['due_at', 'dueAt']) || null,
    solved_at: getString(source, ['solved_at', 'solvedAt']) || null,
    solution_summary: getString(source, ['solution_summary', 'solutionSummary']) || null,
    return_to_operation_at: getString(source, ['return_to_operation_at', 'returnToOperationAt']) || null,
    validated_by_user_id: getString(source, ['validated_by_user_id', 'validatedByUserId']) || null,
    validated_at: getString(source, ['validated_at', 'validatedAt']) || null,
    downtime_minutes: getNullableNumber(source, ['downtime_minutes', 'downtimeMinutes']),
    equipment_status_after_solution_id: getNullableNumber(
      source,
      ['equipment_status_after_solution_id', 'equipmentStatusAfterSolutionId'],
    ),
    risk_level: getString(source, ['risk_level', 'riskLevel'], 'NOT_EVALUATED'),
    impact_evaluation: getString(source, ['impact_evaluation', 'impactEvaluation']) || null,
    recent_analysis_usage: getString(source, ['recent_analysis_usage', 'recentAnalysisUsage']) || null,
    alternate_equipment_used: getBoolean(source, ['alternate_equipment_used', 'alternateEquipmentUsed'], false),
    alternate_equipment_notes: getString(source, ['alternate_equipment_notes', 'alternateEquipmentNotes']) || null,
    corrective_action_required: getBoolean(source, ['corrective_action_required', 'correctiveActionRequired'], false),
    corrective_action_notes: getString(source, ['corrective_action_notes', 'correctiveActionNotes']) || null,
    impact_evaluated_by_user_id: getString(source, ['impact_evaluated_by_user_id', 'impactEvaluatedByUserId']) || null,
    impact_evaluated_at: getString(source, ['impact_evaluated_at', 'impactEvaluatedAt']) || null,
    technical_release_required: getBoolean(source, ['technical_release_required', 'technicalReleaseRequired'], false),
    technical_release_summary: getString(source, ['technical_release_summary', 'technicalReleaseSummary']) || null,
    technical_released_by_user_id: getString(source, ['technical_released_by_user_id', 'technicalReleasedByUserId']) || null,
    technical_released_at: getString(source, ['technical_released_at', 'technicalReleasedAt']) || null,
    quality_document_id: getString(source, ['quality_document_id', 'qualityDocumentId']) || null,
    operational_lock: getBoolean(source, ['operational_lock', 'operationalLock'], false),
    is_active: getBoolean(source, ['is_active', 'isActive'], true),
    created_at: getString(source, ['created_at', 'createdAt']),
    updated_at: getString(source, ['updated_at', 'updatedAt']),
    asset: assetRecord
      ? {
          id: getNumber(assetRecord, ['id']),
          asset_code: getString(assetRecord, ['asset_code', 'assetCode']),
          name: getString(assetRecord, ['name']),
          operational_status_name: getString(assetRecord, ['operational_status_name', 'operationalStatusName']) || null,
        }
      : null,
    request_type: normalizeHelpdeskCatalogItem(source.request_type ?? source.requestType),
    status: normalizeHelpdeskTicketStatus(source.status),
    priority: normalizeHelpdeskTicketPriority(source.priority),
    equipment_status_after_solution: normalizeHelpdeskCatalogItem(
      source.equipment_status_after_solution ?? source.equipmentStatusAfterSolution,
    ),
    requester_employee: normalizeHelpdeskAssetEmployee(source.requester_employee ?? source.requesterEmployee),
    assigned_employee: normalizeHelpdeskAssetEmployee(source.assigned_employee ?? source.assignedEmployee),
    comments: getArrayFromPayload(source.comments ?? [], ['comments'])
      .map(normalizeHelpdeskTicketComment)
      .filter((comment): comment is HelpdeskTicketComment => comment !== null),
  };
};

export const normalizeMaintenanceFrequency = (input: unknown): HelpdeskMaintenanceFrequency | null => {
  const item = normalizeHelpdeskCatalogItem(input);
  const source = asRecord(input);
  if (!item || !source) {
    return null;
  }

  return {
    ...item,
    interval_months: getNumber(source, ['interval_months', 'intervalMonths']),
  };
};

export const normalizeMaintenanceCatalogs = (input: unknown): HelpdeskMaintenanceCatalogs => {
  const source = asRecord(input) ?? {};
  return {
    frequencies: getArrayFromPayload(source.frequencies ?? [], ['frequencies'])
      .map(normalizeMaintenanceFrequency)
      .filter((item): item is HelpdeskMaintenanceFrequency => item !== null),
  };
};

export const normalizeHelpdeskCatalogAdminItem = (input: unknown): HelpdeskCatalogAdminItem | null => {
  const item = normalizeHelpdeskCatalogItem(input);
  const source = asRecord(input);
  if (!item || !source) {
    return null;
  }

  return {
    ...item,
    is_closed: source.is_closed === undefined && source.isClosed === undefined
      ? undefined
      : getBoolean(source, ['is_closed', 'isClosed'], false),
    response_hours: getNullableNumber(source, ['response_hours', 'responseHours']),
    interval_months: getNullableNumber(source, ['interval_months', 'intervalMonths']),
  };
};

export const normalizeHelpdeskCatalogAdminResponse = (input: unknown): HelpdeskCatalogAdminResponse => {
  const source = asRecord(input) ?? {};
  const assets = asRecord(source.assets) ?? {};
  const tickets = asRecord(source.tickets) ?? {};
  const maintenance = asRecord(source.maintenance) ?? {};
  const pick = (record: Record<string, unknown>, key: string, fallbackKey?: string) =>
    getArrayFromPayload(record[key] ?? (fallbackKey ? record[fallbackKey] : []), [key, fallbackKey ?? key])
      .map(normalizeHelpdeskCatalogAdminItem)
      .filter((item): item is HelpdeskCatalogAdminItem => item !== null);

  return {
    assets: {
      categories: pick(assets, 'categories'),
      units: pick(assets, 'units'),
      areas: pick(assets, 'areas'),
      locations: pick(assets, 'locations'),
      brands: pick(assets, 'brands'),
      purchase_modalities: pick(assets, 'purchase_modalities', 'purchaseModalities'),
      purchase_conditions: pick(assets, 'purchase_conditions', 'purchaseConditions'),
      criticalities: pick(assets, 'criticalities'),
      operational_statuses: pick(assets, 'operational_statuses', 'operationalStatuses'),
    },
    tickets: {
      request_types: pick(tickets, 'request_types', 'requestTypes'),
      ticket_statuses: pick(tickets, 'ticket_statuses', 'ticketStatuses'),
      ticket_priorities: pick(tickets, 'ticket_priorities', 'ticketPriorities'),
    },
    maintenance: {
      frequencies: pick(maintenance, 'frequencies'),
    },
  };
};

export const normalizeMaintenanceTask = (input: unknown): HelpdeskMaintenancePlanTask | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const taskText = getString(source, ['task_text', 'taskText']);
  if (!id || !taskText) {
    return null;
  }

  return {
    id,
    task_text: taskText,
    is_required: getBoolean(source, ['is_required', 'isRequired'], true),
    sort_order: getNumber(source, ['sort_order', 'sortOrder'], 0),
  };
};

export const normalizeMaintenanceOrder = (input: unknown): HelpdeskMaintenanceOrder | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const orderCode = getString(source, ['order_code', 'orderCode']);
  const scheduledFor = getString(source, ['scheduled_for', 'scheduledFor']);
  if (!id || !orderCode || !scheduledFor) {
    return null;
  }

  const planRecord = asRecord(source.plan);
  const assetRecord = asRecord(source.asset);

  return {
    id,
    order_code: orderCode,
    plan_id: getNullableNumber(source, ['plan_id', 'planId']) ?? undefined,
    asset_id: getNullableNumber(source, ['asset_id', 'assetId']) ?? undefined,
    scheduled_for: scheduledFor,
    window_starts_on: getString(source, ['window_starts_on', 'windowStartsOn']) || null,
    window_ends_on: getString(source, ['window_ends_on', 'windowEndsOn']) || null,
    status: getString(source, ['status'], 'SCHEDULED'),
    started_at: getString(source, ['started_at', 'startedAt']) || null,
    completed_at: getString(source, ['completed_at', 'completedAt']) || null,
    completed_by_user_id: getString(source, ['completed_by_user_id', 'completedByUserId']) || null,
    performed_activities: getString(source, ['performed_activities', 'performedActivities']) || null,
    findings: getString(source, ['findings']) || null,
    provider_name: getString(source, ['provider_name', 'providerName']) || null,
    result: getString(source, ['result']) || null,
    evidence_notes: getString(source, ['evidence_notes', 'evidenceNotes']) || null,
    rescheduled_from: getString(source, ['rescheduled_from', 'rescheduledFrom']) || null,
    rescheduled_at: getString(source, ['rescheduled_at', 'rescheduledAt']) || null,
    reschedule_reason: getString(source, ['reschedule_reason', 'rescheduleReason']) || null,
    plan: planRecord
      ? {
          id: getNumber(planRecord, ['id']),
          plan_code: getString(planRecord, ['plan_code', 'planCode']),
          title: getString(planRecord, ['title']),
          frequency_id: getNullableNumber(planRecord, ['frequency_id', 'frequencyId']),
          interval_months: getNullableNumber(planRecord, ['interval_months', 'intervalMonths']),
          tolerance_before_days: getNumber(planRecord, ['tolerance_before_days', 'toleranceBeforeDays']),
          tolerance_after_days: getNumber(planRecord, ['tolerance_after_days', 'toleranceAfterDays']),
        }
      : null,
    asset: assetRecord
      ? {
          id: getNumber(assetRecord, ['id']),
          asset_code: getString(assetRecord, ['asset_code', 'assetCode']),
          name: getString(assetRecord, ['name']),
          operational_status_name: getString(assetRecord, ['operational_status_name', 'operationalStatusName']) || null,
        }
      : null,
    checklist: getArrayFromPayload(source.checklist ?? [], ['checklist'])
      .map(normalizeMaintenanceOrderChecklist)
      .filter((item): item is HelpdeskMaintenanceOrderChecklistItem => item !== null),
  };
};

export const normalizeMaintenanceOrderChecklist = (input: unknown): HelpdeskMaintenanceOrderChecklistItem | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const taskText = getString(source, ['task_text', 'taskText']);
  if (!id || !taskText) {
    return null;
  }

  return {
    id,
    plan_task_id: getNullableNumber(source, ['plan_task_id', 'planTaskId']),
    task_text: taskText,
    result: getString(source, ['result'], 'PENDING'),
    notes: getString(source, ['notes']) || null,
    sort_order: getNumber(source, ['sort_order', 'sortOrder'], 0),
  };
};

export const normalizeMaintenancePlan = (input: unknown): HelpdeskMaintenancePlan | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const planCode = getString(source, ['plan_code', 'planCode']);
  const assetId = getNumber(source, ['asset_id', 'assetId']);
  const title = getString(source, ['title']);
  if (!id || !planCode || !assetId || !title) {
    return null;
  }

  return {
    id,
    plan_code: planCode,
    asset_id: assetId,
    frequency_id: getNullableNumber(source, ['frequency_id', 'frequencyId']),
    responsible_employee_id: getNullableNumber(source, ['responsible_employee_id', 'responsibleEmployeeId']),
    quality_document_id: getString(source, ['quality_document_id', 'qualityDocumentId']) || null,
    title,
    description: getString(source, ['description']) || null,
    provider_name: getString(source, ['provider_name', 'providerName']) || null,
    starts_on: getString(source, ['starts_on', 'startsOn']),
    next_due_on: getString(source, ['next_due_on', 'nextDueOn']),
    tolerance_before_days: getNumber(source, ['tolerance_before_days', 'toleranceBeforeDays']),
    tolerance_after_days: getNumber(source, ['tolerance_after_days', 'toleranceAfterDays']),
    checklist_required: getBoolean(source, ['checklist_required', 'checklistRequired'], true),
    evidence_required: getBoolean(source, ['evidence_required', 'evidenceRequired'], true),
    is_active: getBoolean(source, ['is_active', 'isActive'], true),
    created_at: getString(source, ['created_at', 'createdAt']),
    updated_at: getString(source, ['updated_at', 'updatedAt']),
    asset: asRecord(source.asset)
      ? {
          id: getNumber(asRecord(source.asset)!, ['id']),
          asset_code: getString(asRecord(source.asset)!, ['asset_code', 'assetCode']),
          name: getString(asRecord(source.asset)!, ['name']),
          operational_status_name: getString(
            asRecord(source.asset)!,
            ['operational_status_name', 'operationalStatusName'],
          ) || null,
        }
      : null,
    frequency: normalizeMaintenanceFrequency(source.frequency),
    responsible_employee: normalizeHelpdeskAssetEmployee(source.responsible_employee ?? source.responsibleEmployee),
    quality_document: asRecord(source.quality_document ?? source.qualityDocument)
      ? {
          id: getString(asRecord(source.quality_document ?? source.qualityDocument)!, ['id']),
          title: getString(asRecord(source.quality_document ?? source.qualityDocument)!, ['title']),
          filename: getString(asRecord(source.quality_document ?? source.qualityDocument)!, ['filename']) || null,
        }
      : null,
    tasks: getArrayFromPayload(source.tasks ?? [], ['tasks'])
      .map(normalizeMaintenanceTask)
      .filter((task): task is HelpdeskMaintenancePlanTask => task !== null),
    orders: getArrayFromPayload(source.orders ?? [], ['orders'])
      .map(normalizeMaintenanceOrder)
      .filter((order): order is HelpdeskMaintenanceOrder => order !== null),
  };
};

