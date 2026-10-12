import { useState } from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { adjustVacationPeriod, type VacationPeriod, type VacationSummary } from '../../../api/service.api-attendance-employees';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { notifySuccess } from '../../../utils/notify';
import { validateVacationAdjustment } from './readiness';
import { inputClass, labelClass, modalBackdropClass, modalPanelClass, primaryButtonClass, secondaryButtonClass } from './ui';

interface Props {
  periods: VacationPeriod[];
  initialPeriodId?: number;
  onClose: () => void;
  onSaved: (summary: VacationSummary) => void;
}

export const VacationAdjustModal = ({ periods, initialPeriodId, onClose, onSaved }: Props) => {
  const current = periods.filter((period) => !period.expired);
  const [periodId, setPeriodId] = useState(String(initialPeriodId ?? current[0]?.id ?? periods[0]?.id ?? ''));
  const selected = periods.find((period) => String(period.id) === periodId);
  const [adjustment, setAdjustment] = useState(selected ? String(selected.days_adjustment) : '0');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const validation = validateVacationAdjustment(adjustment, reason);
    if (validation || !periodId) return setError(validation ?? 'Elige un periodo.');
    setSaving(true);
    setError('');
    try {
      const summary = await adjustVacationPeriod(Number(periodId), Number(adjustment), reason.trim());
      notifySuccess('Ajuste guardado.');
      onSaved(summary);
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo guardar el ajuste.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalBackdropClass} role="dialog" aria-modal="true" aria-label="Ajuste de vacaciones">
      <div className={`${modalPanelClass} max-w-md`}>
        <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <h2 className="text-base font-bold text-[var(--color-brand-700)]">Ajuste manual de vacaciones</h2>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-5">
          <div>
            <label className={labelClass} htmlFor="adj-period">Periodo</label>
            <select
              id="adj-period"
              className={inputClass}
              value={periodId}
              onChange={(event) => {
                setPeriodId(event.target.value);
                const next = periods.find((period) => String(period.id) === event.target.value);
                if (next) setAdjustment(String(next.days_adjustment));
              }}
            >
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  Año {period.seniority_year} · vence {period.period_due_date}{period.expired ? ' (vencido)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="adj-days">Ajuste (días, -60 a 60)</label>
            <input id="adj-days" type="number" min={-60} max={60} step={0.5} className={inputClass} value={adjustment} onChange={(event) => setAdjustment(event.target.value)} />
            <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">El ajuste reemplaza al anterior del mismo periodo.</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="adj-reason">Motivo</label>
            <textarea id="adj-reason" rows={2} className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button type="button" className={secondaryButtonClass} onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className={primaryButtonClass} onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} aria-hidden="true" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
};
