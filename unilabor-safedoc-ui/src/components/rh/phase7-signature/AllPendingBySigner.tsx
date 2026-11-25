import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageUp, Inbox, Loader2, Search } from 'lucide-react';
import { SIGNATURE_BATCH_MAX, listAllPendingBySigner } from '../../../api/service.api-signature-inbox';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { InboxKind, PendingSigner, PendingSignerGroup, SignatureInboxEntry } from '../../../types/models';
import { notifyError, notifyWarning } from '../../../utils/notify';
import { cardClass, formatDateTime, primaryButtonClass } from '../supervision/supervision-ui';

interface AllPendingBySignerProps {
  /** 'ALL' o el formato elegido en los filtros de la página. */
  kindFilter: 'ALL' | InboxKind;
  /** Cambia cada vez que hay que volver a cargar (después de firmar o al pulsar Actualizar). */
  reloadKey: number;
  onOpenOne: (entry: SignatureInboxEntry, signer: PendingSigner) => void;
  onOpenBatch: (entries: SignatureInboxEntry[], signer: PendingSigner) => void;
}

const COMBINING_MARKS = /[̀-ͯ]/g;
const normalize = (value: string): string => value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
const keyOf = (signerId: number, entry: Pick<SignatureInboxEntry, 'kind' | 'id'>) => `${signerId}|${entry.kind}:${entry.id}`;

/**
 * Todos los pendientes, agrupados por firmante (firma por imagen a nombre del
 * firmante). Cada grupo es el buzón de esa persona: se firma un registro o se
 * marcan varios y se firman con un solo archivo, el de la firma de ESA persona.
 * La selección es por grupo porque cada firmante tiene su propio archivo.
 */
export const AllPendingBySigner = ({ kindFilter, reloadKey, onOpenOne, onOpenBatch }: AllPendingBySignerProps) => {
  const [groups, setGroups] = useState<PendingSignerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await listAllPendingBySigner();
      setGroups(loaded);
      // La selección solo conserva lo que sigue pendiente.
      const stillPending = new Set(loaded.flatMap((group) => group.pending.map((entry) => keyOf(group.signer.employee_id, entry))));
      setSelected((current) => new Set([...current].filter((key) => stillPending.has(key))));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los pendientes de firma.'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const visible = useMemo(() => {
    const term = normalize(search.trim());
    return groups
      .map((group) => ({
        signer: group.signer,
        pending: group.pending.filter(
          (entry) =>
            (kindFilter === 'ALL' || entry.kind === kindFilter) &&
            (!term || normalize(`${group.signer.full_name} ${entry.employee_name} ${entry.folio} ${entry.position_code}`).includes(term)),
        ),
      }))
      .filter((group) => group.pending.length > 0);
  }, [groups, kindFilter, search]);

  const totalRecords = visible.reduce((sum, group) => sum + group.pending.length, 0);

  const toggle = (signerId: number, entry: SignatureInboxEntry, groupSelected: number) =>
    setSelected((current) => {
      const next = new Set(current);
      const key = keyOf(signerId, entry);
      if (next.has(key)) next.delete(key);
      else if (groupSelected >= SIGNATURE_BATCH_MAX) notifyWarning(`A lo más ${SIGNATURE_BATCH_MAX} registros por firma en lote.`);
      else next.add(key);
      return next;
    });

  const toggleGroup = (group: PendingSignerGroup, allSelected: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      const keys = group.pending.map((entry) => keyOf(group.signer.employee_id, entry));
      if (allSelected) keys.forEach((key) => next.delete(key));
      else keys.slice(0, SIGNATURE_BATCH_MAX).forEach((key) => next.add(key));
      return next;
    });

  return (
    <section className={`${cardClass} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--unilabor-ink)]">
          <b className="tabular-nums">{totalRecords}</b> firma(s) pendiente(s) de <b className="tabular-nums">{visible.length}</b> firmante(s)
        </p>
        <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Busca firmante, colaborador o folio…"
            className="w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white py-2 pl-9 pr-3 text-sm text-[var(--unilabor-ink)] outline-none focus:border-[var(--color-brand-500)]"
            aria-label="Buscar en los pendientes"
          />
        </label>
      </div>

      {loading && groups.length === 0 ? (
        <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
          <Loader2 size={14} className="animate-spin" /> Cargando…
        </p>
      ) : visible.length === 0 ? (
        <p className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-8 text-center text-sm text-[var(--unilabor-neutral)]">
          <Inbox size={22} />
          {groups.length === 0 ? 'No hay firmas pendientes de ningún firmante.' : 'Ningún pendiente coincide con el filtro.'}
        </p>
      ) : (
        <div className="space-y-4">
          {visible.map((group) => {
            const signerId = group.signer.employee_id;
            const chosen = group.pending.filter((entry) => selected.has(keyOf(signerId, entry)));
            const allSelected = chosen.length === group.pending.length;
            return (
              <div key={signerId} className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.12)] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.9)] px-4 py-2.5">
                  <label className="inline-flex min-w-0 items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => toggleGroup(group, allSelected)}
                      className="h-4 w-4 shrink-0 accent-[var(--color-brand-700)]"
                      aria-label={`Seleccionar todos los pendientes de ${group.signer.full_name}`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-[var(--color-brand-700)]">{group.signer.full_name}</span>
                      <span className="block text-[11px] text-[var(--unilabor-neutral)]">
                        {group.signer.employee_code} · {group.pending.length} pendiente(s){group.signer.is_active ? '' : ' · dado de baja'}
                      </span>
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => onOpenBatch(chosen, group.signer)}
                    disabled={chosen.length === 0}
                    className={primaryButtonClass}
                    title={`Cargar el archivo de la firma de ${group.signer.full_name} y aplicarlo a los registros seleccionados`}
                  >
                    <ImageUp size={14} /> Firmar seleccionados ({chosen.length})
                  </button>
                </div>
                <ul className="divide-y divide-[rgba(0,65,106,0.06)]">
                  {group.pending.map((entry) => {
                    const key = keyOf(signerId, entry);
                    return (
                      <li key={key} className={`flex items-center gap-3 px-4 py-2.5 ${selected.has(key) ? 'bg-[rgba(191,212,230,0.18)]' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          onChange={() => toggle(signerId, entry, chosen.length)}
                          className="h-4 w-4 shrink-0 accent-[var(--color-brand-700)]"
                          aria-label={`Seleccionar ${entry.folio}`}
                        />
                        <button type="button" onClick={() => onOpenOne(entry, group.signer)} className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 text-left">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--unilabor-ink)]">
                              {entry.employee_name} · <span className="text-[var(--color-brand-700)]">{entry.position_code}</span> {entry.position_name}
                            </p>
                            <p className="text-[11px] leading-5 text-[var(--unilabor-neutral)]">
                              <span className="font-semibold text-[var(--color-brand-700)]">{entry.form_code}</span> {entry.title} · {entry.folio}
                              {entry.detail ? ` · ${entry.detail}` : ''}
                            </p>
                            <p className="text-[11px] leading-5 text-[var(--unilabor-neutral)]">
                              Firma como <span className="font-semibold text-[var(--unilabor-ink)]">{entry.pending_roles_label}</span> · enviado
                              {entry.requested_by_name ? ` por ${entry.requested_by_name}` : ''} el {formatDateTime(entry.requested_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                              {entry.signatures_done} de {entry.signatures_total} firmas
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-500)]">
                              <ImageUp size={13} /> Firmar
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
