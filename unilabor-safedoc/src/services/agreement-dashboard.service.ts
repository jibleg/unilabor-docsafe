import pool from '../config/db';

// -----------------------------------------------------------------------------
// Panorama ejecutivo de Acuerdos (modulo Prestacion de servicios): contratos y
// convenios vigentes con proveedores y clientes, su calendario de vencimiento y
// los indicadores que necesita Direccion. Solo lectura sobre provider_documents
// y client_documents (vigentes, no eliminados).
// -----------------------------------------------------------------------------

export type AgreementPartyType = 'provider' | 'client';
export type AgreementBucket = 'expired' | 'critical' | 'warning' | 'upcoming' | 'ok' | 'no_expiry';

export interface AgreementItem {
  id: number;
  party_type: AgreementPartyType;
  party_id: number;
  party_name: string;
  party_rfc: string | null;
  classification: string | null;
  category_code: string | null;
  category_name: string | null;
  title: string;
  description: string | null;
  document_date: string | null;
  effective_from: string | null;
  expiry_date: string | null;
  days_to_expiry: number | null;
  bucket: AgreementBucket;
  version_chain: number;
  uploaded_by_name: string | null;
  created_at: string;
  detail_path: string;
}

export interface AgreementDashboard {
  generated_at: string;
  today: string;
  includes: { providers: boolean; clients: boolean };
  kpis: {
    agreements: number;
    providers_with_agreements: number;
    clients_with_agreements: number;
    providers_active: number;
    clients_active: number;
    expired: number;
    critical_30: number;
    warning_60: number;
    upcoming_90: number;
    ok: number;
    no_expiry: number;
    expiring_this_year: number;
    next_expiry: AgreementItem | null;
  };
  by_bucket: Record<AgreementBucket, number>;
  by_category: Array<{ category: string; providers: number; clients: number }>;
  by_month: Array<{ month: string; providers: number; clients: number; expired: number }>;
  by_party: Array<{
    party_type: AgreementPartyType;
    party_id: number;
    party_name: string;
    classification: string | null;
    agreements: number;
    worst_bucket: AgreementBucket;
    next_expiry_date: string | null;
  }>;
  alert_recipients: { providers: number; clients: number };
  items: AgreementItem[];
}

const BUCKET_ORDER: AgreementBucket[] = ['expired', 'critical', 'warning', 'upcoming', 'ok', 'no_expiry'];

const dateOnly = (value: unknown): string | null => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
};

const daysBetween = (from: string, to: string): number =>
  Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);

export const bucketFor = (daysToExpiry: number | null): AgreementBucket => {
  if (daysToExpiry === null) return 'no_expiry';
  if (daysToExpiry < 0) return 'expired';
  if (daysToExpiry <= 30) return 'critical';
  if (daysToExpiry <= 60) return 'warning';
  if (daysToExpiry <= 90) return 'upcoming';
  return 'ok';
};

