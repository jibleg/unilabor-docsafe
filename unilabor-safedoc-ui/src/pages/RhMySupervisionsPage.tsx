import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getMySupervision, listMySupervisions, type MySupervisionsOverview } from '../api/service.api-my-supervision';
import { getApiErrorMessage } from '../api/service.parsers';
import { MySupervisionDetail } from '../components/rh/supervision/MySupervisionDetail';
import { SIGNERS_TOTAL, buttonClass, cardClass, formatDateOnly } from '../components/rh/supervision/supervision-ui';
import type { SupervisionChecklist, SupervisionChecklistListRow } from '../types/models';
import { notifyError } from '../utils/notify';

type Tab = 'to_supervise' | 'in_signature';

const TABS: Array<[Tab, string, string]> = [
  ['to_supervise', 'Por supervisar', 'Listas de los colaboradores que tienes asignados: califícalas y envíalas a firma.'],
  ['in_signature', 'En firma', 'Listas que ya calificaste y esperan las tres firmas; se cierran solas al reunirlas.'],
];

const EMPTY: MySupervisionsOverview = { to_supervise: [], in_signature: [] };

/**
 * Mis supervisiones (ANA-REG-060, Fase 6 de Inducción): el supervisor asignado
 * califica sus listas y las envía a firma. La firma de todos (incluida la
 * suya) se coloca en el Buzón de firmas.
 */
export const RhMySupervisionsPage = () => {
  const [overview, setOverview] = useState<MySupervisionsOverview>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('to_supervise');
  const [detail, setDetail] = useState<SupervisionChecklist | null>(null);
  const [opening, setOpening] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listMySupervisions();
      setOverview(next);
      setTab((current) => (next.to_supervise.length === 0 && next.in_signature.length > 0 ? 'in_signature' : current));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar tus supervisiones.'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const open = async (row: SupervisionChecklistListRow) => {
    setOpening(row.id);
    try {
      setDetail(await getMySupervision(row.id));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo abrir la lista.'));
    } finally {
      setOpening(null);
    }
  };

  if (detail) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <section className={cardClass}>
          <MySupervisionDetail
            key={detail.id}
            checklist={detail}
            onBack={() => setDetail(null)}
            onDone={() => {
              setDetail(null);
              void load();
            }}
          />
        </section>
      </div>
    );
  }

  const rows = overview[tab];
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">Inducción · Fase 6 · ANA-REG-060</p>
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Mis supervisiones</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/rh/signature-inbox" className={buttonClass} title="Aquí se firma: tus listas enviadas a firma te esperan en el Buzón">
            <Inbox size={14} /> Buzón de firmas
          </Link>
          <button type="button" onClick={() => void load()} className={buttonClass}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </header>

      <div className="inline-flex overflow-hidden rounded-xl border border-[rgba(0,65,106,0.14)] bg-white">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-semibold ${tab === key ? 'bg-[var(--color-brand-700)] text-white' : 'text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]'}`}
          >
            {label} ({overview[key].length})
          </button>
        ))}
      </div>

      <section className={`${cardClass} space-y-3`}>
        <p className="text-sm text-[var(--unilabor-ink)]">{TABS.find(([key]) => key === tab)?.[2]}</p>
        {loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-6 text-center text-sm text-[var(--unilabor-neutral)]">Nada pendiente aquí.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => void open(row)}
                disabled={opening !== null}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white px-4 py-3 text-left hover:border-[var(--color-brand-300)] disabled:opacity-60"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--unilabor-ink)]">
                    {row.employee_name} · <span className="text-[var(--color-brand-700)]">{row.position_code}</span> {row.position_name}
                  </p>
                  <p className="text-[11px] text-[var(--unilabor-neutral)]">
                    {row.folio} · {row.process_area_name ?? 'Puesto sin área'} · {formatDateOnly(row.supervision_date)}
                    {tab === 'in_signature' ? ` · ${row.signatures_done} de ${SIGNERS_TOTAL} firmas` : ''}
                    {tab === 'to_supervise' && row.items_pending > 0 ? ` · ${row.items_pending} aspecto(s) sin calificar` : ''}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-500)]">
                  {opening === row.id ? <Loader2 size={13} className="animate-spin" /> : <ClipboardCheck size={13} />} Abrir
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
