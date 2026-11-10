import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Inbox, Loader2, PenLine, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { SIGNATURE_BATCH_MAX, listSignatureInbox } from '../api/service.api-signature-inbox';
import { getApiErrorMessage } from '../api/service.parsers';
import { DrawerShell } from '../components/attendance/schedule/DrawerShell';
import { BatchSignPanel } from '../components/rh/phase7-signature/BatchSignPanel';
import { DocumentInboxPanel } from '../components/rh/phase7-signature/DocumentInboxPanel';
import { SignatureInboxPanel } from '../components/rh/supervision/SignatureInboxPanel';
import { buttonClass, cardClass, formatDateTime, primaryButtonClass } from '../components/rh/supervision/supervision-ui';
import { usePendingSignaturesStore } from '../store/usePendingSignaturesStore';
import type { InboxKind, SignatureInbox, SignatureInboxBatchResult, SignatureInboxEntry, SignatureInboxSignOutcome, SignedDocumentKind } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';

type Tab = 'pending' | 'signed';
type KindFilter = 'ALL' | InboxKind;

const EMPTY: SignatureInbox = { pending: [], signed: [] };

const KIND_FILTERS: Array<[KindFilter, string]> = [
  ['ALL', 'Todos'],
  ['SUPERVISION', 'ANA-REG-060'],
  ['COMPETENCY_EVALUATION', 'REH-REG-003'],
  ['ASSIGNMENT_LETTER', 'REH-REG-008'],
];

const keyOf = (entry: Pick<SignatureInboxEntry, 'kind' | 'id'>) => `${entry.kind}:${entry.id}`;

/** Aviso que queda arriba después de firmar (una firma o un lote). */
interface LastResult {
  message: string;
  warning: boolean;
  /** Registros del lote que no se pudieron firmar. */
  failures: Array<{ folio: string; message: string }>;
}

type Drawer = { mode: 'one'; entry: SignatureInboxEntry } | { mode: 'batch'; entries: SignatureInboxEntry[] } | null;

/**
 * Buzón de firmas: los registros que esperan la firma del usuario. ANA-REG-060
 * (Supervisión, Fase 6), REH-REG-003 (Evaluación de competencia) y REH-REG-008
 * (Carta de asignación, Fase 7). Cada quien firma desde su sesión, en cualquier
 * orden; con la última firma el registro se cierra solo. Quien tiene varios
 * pendientes puede elegirlos y firmarlos de una vez (firma en lote).
 */
