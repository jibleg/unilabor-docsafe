import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
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
}: PaginationProps) => {
  if (total === 0) {
    return null;
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  return (
    <div className="flex flex-col items-center justify-between gap-3 px-4 py-3 text-xs text-[var(--color-brand-700)] sm:flex-row">
      <span>
        Mostrando <strong>{from}</strong>–<strong>{to}</strong> de <strong>{total}</strong>
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev}
        >
          <ChevronLeft size={14} />
          Anterior
        </button>
        <span className="px-2 font-semibold">
          Página {page} de {totalPages}
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
