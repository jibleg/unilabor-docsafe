import { useCallback, useEffect, useState } from 'react';
import { Edit3, Moon, Plus, RefreshCw, Timer } from 'lucide-react';
import { getApiErrorMessage } from '../../api/service';
import { listShifts, type AttendanceShift } from '../../api/service.api-attendance-schedule';
import { ModalShell } from '../../components/attendance/schedule/ModalShell';
import { ShiftForm } from '../../components/attendance/schedule/ShiftForm';
import { formatHoursValue, netHours } from '../../components/attendance/schedule/scheduleHelpers';
import { cardClass, primaryButton, secondaryButton } from '../../components/attendance/schedule/ui';

type ModalState = { shift: AttendanceShift | null } | null;

export const AttendanceShiftsPage = () => {
  const [shifts, setShifts] = useState<AttendanceShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setShifts(await listShifts(true));
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudieron cargar los turnos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-brand-700)]">Turnos</h1>
          <p className="text-sm text-[var(--unilabor-neutral)]">Catálogo de turnos que se programan en el calendario de horarios.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={secondaryButton} onClick={() => void load()} disabled={loading} aria-label="Actualizar">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button type="button" className={primaryButton} onClick={() => setModal({ shift: null })}>
            <Plus size={16} /> Nuevo turno
          </button>
        </div>
      </div>

      {error ? (
        <div className={`${cardClass} flex flex-col items-center gap-3 p-8 text-center`}>
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" className={secondaryButton} onClick={() => void load()}>Reintentar</button>
        </div>
      ) : loading && shifts.length === 0 ? (
        <div className={`${cardClass} p-8 text-center text-sm text-[var(--unilabor-neutral)]`}>Cargando turnos…</div>
      ) : shifts.length === 0 ? (
        <div className={`${cardClass} flex flex-col items-center gap-3 p-10 text-center`}>
          <Timer size={32} className="text-[var(--color-brand-300)]" />
          <p className="text-sm text-[var(--unilabor-neutral)]">Aún no hay turnos. Crea el primero para empezar a programar horarios.</p>
          <button type="button" className={primaryButton} onClick={() => setModal({ shift: null })}><Plus size={16} /> Nuevo turno</button>
        </div>
      ) : (
        <div className={`${cardClass} overflow-x-auto`}>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[rgba(0,65,106,0.08)] text-left text-xs uppercase tracking-wide text-[var(--unilabor-neutral)]">
                <th className="px-4 py-2.5">Turno</th>
                <th className="px-3 py-2.5">Horario</th>
                <th className="px-3 py-2.5">Horas netas</th>
                <th className="px-3 py-2.5">Descanso</th>
                <th className="px-3 py-2.5">Vigentes</th>
                <th className="px-3 py-2.5"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => (
                <tr key={shift.id} className={`border-b border-[rgba(0,65,106,0.06)] last:border-0 ${shift.is_active ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: shift.color_hex }} aria-hidden />
                      <span className="font-semibold text-[var(--unilabor-ink)]">{shift.name}</span>
                      {shift.shift_type === 'flexible' && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">flexible</span>}
                      {shift.crosses_midnight && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700"><Moon size={11} />nocturno</span>}
                      {!shift.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">inactivo</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatHoursValue(netHours(shift.start_time, shift.end_time, shift.break_minutes))}</td>
                  <td className="px-3 py-2.5 tabular-nums">{shift.break_minutes} min</td>
                  <td className="px-3 py-2.5 tabular-nums">{shift.assignments_count ?? 0}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button type="button" className="rounded-lg p-1.5 text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]" aria-label={`Editar ${shift.name}`} onClick={() => setModal({ shift })}>
                      <Edit3 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ModalShell title={modal.shift ? 'Editar turno' : 'Nuevo turno'} onClose={() => setModal(null)} widthClass="max-w-xl">
          <ShiftForm
            shift={modal.shift}
            onCancel={() => setModal(null)}
            onSaved={() => {
              setModal(null);
              void load();
            }}
          />
        </ModalShell>
      )}
    </div>
  );
};