const ITEMS_SQL = (party: AgreementPartyType): string =>
  party === 'provider'
    ? `SELECT d.id, s.id AS party_id, s.name AS party_name, s.rfc AS party_rfc, cl.name AS classification,
              c.code AS category_code, c.name AS category_name, d.title, d.description,
              d.document_date, d.effective_from, d.expiry_date, d.created_at, u.full_name AS uploaded_by_name,
              (SELECT COUNT(*)::int FROM public.provider_documents h WHERE h.provider_id = d.provider_id AND h.category_id = d.category_id AND h.title = d.title) AS version_chain
         FROM public.provider_documents d
         JOIN public.helpdesk_suppliers s ON s.id = d.provider_id
         LEFT JOIN public.provider_document_categories c ON c.id = d.category_id
         LEFT JOIN public.provider_client_classifications cl ON cl.id = s.classification_id
         LEFT JOIN public.users u ON u.id = d.uploaded_by
        WHERE d.status = 'active' AND d.deleted_at IS NULL AND s.is_active = TRUE
        ORDER BY d.expiry_date ASC NULLS LAST, s.name ASC;`
    : `SELECT d.id, s.id AS party_id, s.name AS party_name, s.rfc AS party_rfc, cl.name AS classification,
              c.code AS category_code, c.name AS category_name, d.title, d.description,
              d.document_date, d.effective_from, d.expiry_date, d.created_at, u.full_name AS uploaded_by_name,
              (SELECT COUNT(*)::int FROM public.client_documents h WHERE h.client_id = d.client_id AND h.category_id = d.category_id AND h.title = d.title) AS version_chain
         FROM public.client_documents d
         JOIN public.clients s ON s.id = d.client_id
         LEFT JOIN public.client_document_categories c ON c.id = d.category_id
         LEFT JOIN public.provider_client_classifications cl ON cl.id = s.classification_id
         LEFT JOIN public.users u ON u.id = d.uploaded_by
        WHERE d.status = 'active' AND d.deleted_at IS NULL AND s.is_active = TRUE
        ORDER BY d.expiry_date ASC NULLS LAST, s.name ASC;`;

const loadItems = async (party: AgreementPartyType, today: string): Promise<AgreementItem[]> => {
  const result = await pool.query(ITEMS_SQL(party));
  return result.rows.map((row) => {
    const expiry = dateOnly(row.expiry_date);
    const days = expiry ? daysBetween(today, expiry) : null;
    return {
      id: Number(row.id),
      party_type: party,
      party_id: Number(row.party_id),
      party_name: String(row.party_name),
      party_rfc: row.party_rfc ? String(row.party_rfc) : null,
      classification: row.classification ? String(row.classification) : null,
      category_code: row.category_code ? String(row.category_code) : null,
      category_name: row.category_name ? String(row.category_name) : null,
      title: String(row.title),
      description: row.description ? String(row.description) : null,
      document_date: dateOnly(row.document_date),
      effective_from: dateOnly(row.effective_from),
      expiry_date: expiry,
      days_to_expiry: days,
      bucket: bucketFor(days),
      version_chain: Number(row.version_chain ?? 1),
      uploaded_by_name: row.uploaded_by_name ? String(row.uploaded_by_name) : null,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      detail_path: party === 'provider' ? `/providers/${Number(row.party_id)}` : `/providers/clients/${Number(row.party_id)}`,
    };
  });
};

const countActive = async (table: 'helpdesk_suppliers' | 'clients'): Promise<number> => {
  const result = await pool.query(`SELECT COUNT(*)::int AS total FROM public.${table} WHERE is_active = TRUE;`);
  return Number(result.rows[0]?.total ?? 0);
};

const countRecipients = async (table: 'provider_notification_recipients' | 'client_notification_recipients'): Promise<number> => {
  try {
    const result = await pool.query(`SELECT COUNT(*)::int AS total FROM public.${table};`);
    return Number(result.rows[0]?.total ?? 0);
  } catch {
    return 0;
  }
};

const worstBucket = (buckets: AgreementBucket[]): AgreementBucket =>
  BUCKET_ORDER.find((bucket) => buckets.includes(bucket)) ?? 'no_expiry';

