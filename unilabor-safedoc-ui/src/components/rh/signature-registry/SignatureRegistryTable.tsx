import { Pencil } from 'lucide-react';
import type { SignatureRegistryRow } from '../../../types/models';
import { formatDateOnly } from '../../../utils/competency';
import { STATUS_TONE_CLASS } from '../../../utils/signatureRegistry';
import { SpecimenThumb } from './SpecimenThumb';

interface SignatureRegistryTableProps {
  rows: SignatureRegistryRow[];
  onEdit: (row: SignatureRegistryRow) => void;
}

const HEADERS = ['No.', 'Nombre', 'Puesto', 'Sucursal', 'Disciplina', 'Resp.', 'Autorizada a firmar', 'Firma', 'Rúbrica', 'Alta', 'Última evaluación', 'Baja / cambio', 'Estado', ''];

const yesNo = (value: boolean | null) =>
  value === null ? (
    <span className="text-slate-300">—</span>
  ) : (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${value ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{value ? 'Sí' : 'No'}</span>
  );

/** Tabla del REH-REG-027 con las 13 columnas del formato; una fila por colaborador y puesto autorizado. */
export const SignatureRegistryTable = ({ rows, onEdit }: SignatureRegistryTableProps) => (
  <div className="overflow-x-auto rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white shadow-xl">
    <table className="w-full min-w-[1240px] border-collapse text-xs">
      <thead className="bg-[var(--color-brand-700)] text-white">
        <tr>
          {HEADERS.map((header, index) => (
            <th key={`${header}-${index}`} className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide">
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
            <tr
              key={`${row.employee_id}-${row.position_id}`}
              onClick={() => onEdit(row)}
              className={`cursor-pointer border-t border-[rgba(0,65,106,0.08)] hover:bg-[rgba(191,212,230,0.16)] ${row.retired ? 'bg-slate-50 text-slate-500' : ''}`}
            >
              <td className="px-2 py-1.5 text-center text-[var(--unilabor-neutral)]">{row.row_no}</td>
              <td className={`px-2 py-1.5 font-bold ${row.retired ? '' : 'text-[var(--color-brand-700)]'}`}>{row.full_name}</td>
              <td className="px-2 py-1.5 text-center">{row.position_name}</td>
              <td className="px-2 py-1.5 text-center">{row.branch_name ?? '—'}</td>
              <td className="px-2 py-1.5 text-center">{row.discipline_name ?? <span className="text-slate-300">—</span>}</td>
              <td className="px-2 py-1.5 text-center">{yesNo(row.discipline_id ? row.is_discipline_responsible : null)}</td>
              <td className="max-w-[260px] px-2 py-1.5" title={row.signing_scope_text ?? undefined}>
                {row.signing_scope_text ? <span className="line-clamp-2 text-[11px] leading-4">{row.signing_scope_text}</span> : <span className="text-slate-300">—</span>}
              </td>
              <td className="px-2 py-1 text-center">{row.signature_specimen ? <SpecimenThumb specimen={row.signature_specimen} height={32} /> : <span className="text-slate-300">—</span>}</td>
              <td className="px-2 py-1 text-center">{row.initials_specimen ? <SpecimenThumb specimen={row.initials_specimen} height={32} /> : <span className="text-slate-300">—</span>}</td>
              <td className={`px-2 py-1.5 text-center ${row.start_date || row.retired ? '' : 'bg-amber-50'}`} title={row.letter_folio ?? undefined}>
                {row.start_date ? formatDateOnly(row.start_date) : ''}
              </td>
              <td className={`px-2 py-1.5 text-center ${row.last_evaluation_date || row.retired ? '' : 'bg-amber-50'}`}>{row.last_evaluation_date ? formatDateOnly(row.last_evaluation_date) : ''}</td>
              <td className="px-2 py-1.5 text-center" title={row.end_or_change_kind === 'CAMBIO_ALCANCE' ? 'Cambio de alcance (carta sustituida)' : row.end_or_change_kind === 'BAJA' ? 'Baja' : undefined}>
                {row.end_or_change_date ? formatDateOnly(row.end_or_change_date) : ''}
              </td>
              <td className="px-2 py-1.5 text-center">
                <span
                  className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE_CLASS[row.status_tone]}`}
                  title={row.missing.length > 0 ? `Falta: ${row.missing.join(', ')}` : row.days_remaining !== null ? `${row.days_remaining} días de vigencia` : undefined}
                >
                  {row.status_label}
                </span>
              </td>
              <td className="px-1 py-1.5 text-center">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(row);
                  }}
                  title={row.retired ? 'Ver fila' : 'Editar fila'}
                  aria-label={`${row.retired ? 'Ver' : 'Editar'} ${row.full_name}`}
                  className="rounded-lg p-1.5 text-[var(--unilabor-neutral)] hover:bg-slate-100"
                >
                  <Pencil size={14} />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);