export const RhSignatureInboxPage = () => {
  const refreshBadge = usePendingSignaturesStore((state) => state.refresh);
  const [inbox, setInbox] = useState<SignatureInbox>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('pending');
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [signing, setSigning] = useState(false);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await listSignatureInbox();
      setInbox(loaded);
      // La selección solo conserva lo que sigue pendiente.
      const stillPending = new Set(loaded.pending.map(keyOf));
      setSelected((current) => new Set([...current].filter((key) => stillPending.has(key))));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar tu buzón de firmas.'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => inbox[tab].filter((entry) => kindFilter === 'ALL' || entry.kind === kindFilter), [inbox, tab, kindFilter]);
  const countOf = (kind: KindFilter) => inbox[tab].filter((entry) => kind === 'ALL' || entry.kind === kind).length;
  const selectedEntries = useMemo(() => inbox.pending.filter((entry) => selected.has(keyOf(entry))), [inbox.pending, selected]);
  const visibleKeys = rows.map(keyOf);
  const allVisibleSelected = tab === 'pending' && visibleKeys.length > 0 && visibleKeys.every((key) => selected.has(key));

  const toggle = (entry: SignatureInboxEntry) =>
    setSelected((current) => {
      const next = new Set(current);
      const key = keyOf(entry);
      if (next.has(key)) next.delete(key);
      else if (next.size >= SIGNATURE_BATCH_MAX) notifyWarning(`A lo más ${SIGNATURE_BATCH_MAX} registros por firma en lote.`);
      else next.add(key);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleKeys.forEach((key) => next.delete(key));
      else visibleKeys.slice(0, Math.max(0, SIGNATURE_BATCH_MAX - next.size)).forEach((key) => next.add(key));
      return next;
    });

  const afterSigning = () => {
    setDrawer(null);
    void load();
    void refreshBadge();
  };

  const handleSigned = (result: SignatureInboxSignOutcome) => {
    setLastResult({ message: result.message, warning: result.warning, failures: [] });
    if (result.warning) notifyWarning(result.message);
    else notifySuccess(result.closed ? 'Firma registrada: el registro quedó cerrado.' : 'Firma registrada.');
    afterSigning();
  };

  const handleBatchSigned = (result: SignatureInboxBatchResult) => {
    const failures = result.results.filter((item) => !item.ok).map((item) => ({ folio: item.folio, message: item.message }));
    const warnings = result.results.filter((item) => item.ok && item.warning).map((item) => ({ folio: item.folio, message: item.message }));
    const warning = failures.length > 0 || warnings.length > 0;
    setLastResult({ message: result.message, warning, failures: [...failures, ...warnings] });
    if (warning) notifyWarning(result.message);
    else notifySuccess(result.message);
    setSelected(new Set());
    afterSigning();
  };

  const drawerTitle =
    drawer?.mode === 'batch' ? `Firmar ${drawer.entries.length} registro(s)` : drawer ? `${drawer.entry.folio} · ${drawer.entry.position_code}` : '';
  const drawerSubtitle = drawer?.mode === 'batch' ? 'Firma en lote' : drawer ? `${drawer.entry.form_code} · ${drawer.entry.title}` : '';

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">Mi espacio · Inducción Fases 6 y 7</p>
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Buzón de firmas</h1>
          <p className="max-w-3xl text-sm leading-6 text-[var(--unilabor-ink)]">
            Registros que esperan tu firma. Cada firmante firma desde su sesión, en cualquier orden; con la última firma el registro se cierra solo. Si
            tienes varios, selecciónalos y fírmalos de una vez.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className={buttonClass}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </header>

      {lastResult ? (
        <div
          className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 ${
            lastResult.warning ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
          role="status"
        >
          <div className="space-y-1">
            <p className="flex items-start gap-2">
              {lastResult.warning ? <TriangleAlert size={16} className="mt-1 shrink-0" /> : <CheckCircle2 size={16} className="mt-1 shrink-0" />}
              <span>{lastResult.message}</span>
            </p>
            {lastResult.failures.length > 0 ? (
              <ul className="list-disc pl-8 text-xs leading-5">
                {lastResult.failures.map((failure) => (
                  <li key={failure.folio}>
                    <span className="font-semibold">{failure.folio}:</span> {failure.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button type="button" onClick={() => setLastResult(null)} className="rounded-lg p-1 hover:bg-white/60" title="Ocultar aviso" aria-label="Ocultar aviso">
            <X size={16} />
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-xl border border-[rgba(0,65,106,0.14)] bg-white">
          {(
            [
              ['pending', 'Pendientes'],
              ['signed', 'Firmadas'],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-semibold ${tab === key ? 'bg-[var(--color-brand-700)] text-white' : 'text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]'}`}
            >
              {label} ({inbox[key].length})
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {KIND_FILTERS.map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              onClick={() => setKindFilter(kind)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                kindFilter === kind
                  ? 'border-[var(--color-brand-700)] bg-[var(--color-brand-700)] text-white'
                  : 'border-[rgba(0,65,106,0.14)] bg-white text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]'
              }`}
            >
              {label} ({countOf(kind)})
            </button>
          ))}
        </div>
      </div>

      {tab === 'pending' && rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white px-4 py-2">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--unilabor-ink)]">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="h-4 w-4 accent-[var(--color-brand-700)]" />
            Seleccionar {kindFilter === 'ALL' ? 'todos' : 'los visibles'}
          </label>
          <button
            type="button"
            onClick={() => setDrawer({ mode: 'batch', entries: selectedEntries })}
            disabled={selectedEntries.length === 0}
            className={primaryButtonClass}
            title="Revisar los registros seleccionados y firmarlos con un solo trazo"
          >
            <PenLine size={14} /> Firmar seleccionados ({selectedEntries.length})
          </button>
        </div>
      ) : null}

      <section className={`${cardClass} space-y-3`}>
        {loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </p>
        ) : rows.length === 0 ? (
          <p className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-8 text-center text-sm text-[var(--unilabor-neutral)]">
            <Inbox size={22} />
            {tab === 'pending' ? 'No tienes firmas pendientes.' : 'Aún no has firmado registros.'}
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((entry) => {
              const key = keyOf(entry);
              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 ${
                    selected.has(key) ? 'border-[var(--color-brand-300)] bg-[rgba(191,212,230,0.18)]' : 'border-[rgba(0,65,106,0.1)]'
                  }`}
                >
                  {tab === 'pending' ? (
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggle(entry)}
                      className="h-4 w-4 shrink-0 accent-[var(--color-brand-700)]"
                      aria-label={`Seleccionar ${entry.folio}`}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setDrawer({ mode: 'one', entry })}
                    className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--unilabor-ink)]">
                        {entry.employee_name} · <span className="text-[var(--color-brand-700)]">{entry.position_code}</span> {entry.position_name}
                      </p>
                      <p className="text-[11px] leading-5 text-[var(--unilabor-neutral)]">
                        <span className="font-semibold text-[var(--color-brand-700)]">{entry.form_code}</span> {entry.title} · {entry.folio}
                        {entry.detail ? ` · ${entry.detail}` : ''}
                        {entry.branch_name ? ` · ${entry.branch_name}` : ''}
                      </p>
                      <p className="text-[11px] leading-5 text-[var(--unilabor-neutral)]">
                        Mi rol: <span className="font-semibold text-[var(--unilabor-ink)]">{entry.my_roles_label}</span>
                        {tab === 'pending'
                          ? ` · enviado${entry.requested_by_name ? ` por ${entry.requested_by_name}` : ''} el ${formatDateTime(entry.requested_at)}`
                          : ` · firmé el ${formatDateTime(entry.my_signed_at)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {entry.status === 'CLOSED' ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Cerrado</span>
                      ) : (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                          {entry.signatures_done} de {entry.signatures_total} firmas
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-500)]">
                        {tab === 'pending' ? (
                          <>
                            <PenLine size={13} /> Firmar
                          </>
                        ) : (
                          'Ver'
                        )}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <DrawerShell open={drawer !== null} title={drawerTitle} subtitle={drawerSubtitle} onClose={() => setDrawer(null)} widthClass="max-w-2xl" busy={signing}>
        {drawer?.mode === 'batch' ? (
          <BatchSignPanel key={drawer.entries.map(keyOf).join(',')} entries={drawer.entries} onBusyChange={setSigning} onSigned={handleBatchSigned} />
        ) : drawer?.mode === 'one' ? (
          drawer.entry.kind === 'SUPERVISION' ? (
            <SignatureInboxPanel key={keyOf(drawer.entry)} entry={drawer.entry} onBusyChange={setSigning} onSigned={handleSigned} />
          ) : (
            <DocumentInboxPanel
              key={keyOf(drawer.entry)}
              entry={drawer.entry as SignatureInboxEntry & { kind: SignedDocumentKind }}
              onBusyChange={setSigning}
              onSigned={handleSigned}
            />
          )
        ) : null}
      </DrawerShell>
    </div>
  );
};