export const getAgreementDashboard = async (includes: { providers: boolean; clients: boolean }): Promise<AgreementDashboard> => {
  const today = new Date().toISOString().slice(0, 10);
  const [providerItems, clientItems] = await Promise.all([
    includes.providers ? loadItems('provider', today) : Promise.resolve([]),
    includes.clients ? loadItems('client', today) : Promise.resolve([]),
  ]);
  const items = [...providerItems, ...clientItems].sort((a, b) => {
    if (a.expiry_date === b.expiry_date) return a.party_name.localeCompare(b.party_name);
    if (!a.expiry_date) return 1;
    if (!b.expiry_date) return -1;
    return a.expiry_date.localeCompare(b.expiry_date);
  });

  const byBucket = BUCKET_ORDER.reduce((acc, bucket) => ({ ...acc, [bucket]: 0 }), {} as Record<AgreementBucket, number>);
  const categoryMap = new Map<string, { providers: number; clients: number }>();
  const monthMap = new Map<string, { providers: number; clients: number; expired: number }>();
  const partyMap = new Map<string, AgreementDashboard['by_party'][number] & { buckets: AgreementBucket[] }>();
  for (const item of items) {
    byBucket[item.bucket] += 1;
    const category = item.category_name ?? 'Sin categoría';
    const cat = categoryMap.get(category) ?? { providers: 0, clients: 0 };
    cat[item.party_type === 'provider' ? 'providers' : 'clients'] += 1;
    categoryMap.set(category, cat);
    if (item.expiry_date) {
      const month = item.expiry_date.slice(0, 7);
      const m = monthMap.get(month) ?? { providers: 0, clients: 0, expired: 0 };
      m[item.party_type === 'provider' ? 'providers' : 'clients'] += 1;
      if (item.bucket === 'expired') m.expired += 1;
      monthMap.set(month, m);
    }
    const key = `${item.party_type}:${item.party_id}`;
    const party = partyMap.get(key) ?? {
      party_type: item.party_type,
      party_id: item.party_id,
      party_name: item.party_name,
      classification: item.classification,
      agreements: 0,
      worst_bucket: 'no_expiry' as AgreementBucket,
      next_expiry_date: null as string | null,
      buckets: [] as AgreementBucket[],
    };
    party.agreements += 1;
    party.buckets.push(item.bucket);
    if (item.expiry_date && item.days_to_expiry !== null && item.days_to_expiry >= 0) {
      if (!party.next_expiry_date || item.expiry_date < party.next_expiry_date) party.next_expiry_date = item.expiry_date;
    }
    partyMap.set(key, party);
  }

  const [providersActive, clientsActive, providerRecipients, clientRecipients] = await Promise.all([
    includes.providers ? countActive('helpdesk_suppliers') : Promise.resolve(0),
    includes.clients ? countActive('clients') : Promise.resolve(0),
    includes.providers ? countRecipients('provider_notification_recipients') : Promise.resolve(0),
    includes.clients ? countRecipients('client_notification_recipients') : Promise.resolve(0),
  ]);

  const year = today.slice(0, 4);
  const nextExpiry = items.find((item) => item.days_to_expiry !== null && item.days_to_expiry >= 0) ?? null;

  return {
    generated_at: new Date().toISOString(),
    today,
    includes,
    kpis: {
      agreements: items.length,
      providers_with_agreements: new Set(providerItems.map((item) => item.party_id)).size,
      clients_with_agreements: new Set(clientItems.map((item) => item.party_id)).size,
      providers_active: providersActive,
      clients_active: clientsActive,
      expired: byBucket.expired,
      critical_30: byBucket.critical,
      warning_60: byBucket.warning,
      upcoming_90: byBucket.upcoming,
      ok: byBucket.ok,
      no_expiry: byBucket.no_expiry,
      expiring_this_year: items.filter((item) => item.expiry_date?.startsWith(year) && item.bucket !== 'expired').length,
      next_expiry: nextExpiry,
    },
    by_bucket: byBucket,
    by_category: Array.from(categoryMap.entries())
      .map(([category, counts]) => ({ category, ...counts }))
      .sort((a, b) => b.providers + b.clients - (a.providers + a.clients)),
    by_month: Array.from(monthMap.entries())
      .map(([month, counts]) => ({ month, ...counts }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    by_party: Array.from(partyMap.values())
      .map(({ buckets, ...party }) => ({ ...party, worst_bucket: worstBucket(buckets) }))
      .sort((a, b) => BUCKET_ORDER.indexOf(a.worst_bucket) - BUCKET_ORDER.indexOf(b.worst_bucket) || a.party_name.localeCompare(b.party_name)),
    alert_recipients: { providers: providerRecipients, clients: clientRecipients },
    items,
  };
};
