import { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle2, Info, Pencil, Plus, Trash2 } from 'lucide-react';
import { getApiErrorMessage } from '../../../api/service';
import {
  deleteAttendanceHoliday,
  listAttendanceHolidays,
  updateAttendanceHoliday,
  type AttendanceHoliday,
} from '../../../api/service.api-attendance-settings';
import { confirmAction } from '../../../utils/confirm';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { inputClass, primaryButtonClass } from '../devices/ModalShell';
import { formatDateShort } from '../shared/format';
import { HolidayModal } from './HolidayModal';
import { holidayYears } from './settingsHelpers';
import { TabStatus } from './TabStatus';

const iconButton =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.14)] text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.28)]';

export const HolidaysTab = () => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [holidays, setHolidays] = useState<AttendanceHoliday[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [modal, setModal] = useState<{ holiday: AttendanceHoliday | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setHolidays(await listAttendanceHolidays(year));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (holiday: AttendanceHoliday) => {
    if (holiday.is_active) {
      const ok = await confirmAction('Desactivar festivo', `"${holiday.name}" dejará de contar como festivo y se recalcularán los días afectados.`, 'Desactivar', 'danger');
      if (!ok) return;
    }
    try {
      await updateAttendanceHoliday(holiday.id, { is_active: !holiday.is_active });
      notifySuccess(holiday.is_active ? 'Festivo desactivado.' : 'Festivo reactivado.');
      void load();
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo cambiar el festivo.'));
    }
  };

  const remove = async (holiday: AttendanceHoliday) => {
    const ok = await confirmAction('Eliminar festivo', `Se eliminará "${holiday.name}" y se recalculará el día afectado.`, 'Eliminar', 'danger');
    if (!ok) return;
    try {
      await deleteAttendanceHoliday(holiday.id);
      notifySuccess('Festivo eliminado.');
      void load();
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudo eliminar el festivo.'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="holiday-year" className="text-sm font-semibold text-[var(--color-brand-700)]">Año</label>
          <select id="holiday-year" className={`${inputClass} !w-auto`} value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {holidayYears(currentYear).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <button type="button" className={primaryButtonClass} onClick={() => setModal({ holiday: null })}>
          <Plus size={16} /> Nuevo festivo
        </button>
      </div>

      <p className="flex items-start gap-2 rounded-2xl bg-sky-50 p-3 text-sm text-sky-900">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        Los festivos aplican a todas las sucursales. Al crear, cambiar o quitar uno se recalculan los días ya pasados.
      </p>

      <TabStatus loading={loading && !holidays} error={error} onRetry={() => void load()} label="Cargando festivos…" />
      {holidays && holidays.length === 0 && !loading ? (
        <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">No hay festivos en {year}.</p>
      ) : null}
      {holidays && holidays.length > 0 ? (
        <ul className={`divide-y divide-[rgba(0,65,106,0.08)] rounded-3xl border border-[rgba(0,65,106,0.1)] bg-white/90 ${loading ? 'opacity-60' : ''}`}>
          {holidays.map((holiday) => (
            <li key={holiday.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 basis-48">
                <p className={`text-sm font-semibold ${holiday.is_active ? 'text-[var(--unilabor-ink)]' : 'text-slate-400 line-through'}`}>{holiday.name}</p>
                <p className="text-xs text-slate-500">{formatDateShort(holiday.holiday_date)}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${holiday.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                {holiday.is_active ? 'Activo' : 'Inactivo'}
              </span>
              <div className="flex gap-1.5">
                <button type="button" className={iconButton} aria-label={`Editar ${holiday.name}`} onClick={() => setModal({ holiday })}><Pencil size={14} /></button>
                <button type="button" className={iconButton} aria-label={`${holiday.is_active ? 'Desactivar' : 'Reactivar'} ${holiday.name}`} onClick={() => void toggleActive(holiday)}>
                  {holiday.is_active ? <Ban size={14} /> : <CheckCircle2 size={14} />}
                </button>
                <button type="button" className={`${iconButton} !border-red-200 !text-red-700 hover:!bg-red-50`} aria-label={`Eliminar ${holiday.name}`} onClick={() => void remove(holiday)}><Trash2 size={14} /></button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {modal ? (
        <HolidayModal
          holiday={modal.holiday}
          defaultYear={year}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
};
