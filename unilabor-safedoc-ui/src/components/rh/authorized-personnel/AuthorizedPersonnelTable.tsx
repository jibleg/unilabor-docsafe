import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { setEvaluationAuthorizationLevel } from '../../../api/service.api-rh-authorized-personnel';
import { getApiErrorMessage } from '../../../api/service.parsers';
import type { AuthorizedPersonnelRow, RhAuthorizationLevel } from '../../../types/models';
import { ALERT_TONE_CLASS } from '../../../utils/authorizedPersonnel';
import { formatDateOnly } from '../../../utils/competency';
import { notifyError, notifySuccess } from '../../../utils/notify';

interface AuthorizedPersonnelTableProps {
  rows: AuthorizedPersonnelRow[];
  levels: RhAuthorizationLevel[];
  /** RH / Dirección General: pueden fijar o corregir el nivel de una fila autorizada. */
  canEditLevel: boolean;
  onChanged: () => void;
}

const yesNo = (value: boolean | null) =>
  value === null ? (
    <span className="text-slate-300">—</span>
  ) : (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${value ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{value ? 'Sí' : 'No'}</span>
  );

const HEADERS = ['No.', 'Sede', 'Nombre', 'Puesto', 'Área', 'Nivel org.', 'Estatus', 'Competente', 'Última evaluación', 'Vigencia hasta', 'Días', 'Autorizado', 'Nivel aut.', 'Alerta'];

/** Tabla del REH-REG-026 con las 14 columnas del formato; una fila por colaborador y puesto. */
export const AuthorizedPersonnelTable = ({ rows, levels, canEditLevel, onChanged }: AuthorizedPersonnelTableProps) => {
  const [savingId, setSavingId] = useState<number | null>(null);

  const changeLevel = async (row: AuthorizedPersonnelRow, value: string) => {
    if (!row.evaluation_id || !value) return;
    setSavingId(row.evaluation_id);
    try {
      notifySuccess(await setEvaluationAuthorizationLevel(row.evaluation_id, Number(value)));
      onChanged();
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo guardar el nivel de autorización.'));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white shadow-xl">
      <table className="w-full min-w-[1180px] border-collapse text-xs">
        <thead className="bg-[var(--color-brand-700)] text-white">
          <tr>
            {HEADERS.map((header) => (
              <th key={header} className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={HEADERS.length} className="px-4 py-10 text-center text-sm text-[var(--unilabor-neutral)]">
                Ninguna fila coincide con los filtros.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.employee_id}-${row.position_id ?? 0}`} className="border-t border-[rgba(0,65,106,0.08)] hover:bg-[rgba(191,212,230,0.16)]">
                <td className="px-2 py-1.5 text-center text-[var(--unilabor-neutral)]">{row.row_no}</td>
                <td className="px-2 py-1.5 text-center">{row.branch_name ?? '—'}</td>
                <td className="px-2 py-1.5 font-bold text-[var(--color-brand-700)]">{row.full_name}</td>
                <td className="px-2 py-1.5 text-center">{row.position_name ?? '—'}</td>
                <td className="px-2 py-1.5 text-center capitalize">{row.area_name?.toLowerCase() ?? '—'}</td>
                <td className="px-2 py-1.5 text-center" title={row.organizational_level_name ?? undefined}>
                  {row.organizational_level_code ?? '—'}
                </td>
                <td className="px-2 py-1.5 text-center">{row.status_label}</td>
                <td className="px-2 py-1.5 text-center">{yesNo(row.competent)}</td>
                <td className={`px-2 py-1.5 text-center ${row.last_evaluation_date ? '' : 'bg-amber-50'}`}>
                  {row.last_evaluation_date ? formatDateOnly(row.last_evaluation_date) : ''}
                </td>
                <td className="px-2 py-1.5 text-center">{row.valid_until ? formatDateOnly(row.valid_until) : ''}</td>
                <td className={`px-2 py-1.5 text-center font-bold ${row.days_remaining !== null && row.days_remaining < 0 ? 'text-rose-700' : ''}`}>
                  {row.days_remaining ?? ''}
                </td>
                <td className="px-2 py-1.5 text-center">{yesNo(row.authorized)}</td>
                <td className="px-2 py-1.5 text-center font-bold">
                  {row.authorized && canEditLevel ? (
                    <span className="inline-flex items-center gap-1">
                      <select
                        value={row.authorization_level_id ?? ''}
                        onChange={(event) => void changeLevel(row, event.target.value)}
                        disabled={savingId === row.evaluation_id}
                        title={row.authorization_level_name ?? 'Elige el nivel de autorización'}
                        aria-label={`Nivel de autorización de ${row.full_name} en ${row.position_name ?? ''}`}
                        className={`rounded-lg border px-1.5 py-0.5 text-xs font-bold outline-none ${
                          row.authorization_level_id ? 'border-[rgba(0,65,106,0.16)] bg-white' : 'border-amber-300 bg-amber-50 text-amber-800'
                        }`}
                      >
                        {row.authorization_level_id ? null : <option value="">—</option>}
                        {levels
                          .filter((level) => level.is_active || level.id === row.authorization_level_id)
                          .map((level) => (
                            <option key={level.id} value={level.id}>
                              {level.level_no} · {level.name}
                            </option>
                          ))}
                      </select>
                      <Loader2 size={12} className={savingId === row.evaluation_id ? 'animate-spin' : 'invisible'} />
                    </span>
                  ) : (
                    <span title={row.authorization_level_name ?? undefined}>{row.authorization_level_no ?? ''}</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {row.alert_text ? (
                    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${ALERT_TONE_CLASS[row.alert_tone]}`}>{row.alert_text}</span>
                  ) : (
                    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${ALERT_TONE_CLASS.none}`}>Vigente</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
