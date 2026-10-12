import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarCheck, Loader2 } from 'lucide-react';
import { previewVacation, type VacationPreview } from '../../../api/service.api-attendance-incidents';
import { getApiErrorMessage } from '../../../api/service.parsers';

interface Props {
  employeeId: number;
  typeId: number;
  startDate: string;
  endDate: string;
  onPreview?: (preview: VacationPreview | null) => void;
}

/** Vista previa de dias laborables y saldo cuando el tipo descuenta vacaciones. */
export const VacationPreviewBox = ({ employeeId, typeId, startDate, endDate, onPreview }: Props) => {
  const [preview, setPreview] = useState<VacationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!startDate || (endDate && endDate < startDate)) {
      setPreview(null);
      onPreview?.(null);
      return;
    }
    let active = true;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const result = await previewVacation({
          employee_id: employeeId,
          incident_type_id: typeId,
          start_date: startDate,
          end_date: endDate || startDate,
        });
        if (active) {
          setPreview(result);
          onPreview?.(result);
        }
      } catch (err) {
        if (active) {
          setPreview(null);
          onPreview?.(null);
          setError(getApiErrorMessage(err, 'No se pudo calcular la vista previa.'));
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
    // onPreview es estable en el uso; no se incluye para no reiniciar la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, typeId, startDate, endDate]);

  if (loading && !preview) {
    return (
      <p className="flex items-center gap-2 text-xs text-[var(--unilabor-neutral)]">
        <Loader2 size={14} className="animate-spin" /> Calculando días laborables…
      </p>
    );
  }
  if (error) return <p className="text-xs text-[var(--unilabor-neutral)]">{error}</p>;
  if (!preview) return null;

  const warning = preview.blocked || preview.exceeds > 0 || preview.no_hire_date;
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-xs ${
        warning ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-[rgba(0,65,106,0.12)] bg-[rgba(239,245,250,0.7)] text-[var(--unilabor-ink)]'
      }`}
      role="status"
    >
      <p className="flex items-center gap-2 font-semibold">
        {warning ? <AlertTriangle size={14} aria-hidden="true" /> : <CalendarCheck size={14} aria-hidden="true" />}
        {preview.working_days} {preview.working_days === 1 ? 'día laborable' : 'días laborables'} en el periodo
      </p>
      {preview.applies ? (
        <p className="mt-1">
          Saldo {preview.balance} · pendientes de autorizar {preview.pending} · disponible {preview.available}
          {preview.exceeds > 0 ? ` · excede por ${preview.exceeds}` : ''}
        </p>
      ) : (
        <p className="mt-1">Este tipo no descuenta vacaciones.</p>
      )}
      {preview.no_hire_date ? <p className="mt-1">El colaborador no tiene fecha de ingreso; no se calcula el saldo.</p> : null}
      {preview.blocked ? <p className="mt-1 font-semibold">La política actual no permite registrar sin saldo suficiente.</p> : null}
      {preview.message ? <p className="mt-1">{preview.message}</p> : null}
    </div>
  );
};
