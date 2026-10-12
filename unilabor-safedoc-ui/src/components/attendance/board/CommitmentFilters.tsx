import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Loader2, RotateCcw } from 'lucide-react';
import { downloadAttendanceFile, openAttendanceFile } from '../../../api/service.api-attendance-common';
import { buildCommitmentParams, type CommitmentBoard, type CommitmentQuery } from '../../../api/service.api-attendance-boards';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { notifyError } from '../../../utils/notify';
import { SearchableSelect } from '../../SearchableSelect';
import { todayIso } from '../shared/format';
import { PERIOD_OPTIONS } from './boardHelpers';
import { cardClass, ghostButtonClass, inputClass, labelClass } from './boardStyles';

interface Props {
  query: CommitmentQuery;
  board: CommitmentBoard | null;
  onChange: (patch: Partial<CommitmentQuery>) => void;
}

export const CommitmentFilters = ({ query, board, onChange }: Props) => {
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);
  const isCustom = query.period === 'custom';

  const run = async (kind: 'pdf' | 'xlsx') => {
    setBusy(kind);
    try {
      const params = buildCommitmentParams(query);
      if (kind === 'xlsx') {
        await downloadAttendanceFile('/attendance/export/commitment.xlsx', params, 'compromiso-asistencia.xlsx');
      } else {
        const search = new URLSearchParams(params).toString();
        await openAttendanceFile(`/attendance/report/commitment.pdf?${search}`);
      }
    } catch (error) {
      notifyError(await readBlobError(error, kind === 'pdf' ? 'No se pudo generar el PDF.' : 'No se pudo generar el Excel.'));
    } finally {
      setBusy(null);
    }
  };

  const goTo = (range: { from: string; to: string } | undefined) => {
    if (!range) return;
    if (isCustom) onChange({ from: range.from, to: range.to });
    else onChange({ anchor: range.from });
  };

  const goCurrent = () => {
    if (isCustom) onChange({ from: '', to: '' });
    else onChange({ anchor: '' });
  };

  const nextBlocked = !board || board.next.from > todayIso();

  return (
    <div className={`${cardClass} space-y-4 !p-4`}>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Periodo">
        {PERIOD_OPTIONS.map((option) => {
          const active = query.period === option.value;
          return (
            <button key={option.value} type="button" role="tab" aria-selected={active}
              onClick={() => onChange({ period: option.value })}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                active
                  ? 'bg-[var(--color-brand-700)] text-white'
                  : 'border border-[rgba(0,65,106,0.12)] bg-white text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.28)]'
              }`}>
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {isCustom ? (
          <>
            <label className="block">
              <span className={labelClass}>Desde</span>
              <input type="date" value={query.from ?? board?.from ?? ''} onChange={(e) => onChange({ from: e.target.value })} className={`${inputClass} mt-1 !w-auto`} />
            </label>
            <label className="block">
              <span className={labelClass}>Hasta</span>
              <input type="date" value={query.to ?? board?.to ?? ''} onChange={(e) => onChange({ to: e.target.value })} className={`${inputClass} mt-1 !w-auto`} />
            </label>
          </>
        ) : null}
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Periodo anterior" className={`${ghostButtonClass} !px-2`} disabled={!board} onClick={() => goTo(board?.previous)}>
            <ChevronLeft size={16} />
          </button>
          <span className="inline-flex min-w-[10rem] items-center justify-center gap-2 px-2 text-sm font-bold capitalize text-[var(--color-brand-700)]">
            <CalendarDays size={16} aria-hidden="true" />
            {board?.label ?? '…'}
          </span>
          <button type="button" aria-label="Periodo siguiente" className={`${ghostButtonClass} !px-2`} disabled={nextBlocked} onClick={() => goTo(board?.next)}>
            <ChevronRight size={16} />
          </button>
          <button type="button" aria-label="Periodo actual" title="Periodo actual" className={`${ghostButtonClass} !px-2`} onClick={goCurrent}>
            <RotateCcw size={16} />
          </button>
        </div>

        <label className="block">
          <span className={labelClass}>Sucursal</span>
          <select value={query.branch_id ?? ''} onChange={(e) => onChange({ branch_id: e.target.value, employee_id: '' })} className={`${inputClass} mt-1 !w-auto min-w-[10rem]`}>
            <option value="">Todas</option>
            {(board?.branches ?? []).map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
          </select>
        </label>
        <div className="block min-w-[14rem]">
          <span className={labelClass}>Colaborador</span>
          <div className="mt-1">
            <SearchableSelect value={query.employee_id ?? ''} emptyLabel="Todo el equipo" placeholder="Todo el equipo"
              searchPlaceholder="Buscar colaborador…"
              options={(board?.employees ?? []).map((e) => ({ value: String(e.id), label: e.full_name, hint: e.code }))}
              onChange={(value) => onChange({ employee_id: value })} />
          </div>
        </div>

        <div className="ml-auto flex gap-2">
          <button type="button" className={ghostButtonClass} onClick={() => void run('pdf')} disabled={busy !== null || !board} aria-label="Abrir PDF">
            {busy === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} PDF
          </button>
          <button type="button" className={ghostButtonClass} onClick={() => void run('xlsx')} disabled={busy !== null || !board} aria-label="Descargar Excel">
            {busy === 'xlsx' ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />} Excel
          </button>
        </div>
      </div>
    </div>
  );
};

/** Los errores de descargas llegan como Blob: se lee el JSON para mostrar el mensaje del servidor. */
const readBlobError = async (error: unknown, fallback: string): Promise<string> => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string };
      if (parsed.message) return parsed.message;
    } catch {
      /* se usa el mensaje generico */
    }
  }
  return getApiErrorMessage(error, fallback);
};
