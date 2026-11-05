import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
  /** Para contenedores angostos (columnas laterales): apila el resumen sobre los botones y acorta la etiqueta de página. */
  compact?: boolean;
  /** Tamaños de página a ofrecer. El selector solo aparece si también se pasa `onPageSizeChange`. */
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
}

const buttonClass =
  'inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)] disabled:cursor-not-allowed disabled:opacity-40';

export const Pagination = ({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  loading = false,
  compact = false,
  pageSizeOptions,
  onPageSizeChange,
}: PaginationProps) => {
  if (total === 0) {
    return null;
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  const summary = (
    <span>
      Mostrando <strong>{from}</strong>–<strong>{to}</strong> de <strong>{total}</strong>
    </span>
  );

  return (
    <div
      className={`flex flex-col items-center justify-between gap-3 py-3 text-xs text-[var(--color-brand-700)] ${
        compact ? 'px-0' : 'px-4 sm:flex-row'
      }`}
    >
      {/* Sin selector se devuelve el resumen tal cual, para no alterar los usos que no lo piden. */}
      {onPageSizeChange && pageSizeOptions?.length ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {summary}
          <label className="flex items-center gap-2">
            Por página
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              disabled={loading}
              className="rounded-lg border border-[rgba(0,65,106,0.12)] bg-white/90 px-2 py-1 text-xs font-semibold disabled:opacity-40"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        summary
      )}
      <div className={`flex items-center ${compact ? 'w-full justify-between gap-1' : 'gap-2'}`}>
        <button
          type="button"
          className={buttonClass}
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev}
        >
          <ChevronLeft size={14} />
          Anterior
        </button>
        <span className={`whitespace-nowrap font-semibold ${compact ? '' : 'px-2'}`}>
          {compact ? `${page} / ${totalPages}` : `Página ${page} de ${totalPages}`}
        </span>
        <button
          type="button"
          className={buttonClass}
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext}
        >
          Siguiente
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
