import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Inbox, Loader2, PenLine, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { listSignatureInbox } from '../api/service.api-signature-inbox';
import { getApiErrorMessage } from '../api/service.parsers';
import { DrawerShell } from '../components/attendance/schedule/DrawerShell';
import { SignatureInboxPanel } from '../components/rh/supervision/SignatureInboxPanel';
import { SIGNERS_TOTAL, buttonClass, cardClass, describeSignerRoles, formatDateTime } from '../components/rh/supervision/supervision-ui';
import { usePendingSignaturesStore } from '../store/usePendingSignaturesStore';
import type { SignatureInbox, SignatureInboxEntry, SignatureInboxSignResult } from '../types/models';
import { notifyError, notifySuccess, notifyWarning } from '../utils/notify';

type Tab = 'pending' | 'signed';

const EMPTY: SignatureInbox = { pending: [], signed: [] };

/**
 * Buzón de firmas: las listas de verificación de Supervisión (ANA-REG-060) que
 * esperan la firma del usuario como Supervisor / Auditor, Responsable del Área
 * o Colaborador evaluado. Cada quien firma desde su sesión; con las tres firmas
 * la lista se cierra sola.
 */
export const RhSignatureInboxPage = () => {
  const refreshBadge = usePendingSignaturesStore((state) => state.refresh);
  const [inbox, setInbox] = useState<SignatureInbox>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('pending');
  const [selected, setSelected] = useState<SignatureInboxEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [lastResult, setLastResult] = useState<SignatureInboxSignResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInbox(await listSignatureInbox());
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar tu buzón de firmas.'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const open = (entry: SignatureInboxEntry) => {
    setSelected(entry);
    setDrawerOpen(true);
  };

  const handleSigned = (result: SignatureInboxSignResult) => {
    setDrawerOpen(false);
    setLastResult(result);
    const incomplete = Boolean(result.close_error) || (result.practical !== null && !result.practical.captured);
    if (incomplete) notifyWarning(result.message);
    else notifySuccess(result.closed ? 'Firma registrada: la lista quedó cerrada.' : 'Firma registrada.');
    void load();
    void refreshBadge();
  };

  const rows = inbox[tab];
  const resultIsWarning = lastResult ? Boolean(lastResult.close_error) || (lastResult.practical !== null && !lastResult.practical.captured) : false;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">Mi espacio · Supervisión ANA-REG-060</p>
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Buzón de firmas</h1>
          <p className="max-w-3xl text-sm leading-6 text-[var(--unilabor-ink)]">
            Listas de verificación que esperan tu firma. Firman el supervisor, el responsable del área y el colaborador evaluado, en cualquier
            orden; con la tercera firma la lista se cierra sola.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className={buttonClass}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </header>

      {lastResult ? (
        <div
          className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 ${
            resultIsWarning ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
          role="status"
        >
          <p className="flex items-start gap-2">
            {resultIsWarning ? <TriangleAlert size={16} className="mt-1 shrink-0" /> : <CheckCircle2 size={16} className="mt-1 shrink-0" />}
            <span>{lastResult.message}</span>
          </p>
          <button type="button" onClick={() => setLastResult(null)} className="rounded-lg p-1 hover:bg-white/60" title="Ocultar aviso" aria-label="Ocultar aviso">
            <X size={16} />
          </button>
        </div>
      ) : null}

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

      <section className={`${cardClass} space-y-3`}>
        {loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </p>
        ) : rows.length === 0 ? (
          <p className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-8 text-center text-sm text-[var(--unilabor-neutral)]">
            <Inbox size={22} />
            {tab === 'pending' ? 'No tienes firmas pendientes.' : 'Aún no has firmado listas.'}
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((entry) => (
              <button
                key={entry.checklist_id}
                type="button"
                onClick={() => open(entry)}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white px-4 py-3 text-left hover:border-[var(--color-brand-300)]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--unilabor-ink)]">
                    {entry.employee_name} · <span className="text-[var(--color-brand-700)]">{entry.position_code}</span> {entry.position_name}
                  </p>
                  <p className="text-[11px] leading-5 text-[var(--unilabor-neutral)]">
                    {entry.folio}
                    {entry.branch_name ? ` · ${entry.branch_name}` : ''} · Mi rol: <span className="font-semibold text-[var(--unilabor-ink)]">{describeSignerRoles(entry.my_roles)}</span>
                    {tab === 'pending'
                      ? ` · enviada${entry.requested_by_name ? ` por ${entry.requested_by_name}` : ''} el ${formatDateTime(entry.requested_at)}`
                      : ` · firmé el ${formatDateTime(entry.my_signed_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {entry.status === 'CLOSED' ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Cerrada</span>
                  ) : (
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                      {entry.signatures_done} de {SIGNERS_TOTAL} firmas
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
            ))}
          </div>
        )}
      </section>

      <DrawerShell
        open={drawerOpen}
        title={selected ? `${selected.folio} · ${selected.position_code}` : 'Lista de verificación'}
        subtitle="Lista de verificación de Supervisión (ANA-REG-060)"
        onClose={() => setDrawerOpen(false)}
        widthClass="max-w-2xl"
        busy={signing}
      >
        {selected ? <SignatureInboxPanel key={selected.checklist_id} entry={selected} onBusyChange={setSigning} onSigned={handleSigned} /> : null}
      </DrawerShell>
    </div>
  );
};
