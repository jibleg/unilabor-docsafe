import { useMemo, useState } from 'react';
import { ArrowUpDown, Eye, ExternalLink, Search, Table2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AgreementBucket, AgreementItem, AgreementPartyType } from '../../../types/models';
import { CompactListPager } from '../../CompactListPager';
import { BUCKET_META, BUCKET_ORDER, PARTY_META, formatDate, formatDays } from '../../../utils/agreementDashboard';

interface AgreementTableProps {
  items: AgreementItem[];
  includes: { providers: boolean; clients: boolean };
  activeBucket: AgreementBucket | null;
  onFocusBucket: (bucket: AgreementBucket | null) => void;
  /** Abre el documento del acuerdo en el visor protegido. */
  onView: (item: AgreementItem) => void;
}

type SortKey = 'expiry' | 'party' | 'category' | 'bucket';

/** Tamaños de página del detalle de acuerdos. */
const PAGE_SIZES = [10, 20, 30];

const Th = ({ label, k, active, onSort }: { label: string; k?: SortKey; active?: boolean; onSort?: (key: SortKey) => void }) => (
  <th className="px-3 py-2">
    {k && onSort ? (
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 ${active ? 'text-[var(--color-brand-700)]' : ''}`}>
        {label} <ArrowUpDown size={11} />
      </button>
    ) : (
      label
    )}
  </th>
);

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Tabla detallada de acuerdos con búsqueda, filtros y orden; cada fila abre la ficha. */
export const AgreementTable = ({ items, includes, activeBucket, onFocusBucket, onView }: AgreementTableProps) => {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [party, setParty] = useState<AgreementPartyType | ''>('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'expiry', dir: 1 });
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  // La página se ata a la firma de filtros/orden: si cambia cualquiera (incluido el
  // estado elegido desde las tarjetas o la línea de tiempo) se regresa a la página 1.
  const filterKey = [q, party, category, activeBucket ?? '', sort.key, sort.dir, pageSize].join('|');
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });

  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category_name ?? 'Sin categoría'))).sort(), [items]);
  const rows = useMemo(() => {
    const nq = normalize(q.trim());
    const list = items.filter(
      (item) =>
        (!activeBucket || item.bucket === activeBucket) &&
        (!party || item.party_type === party) &&
        (!category || (item.category_name ?? 'Sin categoría') === category) &&
        (!nq || normalize(`${item.party_name} ${item.title} ${item.description ?? ''} ${item.category_name ?? ''} ${item.classification ?? ''} ${item.party_rfc ?? ''}`).includes(nq)),
    );
    const cmp = (a: AgreementItem, b: AgreementItem): number => {
      switch (sort.key) {
        case 'party':
          return a.party_name.localeCompare(b.party_name);
        case 'category':
          return (a.category_name ?? '').localeCompare(b.category_name ?? '');
        case 'bucket':
          return BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket);
        default:
          if (a.expiry_date === b.expiry_date) return a.party_name.localeCompare(b.party_name);
          if (!a.expiry_date) return 1;
          if (!b.expiry_date) return -1;
          return a.expiry_date.localeCompare(b.expiry_date);
      }
    };
    return list.sort((a, b) => cmp(a, b) * sort.dir);
  }, [items, activeBucket, party, category, q, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = pageState.key === filterKey ? Math.min(pageState.page, totalPages) : 1;
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key: SortKey) => setSort((prev) => ({ key, dir: prev.key === key ? ((prev.dir * -1) as 1 | -1) : 1 }));

  return (
    <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-lg font-bold text-[var(--color-brand-700)]">
          <Table2 size={18} /> Detalle de acuerdos
          <span className="rounded-full bg-[rgba(191,212,230,0.4)] px-2 py-0.5 text-xs font-semibold text-[var(--color-brand-700)]">{rows.length}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar contraparte, título, RFC…"
              className="w-64 rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] py-2 pl-9 pr-3 text-sm focus:border-[var(--color-brand-300)] focus:outline-none focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
            />
          </label>
          {includes.providers && includes.clients ? (
            <select value={party} onChange={(e) => setParty(e.target.value as AgreementPartyType | '')} className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-2 py-2 text-xs">
              <option value="">Proveedores y clientes</option>
              <option value="provider">Solo proveedores</option>
              <option value="client">Solo clientes</option>
            </select>
          ) : null}
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-2 py-2 text-xs">
            <option value="">Todos los tipos</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={activeBucket ?? ''} onChange={(e) => onFocusBucket((e.target.value || null) as AgreementBucket | null)} className="rounded-xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-2 py-2 text-xs">
            <option value="">Todos los estados</option>
            {BUCKET_ORDER.map((b) => (
              <option key={b} value={b}>
                {BUCKET_META[b].label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-[rgba(0,65,106,0.08)]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[rgba(248,251,253,0.9)] text-[10px] uppercase tracking-wide text-[var(--unilabor-neutral)]">
            <tr>
              <Th label="Estado" k="bucket" active={sort.key === 'bucket'} onSort={toggleSort} />
              <Th label="Contraparte" k="party" active={sort.key === 'party'} onSort={toggleSort} />
              <Th label="Tipo" k="category" active={sort.key === 'category'} onSort={toggleSort} />
              <th className="px-3 py-2">Acuerdo</th>
              <th className="px-3 py-2">Vigencia desde</th>
              <Th label="Vence" k="expiry" active={sort.key === 'expiry'} onSort={toggleSort} />
              <th className="px-3 py-2">Plazo</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--unilabor-neutral)]">
                  Ningún acuerdo coincide con los filtros.
                </td>
              </tr>
            ) : (
              pagedRows.map((item, index) => {
                const meta = BUCKET_META[item.bucket];
                return (
                  <tr key={`${item.party_type}-${item.id}`} className="border-t border-[rgba(0,65,106,0.06)] transition hover:bg-[rgba(239,245,250,0.8)]" style={{ animation: `agr-fade .3s ease ${Math.min(index, 20) * 20}ms both` }}>
                    <td className="px-3 py-2.5 align-top">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${meta.soft} ${meta.text}`}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                        {meta.short}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <p className="font-semibold text-[var(--color-brand-700)]">{item.party_name}</p>
                      <p className="text-[11px] text-[var(--unilabor-neutral)]">
                        <span className={`mr-1 rounded px-1 text-[9px] font-bold ${PARTY_META[item.party_type].soft} ${PARTY_META[item.party_type].text}`}>{PARTY_META[item.party_type].label}</span>
                        {item.classification ?? ''}
                        {item.party_rfc ? ` · ${item.party_rfc}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-[var(--unilabor-ink)]">{item.category_name ?? '—'}</td>
                    <td className="px-3 py-2.5 align-top">
                      <p className="text-xs text-[var(--unilabor-ink)]">{item.title}</p>
                      {item.description ? <p className="text-[11px] text-[var(--unilabor-neutral)]">{item.description}</p> : null}
                      {item.version_chain > 1 ? <p className="text-[10px] text-[var(--unilabor-neutral)]">{item.version_chain} versiones</p> : null}
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs">{formatDate(item.effective_from)}</td>
                    <td className="px-3 py-2.5 align-top text-xs font-semibold" style={{ color: item.expiry_date ? meta.color : undefined }}>
                      {formatDate(item.expiry_date)}
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-[var(--unilabor-ink)]">{formatDays(item.days_to_expiry)}</td>
                    <td className="px-3 py-2.5 text-right align-top">
                      <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onView(item)}
                        title="Ver el documento en el visor protegido"
                        className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-brand-700)] px-2 py-1 text-[11px] font-semibold text-white transition hover:opacity-90"
                      >
                        <Eye size={11} /> Ver
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(item.detail_path)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.3)]"
                      >
                        Ficha <ExternalLink size={11} />
                      </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <CompactListPager
        page={page}
        pageSize={pageSize}
        total={rows.length}
        pageSizeOptions={PAGE_SIZES}
        onPageChange={(next) => setPageState({ key: filterKey, page: next })}
        onPageSizeChange={setPageSize}
        sizeLabel="Acuerdos por página"
      />
      </div>
    </section>
  );
};
