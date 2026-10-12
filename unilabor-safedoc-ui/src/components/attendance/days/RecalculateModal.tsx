import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { recalculateAttendanceDays } from '../../../api/service.api-attendance-days';
import { getApiErrorMessage } from '../../../api/service';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { confirmAction } from '../../../utils/confirm';
import { formatDate } from '../shared/format';
import { ModalShell } from '../punches/ModalShell';
import { primaryButtonClass, secondaryButtonClass } from '../punches/formStyles';
import { rangeDays } from './dayHelpers';

const MAX_RECALC_DAYS = 92;

interface RecalculateModalProps {
  from: string;
  to: string;
  employeeId?: string;
  onClose: () => void;
  onDone: () => void;
}

export const RecalculateModal = ({ from, to, employeeId, onClose, onDone }: RecalculateModalProps) => {
  const [saving, setSaving] = useState(false);
  const total = rangeDays(from, to);
  const tooLong = total > MAX_RECALC_DAYS;

  const run = async () => {
    const ok = await confirmAction(
      'Recalcular rango',
      `Se recalcularán los días del ${formatDate(from)} al ${formatDate(to)}${employeeId ? ' del colaborador filtrado' : ' de todos los colaboradores habilitados'}. ¿Continuar?`,
      'Recalcular',
      'primary',
    );
    if (!ok) return;
    setSaving(true);
    try {
      const result = await recalculateAttendanceDays({ from, to, ...(employeeId ? { employee_ids: [Number(employeeId)] } : {}) });
      notifySuccess(`${result.days} día(s) recalculados para ${result.employees} colaborador(es).`);
      onDone();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo recalcular el rango.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Recalcular rango"
      subtitle={`${formatDate(from)} – ${formatDate(to)} (${total} días)`}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button type="button" className={secondaryButtonClass} disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="button" className={primaryButtonClass} disabled={saving || tooLong} onClick={() => void run()}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Recalcular
          </button>
        </>
      }
    >
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-[var(--unilabor-ink)]">
        <li>Vuelve a calcular el resultado de cada día con las checadas, horarios e incidencias vigentes.</li>
        <li>Solo se recalculan días cerrados: hoy y los días futuros no se recalculan (el proceso nocturno los cierra).</li>
        <li>Máximo {MAX_RECALC_DAYS} días por operación.{employeeId ? ' Se aplica solo al colaborador filtrado.' : ''}</li>
      </ul>
      {tooLong ? <p role="alert" className="text-xs font-semibold text-[#d03b3b]">El rango tiene {total} días: acótalo a {MAX_RECALC_DAYS} o menos.</p> : null}
    </ModalShell>
  );
};
