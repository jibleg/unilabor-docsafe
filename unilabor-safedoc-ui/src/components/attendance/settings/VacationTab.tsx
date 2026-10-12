import { useCallback, useEffect, useState } from 'react';
import { Info, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { getApiErrorMessage } from '../../../api/service';
import {
  deleteVacationPolicyRow,
  getVacationPolicy,
  resetVacationPolicy,
  type VacationPolicyRow,
} from '../../../api/service.api-attendance-settings';
import { confirmAction } from '../../../utils/confirm';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { primaryButtonClass, secondaryButtonClass } from '../devices/ModalShell';
import { isPolicyEqualToLaw, vacationRowLabel } from './settingsHelpers';
import { TabStatus } from './TabStatus';
import { VacationRowModal } from './VacationRowModal';

export const VacationTab = () => {
  const [rows, setRows] = useState<VacationPolicyRow[] | null>(null);
  const [error, setError] = useState(false);
  const [modal, setModal] = useState<{ row: VacationPolicyRow | null } | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await getVacationPolicy());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getVacationPolicy()
      .then((data) => { if (active) { setRows(data); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);

  const remove = async (row: VacationPolicyRow) => {
    const ok = await confirmAction(
      'Eliminar fila',
      `Se quitará la fila desde el año ${row.from_seniority_year}; ese tramo tomará los días de la fila anterior y se actualizarán los periodos vigentes.`,
      'Eliminar',
      'danger',
    );
    if (!ok) return;
    try {
      setRows(await deleteVacationPolicyRow(row.from_seniority_year));
      notifySuccess('Fila eliminada.');
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo eliminar la fila.'));
    }
  };

  const reset = async () => {
    const ok = await confirmAction(
      'Restablecer a la Ley',
      'La tabla volverá a los días de la Ley Federal del Trabajo (reforma 2023) y se actualizarán los periodos vigentes.',
      'Restablecer',
      'danger',
    );
    if (!ok) return;
    try {
      setRows(await resetVacationPolicy());
      notifySuccess('Tabla restablecida a la Ley.');
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo restablecer la tabla.'));
    }
  };

  const equalToLaw = rows ? isPolicyEqualToLaw(rows) : false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {rows ? (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${equalToLaw ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {equalToLaw ? 'Igual a la Ley (LFT 2023)' : 'Personalizada'}
          </span>
        ) : <span />}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButtonClass} onClick={() => void reset()} disabled={!rows}>
            <RotateCcw size={16} /> Restablecer a la Ley
          </button>
          <button type="button" className={primaryButtonClass} onClick={() => setModal({ row: null })}>
            <Plus size={16} /> Nueva fila
          </button>
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-2xl bg-sky-50 p-3 text-sm text-sky-900">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        Días de vacaciones por año de antigüedad. Al cambiar la tabla se actualizan los periodos de vacaciones vigentes.
      </p>

      <TabStatus loading={!rows && !error} error={error && !rows} onRetry={() => void load()} label="Cargando tabla…" />
      {rows ? (
        <ul className="divide-y divide-[rgba(0,65,106,0.08)] rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white/90">
          {rows.map((row, index) => (
            <li key={row.from_seniority_year} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <p className="min-w-0 flex-1 basis-40 text-sm font-semibold text-[var(--unilabor-ink)]">{vacationRowLabel(rows, index)}</p>
              <p className="text-sm text-[var(--color-brand-700)]">
                <strong>{row.vacation_days} días</strong>
                {row.differs_from_law && row.law_days !== null ? (
                  <span className="text-xs text-amber-700"> · la Ley marca {row.law_days}</span>
                ) : null}
              </p>
              <div className="flex gap-1.5">
                <button type="button" aria-label={`Editar ${vacationRowLabel(rows, index)}`} onClick={() => setModal({ row })}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.14)] text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.28)]">
                  <Pencil size={14} />
                </button>
                {row.from_seniority_year !== 1 ? (
                  <button type="button" aria-label={`Eliminar ${vacationRowLabel(rows, index)}`} onClick={() => void remove(row)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50">
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {modal ? (
        <VacationRowModal
          row={modal.row}
          onClose={() => setModal(null)}
          onSaved={(next) => {
            setRows(next);
            setModal(null);
          }}
        />
      ) : null}
    </div>
  );
};
