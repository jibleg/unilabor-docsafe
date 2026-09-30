import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CompactListPagerProps {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Etiqueta accesible del selector de tamaño (p. ej. "Puestos por página"). */
  sizeLabel?: string;
}

const navButtonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(0,65,106,0.12)] bg-white text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-40';

/** Paginador compacto para listas en columnas angostas (selector de tamaño + anterior/siguiente). */
export const CompactListPager = ({ page, pageSize, total, pageSizeOptions, onPageChange, onPageSizeChange, sizeLabel = 'Elementos por página' }: CompactListPagerProps) => {
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)] px-4 py-3 text-xs text-[var(--color-brand-700)]">
      <label className="inline-flex items-center gap-1.5">
        <span className="text-[var(--unilabor-neutral)]">Mostrar</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-2 py-1 font-semibold outline-none focus:border-[var(--color-brand-300)]"
          aria-label={sizeLabel}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <span className="tabular-nums text-[var(--unilabor-neutral)]">
        <strong className="text-[var(--color-brand-700)]">{from}</strong>–<strong className="text-[var(--color-brand-700)]">{to}</strong> de{' '}
        <strong className="text-[var(--color-brand-700)]">{total}</strong>
      </span>
      <div className="inline-flex items-center gap-1.5">
        <button type="button" className={navButtonClass} onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Página anterior">
          <ChevronLeft size={14} />
        </button>
        <span className="min-w-[3.5rem] text-center font-semibold tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className={navButtonClass}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Página siguiente"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
