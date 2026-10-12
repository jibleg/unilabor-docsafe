import { useState } from 'react';
import { Loader2, Paperclip, ShieldCheck } from 'lucide-react';
import { justifyAttendanceDay, type AttendanceDay } from '../../../api/service.api-attendance-days';
import { getApiErrorMessage } from '../../../api/service';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { DAY_RESULT_LABEL } from '../shared/dayResult';
import { formatDateShort } from '../shared/format';
import { ModalShell } from '../punches/ModalShell';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../punches/formStyles';
import { isReasonValid } from '../punches/punchHelpers';

const MAX_FILE_MB = 10;

export const JustifyModal = ({ day, onClose, onDone }: { day: AttendanceDay; onClose: () => void; onDone: () => void }) => {
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  // Con la configuracion actual el tipo "Falta justificada" exige comprobante (incidents-vacations.md).
  const error = !isReasonValid(reason)
    ? 'El motivo debe tener al menos 5 caracteres.'
    : !file
      ? 'Adjunta el comprobante (obligatorio).'
      : file.size > MAX_FILE_MB * 1024 * 1024
        ? `El archivo excede ${MAX_FILE_MB} MB.`
        : null;

  const submit = async () => {
    setTouched(true);
    if (error) return;
    setSaving(true);
    try {
      await justifyAttendanceDay(day.employee.id, day.work_date, reason.trim(), file);
      notifySuccess('Día justificado y recalculado.');
      onDone();
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo justificar el día.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Justificar día"
      subtitle={`${day.employee.full_name} · ${formatDateShort(day.work_date)} · ${DAY_RESULT_LABEL[day.day_result]}`}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button type="button" className={secondaryButtonClass} disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="button" className={primaryButtonClass} disabled={saving} onClick={() => void submit()}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            Justificar
          </button>
        </>
      }
    >
      <p className="text-xs text-[var(--unilabor-neutral)]">
        Crea y autoriza una incidencia «Falta justificada» de un día y recalcula el resultado.
      </p>
      <label className="block">
        <span className={labelClass}>Motivo (mín. 5 caracteres)</span>
        <textarea className={inputClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label className="block">
        <span className={labelClass}>Comprobante (obligatorio)</span>
        <div className="flex items-center gap-2">
          <Paperclip size={16} className="shrink-0 text-[var(--unilabor-neutral)]" />
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="w-full text-sm text-[var(--unilabor-ink)] file:mr-3 file:rounded-lg file:border-0 file:bg-[rgba(191,212,230,0.4)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--color-brand-700)]"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </label>
      {touched && error ? <p role="alert" className="text-xs font-semibold text-[#d03b3b]">{error}</p> : null}
    </ModalShell>
  );
};
