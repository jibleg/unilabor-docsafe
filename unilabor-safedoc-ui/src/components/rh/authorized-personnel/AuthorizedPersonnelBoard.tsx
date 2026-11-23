import type { AuthorizedPersonnelListing } from '../../../types/models';
import type { AuthorizedPersonnelFocus } from '../../../utils/authorizedPersonnel';

interface AuthorizedPersonnelBoardProps {
  listing: AuthorizedPersonnelListing;
  focus: AuthorizedPersonnelFocus;
  onFocus: (focus: AuthorizedPersonnelFocus) => void;
}

/** TABLERO del REH-REG-026: los mismos renglones del formato; cada uno filtra la tabla. */
export const AuthorizedPersonnelBoard = ({ listing, focus, onFocus }: AuthorizedPersonnelBoardProps) => {
  const { summary } = listing;
  const tiles: Array<{ key: AuthorizedPersonnelFocus; label: string; value: number; hint?: string; tone: string }> = [
    { key: 'ALL', label: 'En el listado', value: summary.rows_total, hint: `${summary.people_total} colaboradores`, tone: 'border-slate-200 bg-slate-50 text-slate-800' },
    { key: 'COMPETENT', label: 'Competentes', value: summary.competent, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    { key: 'AUTHORIZED', label: 'Autorizados', value: summary.authorized, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    { key: 'AUTHORIZED_NOT_COMPETENT', label: 'Autorizados sin ser competentes', value: summary.authorized_not_competent, tone: 'border-rose-200 bg-rose-50 text-rose-800' },
    { key: 'WITHOUT_DATE', label: 'Sin fecha de última evaluación', value: summary.without_evaluation_date, tone: 'border-rose-200 bg-rose-50 text-rose-800' },
    { key: 'EXPIRED', label: 'Competencia vencida', value: summary.expired, hint: 'Recapacitar', tone: 'border-rose-200 bg-rose-50 text-rose-800' },
    { key: 'EXPIRING', label: `Por vencer en ${listing.warning_days} días`, value: summary.expiring_soon, tone: 'border-amber-200 bg-amber-50 text-amber-800' },
    { key: 'RELEASE_LEVEL', label: 'Nivel 4 · liberan informes', value: summary.report_release_level, tone: 'border-slate-200 bg-slate-50 text-slate-800' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      {tiles.map((tile) => (
        <button
          key={tile.key}
          type="button"
          onClick={() => onFocus(focus === tile.key ? 'ALL' : tile.key)}
          aria-pressed={focus === tile.key}
          className={`rounded-2xl border px-3 py-3 text-left transition hover:shadow-md ${tile.tone} ${
            focus === tile.key ? 'ring-2 ring-[var(--color-brand-500)] ring-offset-1' : ''
          }`}
        >
          <span className="block text-2xl font-bold leading-none">{tile.value}</span>
          <span className="mt-1.5 block text-[11px] font-semibold leading-4">{tile.label}</span>
          <span className="block h-4 text-[10px] opacity-70">{tile.hint ?? ''}</span>
        </button>
      ))}
    </div>
  );
};
