import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Send } from 'lucide-react';
import {
  createIncident,
  type IncidentType,
  type VacationPreview,
} from '../../../api/service.api-attendance-incidents';
import type { AttendanceEmployee } from '../../../api/service.api-attendance-employees';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { notifySuccess, notifyWarning } from '../../../utils/notify';
import { ATTENDANCE_MIN_DATE, todayIso } from '../shared/format';
import { EmployeePicker } from '../employees/EmployeePicker';
import { inputClass, labelClass, modalBackdropClass, modalPanelClass, primaryButtonClass, secondaryButtonClass } from '../employees/ui';
import { AttachmentPicker } from './AttachmentPicker';
import { validateIncidentForm } from './incidentFormat';
import { VacationPreviewBox } from './VacationPreviewBox';

interface Props {
  types: IncidentType[];
  onClose: () => void;
  onCreated: () => void;
}

export const IncidentFormModal = ({ types, onClose, onCreated }: Props) => {
  const activeTypes = useMemo(() => types.filter((type) => type.is_active), [types]);
  const [employee, setEmployee] = useState<AttendanceEmployee | null>(null);
  const [typeId, setTypeId] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('');
  const [imssFolio, setImssFolio] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [authorize, setAuthorize] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<VacationPreview | null>(null);

  const type = activeTypes.find((item) => String(item.id) === typeId) ?? null;
  const isHourly = type?.is_hourly ?? false;
  const isIncapacity = type?.code === 'medical_leave' || type?.code === 'incapacity' || /incapacidad/i.test(type?.name ?? '');

  const handleSubmit = async () => {
    const validation = validateIncidentForm(
      { employeeId: employee ? String(employee.id) : '', typeId, startDate, endDate, hours, reason, imssFolio },
      { isHourly, requiresAttachment: !!type?.requires_attachment && authorize, fileCount: files.length },
    );
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await createIncident({
        employee_id: employee!.id,
        incident_type_id: Number(typeId),
        start_date: startDate,
        end_date: isHourly ? undefined : endDate || undefined,
        hours: isHourly ? Number(hours) : undefined,
        reason: reason.trim() || undefined,
        imss_folio: isIncapacity ? imssFolio.trim() || undefined : undefined,
        authorize,
        authorization_notes: authorize ? notes.trim() || undefined : undefined,
        files,
      });
      notifySuccess(authorize ? 'Incidencia registrada y autorizada.' : 'Incidencia registrada, por autorizar.');
      result.warnings.forEach((warning) => notifyWarning(warning));
      onCreated();
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo registrar la incidencia.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalBackdropClass} role="dialog" aria-modal="true" aria-label="Nueva incidencia">
      <div className={`${modalPanelClass} max-w-2xl`}>
        <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <h2 className="text-base font-bold text-[var(--color-brand-700)]">Nueva incidencia</h2>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-5">
          <div>
            <label className={labelClass}>Colaborador</label>
            <EmployeePicker value={employee} onChange={setEmployee} />
          </div>
          <div>
            <label className={labelClass} htmlFor="inc-type">Tipo</label>
            <select id="inc-type" className={inputClass} value={typeId} onChange={(event) => setTypeId(event.target.value)}>
              <option value="">Elige un tipo…</option>
              {activeTypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.requires_attachment ? ' (exige comprobante)' : ''}{item.is_hourly ? ' (por horas)' : ''}
                </option>
              ))}
            </select>
            {type?.requires_attachment ? (
              <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                Exige comprobante para autorizarse. Puedes capturarla y agregarlo después.
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="inc-start">{isHourly ? 'Fecha' : 'Desde'}</label>
              <input id="inc-start" type="date" min={ATTENDANCE_MIN_DATE} className={inputClass} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            {isHourly ? (
              <div>
                <label className={labelClass} htmlFor="inc-hours">Horas</label>
                <input id="inc-hours" type="number" min={0.5} max={24} step={0.5} className={inputClass} value={hours} onChange={(event) => setHours(event.target.value)} />
              </div>
            ) : (
              <div>
                <label className={labelClass} htmlFor="inc-end">Hasta</label>
                <input id="inc-end" type="date" min={startDate || ATTENDANCE_MIN_DATE} className={inputClass} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
            )}
          </div>
          {employee && type?.deducts_vacation && !isHourly ? (
            <VacationPreviewBox employeeId={employee.id} typeId={type.id} startDate={startDate} endDate={endDate} onPreview={setPreview} />
          ) : null}
          {isIncapacity ? (
            <div>
              <label className={labelClass} htmlFor="inc-folio">Folio IMSS</label>
              <input id="inc-folio" className={inputClass} maxLength={40} value={imssFolio} onChange={(event) => setImssFolio(event.target.value)} />
            </div>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="inc-reason">Motivo</label>
            <textarea id="inc-reason" rows={2} className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Comprobantes</label>
            <AttachmentPicker files={files} onChange={setFiles} />
          </div>
          <div className="space-y-2 rounded-xl border border-[rgba(0,65,106,0.1)] p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-[var(--unilabor-ink)]">
              <input type="checkbox" className="checkbox checkbox-sm" checked={authorize} onChange={(event) => setAuthorize(event.target.checked)} />
              Autorizar ahora
            </label>
            {authorize ? (
              <textarea aria-label="Notas de autorización" placeholder="Notas (opcional)" rows={2} className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
            ) : null}
            {authorize && type?.requires_attachment && files.length === 0 ? (
              <p className="flex items-center gap-2 text-xs text-amber-800">
                <AlertTriangle size={14} aria-hidden="true" /> Para autorizar este tipo necesitas adjuntar comprobante.
              </p>
            ) : null}
            {authorize && preview?.blocked ? (
              <p className="text-xs text-amber-800">La política de vacaciones bloqueará el registro si no hay saldo.</p>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[rgba(0,65,106,0.08)] px-5 py-4">
          <button type="button" className={secondaryButtonClass} onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className={primaryButtonClass} onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} aria-hidden="true" />}
            Registrar
          </button>
        </div>
      </div>
    </div>
  );
};
